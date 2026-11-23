import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChordProEntry } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';
import { processWithGemini } from '@/lib/utils/ai-import';
import { parseChordPro, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import { formatSectionLabel, normalizeSearch, parseLine } from '@/lib/utils/music';
import { AuroraEnergy, useEnergyTask } from '../aurora/energy';
import {
  AuroraButton,
  AuroraDialog,
  AuroraIconButton,
  AuroraProcessingIndicator,
  AuroraSegmented,
  AuroraSuggestionGroup,
  AuroraThinkingSteps,
  UiIcon,
  type ThinkingStepItem,
} from '../aurora/primitives';
import { AuroraLink, navigate, useRoute } from '../router';

type InputMode = 'search' | 'paste' | 'file';

interface SpotifyTrackResult {
  id: string;
  name: string;
  artist: string;
  album?: string;
  albumArt?: string | null;
  durationMs?: number;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function createBlankSong(): ChordProEntry {
  return {
    id: `song-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: [
      '{title: }',
      '{artist: }',
      '{key: C}',
      '{tempo: 120}',
      '{time: 4/4}',
      '',
      '[Verso 1]',
      '[C]Primeira linha da [G]música',
      '[Am]Segunda linha da [F]música',
      '',
      '[Refrão]',
      '[F]Refrão [G]aqui [C]',
    ].join('\n'),
  };
}

export function AddSongView() {
  const route = useRoute();
  const initialQuery = route.params.get('q') ?? '';
  const { addEntry, getSongs, importEntriesDetailed } = useSongStore();
  const entries = useSongStore((s) => s.entries);
  const energy = useEnergyTask();

  const [inputMode, setInputMode] = useState<InputMode>('search');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [pastedSheet, setPastedSheet] = useState('');
  const [choText, setChoText] = useState('');
  const [choStatus, setChoStatus] = useState('');
  const [choIsError, setChoIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [preview, setPreview] = useState<ChordProEntry | null>(null);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [tempoStr, setTempoStr] = useState('120');
  const [previewTab, setPreviewTab] = useState<'rendered' | 'source'>('rendered');
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackResult[]>([]);
  const [selectedSpotifyId, setSelectedSpotifyId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speechRecRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    energy.bloom('anticipating', 3000);
    return () => {
      abortRef.current?.abort();
      try {
        speechRecRef.current?.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    };
  }, [energy.bloom]);

  const previewSong = useMemo(
    () => (preview ? parseChordPro(preview.id, preview.text) : null),
    [preview]
  );

  const previewTitle =
    previewSong && previewSong.title !== preview?.id ? previewSong.title : '';
  const hasValidTitle = Boolean(previewTitle.trim());

  useEffect(() => {
    if (!previewSong) return;
    if (document.activeElement?.id !== 'meta-tempo') {
      setTempoStr(String(previewSong.tempo || 120));
    }
  }, [preview?.id, previewSong?.tempo]);

  const duplicateSong = useMemo(() => {
    void entries;
    const title = previewTitle.trim();
    if (!title) return null;
    const normTitle = normalizeSearch(title);
    const normArtist = normalizeSearch(previewSong?.artist?.trim() ?? '');
    return (
      getSongs().find((s) => {
        if (normalizeSearch(s.title) !== normTitle) return false;
        if (!normArtist) return true;
        return !s.artist || normalizeSearch(s.artist) === normArtist;
      }) ?? null
    );
  }, [entries, getSongs, previewTitle, previewSong?.artist]);

  useEffect(() => {
    if (!previewTitle.trim() || previewTitle.trim() === 'Nova música') return;
    let cancelled = false;
    const query = `${previewTitle} ${previewSong?.artist ?? ''}`.trim();
    fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data) => {
        if (cancelled) return;
        const list: SpotifyTrackResult[] = data.results ?? [];
        setSpotifyResults(list);
        setSelectedSpotifyId(list[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setSpotifyResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [previewTitle, previewSong?.artist]);

  const updateMeta = (key: string, value: string | number) => {
    if (!preview) return;
    setPreviewDirty(true);
    setPreview({ ...preview, text: patchChordProMeta(preview.text, key, value) });
  };

  const toggleVoice = () => {
    if (listening) {
      try {
        speechRecRef.current?.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
      setListening(false);
      energy.rest();
      return;
    }
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setError('Ditado por voz não está disponível neste navegador.');
      return;
    }

    setError('');
    setStatusNote('');
    setListening(true);
    energy.set('receiving');
    try {
      const rec = new SpeechRec();
      speechRecRef.current = rec;
      rec.lang = 'pt-BR';
      rec.interimResults = false;
      rec.onresult = (ev) => {
        const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
        speechRecRef.current = null;
        setListening(false);
        energy.rest();
        if (transcript) setSearchQuery(transcript);
      };
      rec.onerror = () => {
        speechRecRef.current = null;
        setListening(false);
        energy.rest();
      };
      rec.onend = () => {
        speechRecRef.current = null;
        setListening(false);
        energy.rest();
      };
      rec.start();
    } catch {
      speechRecRef.current = null;
      setListening(false);
      energy.rest();
    }
  };

  const handleProcess = async (textOverride?: string) => {
    const activeInput = inputMode === 'paste' ? pastedSheet : searchQuery;
    const clean = (textOverride ?? activeInput).trim();
    if (!clean) {
      setError(
        inputMode === 'paste'
          ? 'Cole a cifra ou letra com acordes primeiro.'
          : 'Informe o nome da música e artista para buscar com IA.'
      );
      return;
    }

    setError('');
    setStatusNote('');
    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    await energy.run(async (set) => {
      set('processing');
      try {
        const entry = await processWithGemini(clean, {
          signal: controller.signal,
          forcePaste: inputMode === 'paste',
        });
        set('responding');
        await new Promise((r) => window.setTimeout(r, 380));
        setPreview(entry);
        setPreviewDirty(false);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível processar a cifra agora. Verifique o servidor backend.'
        );
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    });
  };

  const handleImportCho = () => {
    if (!choText.trim()) {
      setChoIsError(true);
      setChoStatus('Cole ou carregue um arquivo .cho primeiro.');
      return;
    }
    const { imported, skipped } = importEntriesDetailed(choText.trim());
    if (imported > 0) {
      setChoIsError(false);
      setChoStatus(
        `${imported} ${imported === 1 ? 'música importada' : 'músicas importadas'}${skipped > 0 ? ` (${skipped} bloco(s) ignorados)` : ''}.`
      );
      setChoText('');
      window.setTimeout(() => navigate('/'), 1000);
    } else {
      setChoIsError(true);
      setChoStatus('Não foi possível ler o ChordPro. Confira se o texto começa com {title: ...}.');
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    energy.rest();
    setError('');
    setStatusNote('Processamento cancelado.');
  };

  const handleSave = () => {
    if (!preview || !hasValidTitle) return;
    let text = preview.text;
    const parsedTempo = parseInt(tempoStr, 10);
    if (Number.isFinite(parsedTempo)) {
      const clamped = Math.max(40, Math.min(240, parsedTempo));
      text = patchChordProMeta(text, 'tempo', clamped);
    }
    const track = spotifyResults.find((t) => t.id === selectedSpotifyId);
    if (selectedSpotifyId) text = patchChordProMeta(text, 'spotify', selectedSpotifyId);
    if (track?.durationMs) {
      text = patchChordProMeta(text, 'duration', Math.round(track.durationMs / 1000));
    }
    const saved = addEntry({ ...preview, text });
    navigate(`/song/${saved.id}`);
  };

  const thinkingSteps: ThinkingStepItem[] = [
    {
      title: inputMode === 'paste' ? 'Leitura do texto colado' : 'Pesquisa de tom, BPM e cifra',
      detail:
        inputMode === 'paste'
          ? 'Detectando cabeçalhos de seção e posição exata dos acordes.'
          : 'Consultando tonalidade original, capotraste e letra completa.',
      done: energy.state === 'responding' || (!loading && Boolean(preview)),
    },
    {
      title: 'Estruturação em formato ChordPro (.cho)',
      detail: 'Normalizando diretivas {title}, {artist}, {key}, {tempo} e blocos musicais.',
      done: !loading && Boolean(preview),
    },
  ];

  useEffect(() => {
    document.title = 'Nova música - Jamshelf';
  }, []);

  useEffect(() => {
    if (!previewDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [previewDirty]);

  useEffect(() => {
    if (!preview) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById('meta-title')?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [preview?.id]);

  return (
    <main id="main" tabIndex={-1} className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6 focus:outline-none">
      <nav aria-label="Caminho" className="flex items-center gap-1.5 typescale-body-sm text-on-surface-variant">
        <AuroraLink href="/" className="stage-breadcrumb-link">
          Repertório
        </AuroraLink>
        <UiIcon name="chevron_right" size={20} />
        <span className="text-on-surface">Nova música</span>
      </nav>

      <div className="space-y-1">
        <h1 className="typescale-headline-md sm:typescale-display-sm text-on-surface m-0">
          Estúdio de nova música
        </h1>
        <p className="typescale-body-md text-on-surface-variant m-0">
          Busque por nome e artista com IA, cole uma cifra bruta, importe um arquivo .cho ou comece do zero.
        </p>
      </div>

      {!preview ? (
        <AuroraEnergy state={energy.state}>
          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AuroraSegmented<InputMode>
                ariaLabel="Forma de adicionar cifra"
                className="w-full sm:w-auto [&_.stage-segmented-btn]:flex-1 sm:[&_.stage-segmented-btn]:flex-initial"
                value={inputMode}
                onChange={(m) => {
                  setInputMode(m);
                  setError('');
                  setChoStatus('');
                  if (!loading && !listening) {
                    if (m === 'file') energy.rest();
                    else energy.bloom('anticipating', 2200);
                  }
                }}
                options={[
                  { value: 'search', label: 'Buscar com IA', shortLabel: 'IA', icon: 'auto_awesome' },
                  { value: 'paste', label: 'Colar cifra', shortLabel: 'Colar', icon: 'content_paste' },
                  { value: 'file', label: 'Importar .cho', shortLabel: '.cho', icon: 'upload_file' },
                ]}
              />

              <AuroraButton
                color="outlined"
                icon="note_add"
                className="w-full sm:w-auto"
                onClick={() => {
                  setError('');
                  setStatusNote('');
                  setPreviewDirty(false);
                  setPreviewTab('source');
                  setPreview(createBlankSong());
                }}
              >
                Começar em branco
              </AuroraButton>
            </div>

            {inputMode === 'search' && (
              <div
                key="panel-search"
                className="panel-settle rounded-[20px] bg-surface-container-low border border-outline focus-within:border-primary focus-within:ring-2 focus-within:ring-primary p-4 sm:p-5 space-y-3 transition-colors"
              >
                <label htmlFor="ai-song-query" className="typescale-label-lg text-on-surface block">
                  Nome da música, artista ou URL
                </label>
                <input
                  id="ai-song-query"
                  type="text"
                  value={searchQuery}
                  onFocus={() => {
                    if (!loading && !listening && energy.state === 'idle') {
                      energy.bloom('anticipating', 2400);
                    }
                  }}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    if (!searchQuery.trim() && nextVal.trim() && !loading && !listening) {
                      energy.bloom('anticipating', 2200);
                    }
                    setSearchQuery(nextVal);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading) void handleProcess();
                  }}
                  placeholder="Ex.: Tempo Perdido, Legião Urbana..."
                  className="stage-field-borderless text-base sm:text-[1.0625rem]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-outline-variant/45">
                  <span className="typescale-body-sm text-on-surface-variant">
                    {listening
                      ? 'Ouvindo nome da música...'
                      : 'A IA busca tom original, BPM, capo e estrutura em ChordPro'}
                  </span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <AuroraIconButton
                      icon={listening ? 'mic_off' : 'mic'}
                      label="Ditado por voz"
                      variant={listening ? 'tonal' : 'standard'}
                      aria-pressed={listening}
                      onClick={toggleVoice}
                    />
                    {loading && (
                      <AuroraButton color="outlined" onClick={handleCancel}>
                        Cancelar
                      </AuroraButton>
                    )}
                    <AuroraButton
                      color="filled"
                      icon="auto_awesome"
                      disabled={loading || !searchQuery.trim()}
                      onClick={() => void handleProcess()}
                    >
                      {loading ? 'Processando...' : 'Buscar cifra'}
                    </AuroraButton>
                  </div>
                </div>
              </div>
            )}

            {inputMode === 'paste' && (
              <div
                key="panel-paste"
                className="panel-settle rounded-[20px] bg-surface-container-low p-4 sm:p-5 space-y-3"
              >
                <label htmlFor="paste-chord-sheet" className="typescale-label-lg text-on-surface block">
                  Cole a cifra ou letra com acordes
                </label>
                <textarea
                  id="paste-chord-sheet"
                  rows={10}
                  value={pastedSheet}
                  onFocus={() => {
                    if (!loading && !listening && energy.state === 'idle') {
                      energy.bloom('anticipating', 2400);
                    }
                  }}
                  onChange={(e) => setPastedSheet(e.target.value)}
                  placeholder="Cole cifras de qualquer site ou bloco de notas..."
                  className="stage-field font-mono text-xs resize-y"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-outline-variant/45">
                  <span className="typescale-body-sm text-on-surface-variant">
                    A IA detecta seções e posiciona acordes na sílaba certa
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    {loading && (
                      <AuroraButton color="outlined" onClick={handleCancel}>
                        Cancelar
                      </AuroraButton>
                    )}
                    <AuroraButton
                      color="filled"
                      icon="auto_awesome"
                      disabled={loading || !pastedSheet.trim()}
                      onClick={() => void handleProcess()}
                    >
                      {loading ? 'Formatando...' : 'Formatar em ChordPro'}
                    </AuroraButton>
                  </div>
                </div>
              </div>
            )}

            {inputMode === 'file' && (
              <div
                key="panel-file"
                className="panel-settle rounded-[20px] bg-surface-container-low p-4 sm:p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="studio-cho-input" className="typescale-label-lg text-on-surface">
                    Arquivo ChordPro (.cho)
                  </label>
                  <label className="stage-btn stage-btn-tonal typescale-label-lg cursor-pointer focus-within:outline-2 focus-within:outline-primary focus-within:outline-offset-2">
                    <UiIcon name="folder_open" size={20} />
                    <span>Carregar do aparelho</span>
                    <input
                      type="file"
                      accept=".cho,.chordpro,.txt,text/plain"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setChoText(await file.text());
                        setChoStatus('');
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>
                <textarea
                  id="studio-cho-input"
                  rows={10}
                  value={choText}
                  onChange={(e) => setChoText(e.target.value)}
                  placeholder={`{title: Minha música}\n{artist: Artista}\n{key: G}\n\n[Verso 1]\n[G]Letra aqui`}
                  className="stage-field font-mono text-xs resize-y"
                />
                {choStatus && (
                  <div
                    role={choIsError ? 'alert' : 'status'}
                    className={`stage-toast rounded-xl px-4 py-2.5 typescale-body-sm ${
                      choIsError
                        ? 'bg-error-container text-on-error-container'
                        : 'bg-tertiary-container text-on-tertiary-container'
                    }`}
                  >
                    {choStatus}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-outline-variant/45">
                  <span className="typescale-body-sm text-on-surface-variant">
                    Aceita uma ou várias músicas separadas por ---
                  </span>
                  <AuroraButton
                    color="filled"
                    icon="upload_file"
                    disabled={!choText.trim()}
                    onClick={handleImportCho}
                    className="ml-auto"
                  >
                    Importar para o repertório
                  </AuroraButton>
                </div>
              </div>
            )}

            {loading && (
              <div className="space-y-3">
                <AuroraProcessingIndicator
                  state={energy.state}
                  label="Processando cifra com IA"
                />
                <AuroraThinkingSteps
                  steps={thinkingSteps}
                  summary="Etapas do processamento"
                  defaultExpanded
                />
              </div>
            )}

            {statusNote && !error && (
              <div
                role="status"
                className="stage-toast rounded-2xl bg-surface-container-high text-on-surface px-4 py-3 typescale-body-md"
              >
                {statusNote}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="stage-toast rounded-2xl bg-error-container text-on-error-container px-4 py-3 typescale-body-md"
              >
                {error}
              </div>
            )}

            {inputMode === 'search' && !loading && (
              <AuroraSuggestionGroup
                ariaLabel="Exemplos rápidos para buscar"
                items={[
                  { label: 'Tempo Perdido · Legião Urbana', prompt: 'Tempo Perdido Legião Urbana', icon: 'music_note' },
                  { label: 'Anna Júlia · Los Hermanos', prompt: 'Anna Júlia Los Hermanos', icon: 'music_note' },
                  { label: 'Wonderwall · Oasis', prompt: 'Wonderwall Oasis', icon: 'music_note' },
                ]}
                onSelect={(p) => {
                  setSearchQuery(p);
                  void handleProcess(p);
                }}
              />
            )}

            <p className="typescale-body-sm text-on-surface-variant m-0">
              Cifras geradas ou formatadas com IA podem conter imprecisões. Revise acordes e tom antes de salvar.
            </p>
          </div>
        </AuroraEnergy>
      ) : (
        <div className="panel-settle space-y-5">
          {duplicateSong && (
            <div
              role="status"
              className="rounded-2xl bg-warn-bg text-warn-ink px-4 py-3 flex flex-wrap items-center justify-between gap-2"
            >
              <span className="typescale-body-md">
                Já existe "{duplicateSong.title}" no seu repertório. Salvar criará uma cópia separada.
              </span>
              <AuroraButton
                color="outlined"
                onClick={() => navigate(`/song/${duplicateSong.id}`)}
              >
                Abrir existente
              </AuroraButton>
            </div>
          )}

          <div className="stage-card p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="meta-title" className="typescale-label-sm text-on-surface-variant block">
                  Título *
                </label>
                <input
                  id="meta-title"
                  type="text"
                  required
                  aria-required="true"
                  placeholder="Ex.: Tempo Perdido"
                  value={previewTitle}
                  onChange={(e) => updateMeta('title', e.target.value)}
                  className="stage-field"
                />
                {!hasValidTitle && (
                  <p className="typescale-body-sm text-on-surface-variant m-0">
                    Informe o título para liberar o botão Salvar.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label htmlFor="meta-artist" className="typescale-label-sm text-on-surface-variant block">
                  Artista
                </label>
                <input
                  id="meta-artist"
                  type="text"
                  placeholder="Ex.: Legião Urbana"
                  value={previewSong?.artist ?? ''}
                  onChange={(e) => updateMeta('artist', e.target.value)}
                  className="stage-field"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label htmlFor="meta-key" className="typescale-label-sm text-on-surface-variant block">
                  Tom
                </label>
                <input
                  id="meta-key"
                  type="text"
                  placeholder="Ex.: G"
                  value={previewSong?.originalKey ?? ''}
                  onChange={(e) => updateMeta('key', e.target.value)}
                  className="stage-field font-mono"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="meta-capo" className="typescale-label-sm text-on-surface-variant block">
                  Capo
                </label>
                <input
                  id="meta-capo"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={12}
                  value={previewSong?.capo ?? 0}
                  onChange={(e) =>
                    updateMeta('capo', Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0)))
                  }
                  className="stage-field font-mono"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="meta-tempo" className="typescale-label-sm text-on-surface-variant block">
                  BPM
                </label>
                <input
                  id="meta-tempo"
                  type="number"
                  inputMode="numeric"
                  min={40}
                  max={240}
                  value={tempoStr}
                  onChange={(e) => setTempoStr(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(tempoStr, 10);
                    const clamped = Math.max(40, Math.min(240, Number.isFinite(parsed) ? parsed : 120));
                    setTempoStr(String(clamped));
                    updateMeta('tempo', clamped);
                  }}
                  className="stage-field font-mono"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="meta-time" className="typescale-label-sm text-on-surface-variant block">
                  Compasso
                </label>
                <select
                  id="meta-time"
                  value={previewSong?.timeSignature ?? '4/4'}
                  onChange={(e) => updateMeta('time', e.target.value)}
                  className="stage-field font-mono"
                >
                  <option value="4/4">4/4</option>
                  <option value="3/4">3/4</option>
                  <option value="6/8">6/8</option>
                  <option value="2/4">2/4</option>
                  <option value="5/4">5/4</option>
                  <option value="7/8">7/8</option>
                </select>
              </div>
            </div>

            {spotifyResults.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-outline-variant/60">
                <div className="typescale-label-sm text-on-surface-variant">
                  Referência no Spotify (preenche duração automaticamente)
                </div>
                <div className="flex flex-wrap gap-2">
                  {spotifyResults.slice(0, 3).map((track) => {
                    const selected = selectedSpotifyId === track.id;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setSelectedSpotifyId((curr) => (curr === track.id ? null : track.id))
                        }
                        className={`stage-chip typescale-label-lg ${
                          selected ? 'bg-secondary-container text-on-secondary-container border-transparent' : ''
                        }`}
                      >
                        {track.albumArt ? (
                          <img
                            src={track.albumArt}
                            alt=""
                            width={22}
                            height={22}
                            className="w-5 h-5 rounded-md object-cover flex-shrink-0"
                          />
                        ) : (
                          <UiIcon name="headphones" size={20} />
                        )}
                        <span>
                          {track.name} · {track.artist}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-pressed={selectedSpotifyId === null}
                    onClick={() => setSelectedSpotifyId(null)}
                    className={`stage-chip typescale-label-sm ${
                      selectedSpotifyId === null
                        ? 'bg-secondary-container text-on-secondary-container border-transparent'
                        : ''
                    }`}
                  >
                    Sem vínculo
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <AuroraSegmented<'rendered' | 'source'>
              ariaLabel="Visualização da prévia"
              value={previewTab}
              onChange={setPreviewTab}
              options={[
                { value: 'rendered', label: 'Prévia da cifra', icon: 'visibility' },
                { value: 'source', label: 'Editar ChordPro', icon: 'code' },
              ]}
            />
            <div className="flex items-center gap-2">
              <AuroraButton
                color="outlined"
                onClick={() => {
                  if (previewDirty || hasValidTitle) setConfirmDiscardOpen(true);
                  else setPreview(null);
                }}
              >
                Voltar
              </AuroraButton>
              <AuroraButton
                color="filled"
                icon="check"
                disabled={!hasValidTitle}
                onClick={handleSave}
              >
                Salvar no repertório
              </AuroraButton>
            </div>
          </div>

          {previewTab === 'source' ? (
            <div className="space-y-2">
              <p className="typescale-body-sm text-on-surface-variant m-0">
                Use [Acorde] antes da palavra e [Verso 1] ou [Refrão] para nomear seções.
              </p>
              <textarea
                aria-label="Código fonte ChordPro da nova música"
                rows={18}
                value={preview.text}
                onChange={(e) => {
                  setPreviewDirty(true);
                  setPreview({ ...preview, text: e.target.value });
                }}
                className="stage-field font-mono text-xs resize-y"
              />
            </div>
          ) : (
            <div className="stage-card p-6 space-y-5">
              {previewSong?.sections.map((sec, si) => (
                <div
                  key={si}
                  className={`rounded-2xl p-4 space-y-2.5 ${
                    sec.type === 'chorus' ? 'bg-chorus-surface' : 'bg-surface-container-low'
                  }`}
                >
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full typescale-label-sm ${
                      sec.type === 'chorus'
                        ? 'bg-primary-container text-on-primary-container'
                        : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    {formatSectionLabel(sec.label)}
                  </span>
                  <div className="space-y-3">
                    {sec.lines.map((line, li) => {
                      const segs = parseLine(line);
                      return (
                        <div key={li} className="pt-5 leading-[1.4] typescale-body-lg">
                          {segs.map((seg, sgi) => {
                            if (!seg.chord) {
                              return (
                                <span key={sgi} className="text-on-surface whitespace-pre-wrap">
                                  {seg.text}
                                </span>
                              );
                            }
                            const nextHasChord = Boolean(segs[sgi + 1]?.chord);
                            const prevEndedSpace = sgi > 0 && /\s$/.test(segs[sgi - 1].text);
                            const hasLyrics = seg.text.trim().length > 0;
                            if (!hasLyrics) {
                              return (
                                <span
                                  key={sgi}
                                  className="relative inline-block leading-none mr-3"
                                  style={{ minWidth: `${Math.max(seg.chord.length + 0.5, 2.5)}ch` }}
                                >
                                  <span className="font-mono font-bold text-primary text-sm absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap">
                                    {seg.chord}
                                  </span>
                                  <span className="text-on-surface whitespace-pre leading-[1.4]">
                                    {seg.text || '\u00A0'}
                                  </span>
                                </span>
                              );
                            }
                            const wm = seg.text.match(/^(\s*)(\S+)(.*)$/);
                            const rawLead = wm ? wm[1] : '';
                            const leadSpace = sgi === 0 || prevEndedSpace ? '' : rawLead;
                            const anchor = wm ? wm[2] : seg.text;
                            const tail = wm ? wm[3] : '';
                            const tightToNext = nextHasChord && !tail.trim();
                            return (
                              <span key={sgi}>
                                {leadSpace && <span className="whitespace-pre">{leadSpace}</span>}
                                <span
                                  className="relative inline-block leading-none"
                                  style={{
                                    minWidth:
                                      tightToNext && anchor.length < seg.chord.length
                                        ? `${seg.chord.length + 0.8}ch`
                                        : undefined,
                                  }}
                                >
                                  <span className="font-mono font-bold text-primary text-sm absolute left-0 bottom-[calc(100%+3px)] leading-none whitespace-nowrap">
                                    {seg.chord}
                                  </span>
                                  <span className="text-on-surface whitespace-pre leading-[1.4]">
                                    {anchor}
                                  </span>
                                </span>
                                {tail && <span className="text-on-surface whitespace-pre-wrap">{tail}</span>}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AuroraDialog
        open={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        title="Descartar alterações não salvas?"
        subtitle="Voltar para a busca apagará as edições feitas nesta prévia."
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <AuroraButton color="outlined" onClick={() => setConfirmDiscardOpen(false)}>
            Continuar editando
          </AuroraButton>
          <AuroraButton
            color="danger"
            onClick={() => {
              setConfirmDiscardOpen(false);
              setPreviewDirty(false);
              setPreview(null);
            }}
          >
            Descartar
          </AuroraButton>
        </div>
      </AuroraDialog>
    </main>
  );
}

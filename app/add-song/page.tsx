'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { processWithGemini } from '@/lib/utils/ai-import';
import { parseChordPro, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import { normalizeSearch } from '@/lib/utils/music';
import { navigateWithTransition, runStateViewTransition } from '@/lib/utils/view-transition';
import type { ChordProEntry } from '@/lib/types/song';
import type { SpotifyTrackResult } from '@/lib/spotify';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import { TransitionLink } from '@/components/ui/TransitionLink';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';

type InputMode = 'paste' | 'search';

function createBlankSongEntry(): ChordProEntry {
  const id = `song-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    text: [
      '{title: Nova música}',
      '{artist: }',
      '{key: C}',
      '{tempo: 120}',
      '{time: 4/4}',
      '',
      '{comment: Verso 1}',
      '[C]Primeira linha da [G]música',
      '[Am]Segunda linha da [F]música',
      '',
      '{comment: Refrão}',
      '[F]Refrão [G]aqui [C]',
    ].join('\n'),
  };
}

export default function AddSongPage() {
  const router = useRouter();
  const { addEntry, getSongs } = useSongStore();
  const entries = useSongStore((s) => s.entries);
  const [inputMode, setInputMode] = useState<InputMode>('paste');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ChordProEntry | null>(null);
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackResult[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [selectedSpotifyId, setSelectedSpotifyId] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const previewSong = preview ? parseChordPro(preview.id, preview.text) : null;

  const duplicateSong = useMemo(() => {
    void entries;
    const title = previewSong?.title?.trim();
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
  }, [entries, getSongs, previewSong?.title, previewSong?.artist]);

  useEffect(() => {
    if (!previewSong?.title || previewSong.title.trim() === 'Nova música') return;
    let cancelled = false;
    setSpotifyLoading(true);
    const query = `${previewSong.title} ${previewSong.artist}`.trim();
    fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const results: SpotifyTrackResult[] = data.results ?? [];
        setSpotifyResults(results);
        setSelectedSpotifyId(results[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setSpotifyResults([]);
      })
      .finally(() => {
        if (!cancelled) setSpotifyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewSong?.title, previewSong?.artist]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const updatePreviewMeta = (key: string, value: string | number) => {
    if (!preview) return;
    const newText = patchChordProMeta(preview.text, key, value);
    setPreview({
      ...preview,
      text: newText,
    });
  };

  const handleCancelProcess = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setError('Processamento cancelado.');
  };

  const handleProcess = async () => {
    if (!rawText.trim()) {
      setError(
        inputMode === 'paste'
          ? 'Cole a cifra ou letra com acordes primeiro.'
          : 'Digite o nome da música e artista para buscar com IA.'
      );
      return;
    }
    setError('');
    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const entry = await processWithGemini(rawText.trim(), {
        signal: controller.signal,
        forcePaste: inputMode === 'paste',
      });
      runStateViewTransition(() => setPreview(entry), 'morph');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Não foi possível processar a cifra.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const handleStartBlank = () => {
    setError('');
    setSpotifyResults([]);
    setSelectedSpotifyId(null);
    runStateViewTransition(() => setPreview(createBlankSongEntry()), 'morph');
  };

  const canSave = Boolean(preview && previewSong?.title?.trim());

  const handleConfirm = () => {
    if (!preview || !previewSong?.title?.trim()) return;
    let text = preview.text;
    const selectedTrack = spotifyResults.find((t) => t.id === selectedSpotifyId);
    if (selectedSpotifyId) {
      text = patchChordProMeta(text, 'spotify', selectedSpotifyId);
    }
    if (selectedTrack?.durationMs) {
      text = patchChordProMeta(text, 'duration', Math.round(selectedTrack.durationMs / 1000));
    }
    const saved = addEntry({ ...preview, text });
    navigateWithTransition(router, `/song/${saved.id}`, { songId: saved.id, direction: 'forward' });
  };

  return (
    <div className="flex-1 flex flex-col">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Nova música' }]} />

      <main id="main-content" className="gm3-page-enter flex-1 w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <div className="w-full space-y-5">
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold text-[var(--ink)]">Nova música</h1>
            <p className="text-sm text-[var(--muted)]">
              Cole uma cifra pronta, busque por nome e artista com IA ou comece uma cifra em branco.
            </p>
          </div>

          {!preview ? (
            <div className="gm3-card rounded-[24px] bg-[var(--surface)] p-6 space-y-4">
              {/* Mode selector with GPU sliding indicator */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ConnectedGroup value={inputMode} ariaLabel="Como deseja criar a cifra" subtle>
                  <button
                    type="button"
                    aria-pressed={inputMode === 'paste'}
                    onClick={() => {
                      setInputMode('paste');
                      setError('');
                    }}
                    className="gm3-connected-btn px-4 h-10 text-xs font-semibold cursor-pointer"
                  >
                    Colar cifra
                  </button>
                  <button
                    type="button"
                    aria-pressed={inputMode === 'search'}
                    onClick={() => {
                      setInputMode('search');
                      setError('');
                    }}
                    className="gm3-connected-btn px-4 h-10 text-xs font-semibold cursor-pointer"
                  >
                    Buscar com IA
                  </button>
                </ConnectedGroup>

                <button
                  type="button"
                  onClick={handleStartBlank}
                  disabled={loading}
                  className="pill-btn bg-[var(--bg)] h-9 px-4 text-xs"
                >
                  Criar em branco
                </button>
              </div>

              <div>
                <label htmlFor="raw-song-input" className="field-label block mb-2">
                  {inputMode === 'paste'
                    ? 'Cifra colada (mantém sua versão e formata para ChordPro)'
                    : 'Nome da música e artista (ou URL de cifra)'}
                </label>
                <textarea
                  id="raw-song-input"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={inputMode === 'paste' ? 12 : 4}
                  placeholder={
                    inputMode === 'paste'
                      ? 'Cole aqui a cifra completa com acordes acima da letra ou já em ChordPro...'
                      : 'Ex.: Evidências - Chitãozinho e Xororó'
                  }
                  className="studio-input w-full px-4 py-3 font-mono text-xs sm:text-sm resize-y"
                />
              </div>

              <div
                className="gm3-collapsible"
                data-compact-slot="true"
                data-collapsed={!error ? 'true' : undefined}
                aria-hidden={!error || undefined}
                inert={!error || undefined}
              >
                <div className="gm3-collapsible-inner">
                  {error && (
                    <div
                      role="alert"
                      className="text-sm font-medium text-[var(--on-rec-container)] bg-[var(--rec-dim)] rounded-2xl px-4 py-3"
                    >
                      {error}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {loading && (
                  <button
                    type="button"
                    onClick={handleCancelProcess}
                    className="pill-btn bg-[var(--bg)] h-11 px-5 text-sm"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={loading}
                  className="pill-btn pill-btn-primary h-11 px-6 text-sm"
                >
                  {loading
                    ? 'Processando com IA…'
                    : inputMode === 'paste'
                    ? 'Converter para ChordPro'
                    : 'Buscar e gerar cifra'}
                </button>
              </div>
            </div>
          ) : previewSong ? (
            <div className="space-y-5">
              {/* Duplicate title warning (glides open/closed) */}
              <div
                className="gm3-collapsible"
                data-compact-slot="true"
                data-collapsed={!duplicateSong ? 'true' : undefined}
                aria-hidden={!duplicateSong || undefined}
                inert={!duplicateSong || undefined}
              >
                <div className="gm3-collapsible-inner">
                  {duplicateSong && (
                    <div
                      role="status"
                      className="rounded-2xl bg-[var(--warn-dim)] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-[var(--ink)]"
                    >
                      <span>
                        Já existe uma música chamada <strong>{duplicateSong.title}</strong>
                        {duplicateSong.artist ? ` (${duplicateSong.artist})` : ''} no seu repertório.
                      </span>
                      <TransitionLink
                        href={`/song/${duplicateSong.id}`}
                        vtSongId={duplicateSong.id}
                        vtDirection="forward"
                        className="font-semibold text-[var(--accent-ink)] hover:underline"
                      >
                        Abrir existente
                      </TransitionLink>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata editor */}
              <div className="gm3-card bg-[var(--surface)] rounded-[24px] p-6 space-y-4">
                <h2 className="font-display text-sm font-semibold text-[var(--ink)]">Dados da música</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="song-title" className="block field-label mb-1.5">
                      Título *
                    </label>
                    <input
                      id="song-title"
                      type="text"
                      required
                      value={previewSong.title}
                      onChange={(e) => updatePreviewMeta('title', e.target.value)}
                      placeholder="Nome da música"
                      className="studio-input w-full px-3 py-2 text-sm"
                    />
                    {!previewSong.title.trim() && (
                      <p className="text-xs text-[var(--rec)] mt-1">Informe um título para salvar.</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="song-artist" className="block field-label mb-1.5">
                      Artista
                    </label>
                    <input
                      id="song-artist"
                      type="text"
                      value={previewSong.artist}
                      onChange={(e) => updatePreviewMeta('artist', e.target.value)}
                      placeholder="Nome da banda ou artista"
                      className="studio-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="song-key" className="block field-label mb-1.5">
                      Tom
                    </label>
                    <input
                      id="song-key"
                      type="text"
                      value={previewSong.originalKey}
                      onChange={(e) => updatePreviewMeta('key', e.target.value)}
                      className="studio-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="song-capo" className="block field-label mb-1.5">
                      Capo
                    </label>
                    <input
                      id="song-capo"
                      type="number"
                      value={previewSong.capo}
                      min={0}
                      max={12}
                      onChange={(e) => updatePreviewMeta('capo', Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0)))}
                      className="studio-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="song-tempo" className="block field-label mb-1.5">
                      Tempo (BPM)
                    </label>
                    <input
                      id="song-tempo"
                      type="number"
                      value={previewSong.tempo}
                      min={40}
                      max={240}
                      onChange={(e) =>
                        updatePreviewMeta('tempo', Math.max(40, Math.min(240, parseInt(e.target.value, 10) || 120)))
                      }
                      className="studio-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="song-time" className="block field-label mb-1.5">
                      Compasso
                    </label>
                    <select
                      id="song-time"
                      value={previewSong.timeSignature}
                      onChange={(e) => updatePreviewMeta('time', e.target.value)}
                      className="studio-input w-full px-3 py-2 text-sm font-mono"
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
              </div>

              {/* Split ChordPro + Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="gm3-card lg:col-span-5 bg-[var(--surface)] rounded-[24px] overflow-hidden flex flex-col">
                  <div className="px-5 py-3 bg-[var(--surface-high)] flex justify-between items-center">
                    <label htmlFor="preview-chordpro-source" className="field-label">
                      Fonte ChordPro
                    </label>
                    <span className="font-mono text-xs text-[var(--muted)]">Editável</span>
                  </div>
                  <textarea
                    id="preview-chordpro-source"
                    value={preview.text}
                    onChange={(e) => setPreview({ ...preview, text: e.target.value })}
                    rows={18}
                    spellCheck={false}
                    className="w-full p-5 bg-[var(--surface)] text-[var(--ink)] font-mono text-xs leading-relaxed resize-none h-[460px] overflow-y-auto focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                  />
                </div>

                <div className="gm3-card lg:col-span-7 bg-[var(--surface)] rounded-[24px] overflow-hidden flex flex-col">
                  <div className="px-5 py-3 bg-[var(--surface-high)] flex justify-between items-center">
                    <span className="field-label">Prévia da cifra</span>
                    <span className="font-mono text-xs text-[var(--muted)]">Em tempo real</span>
                  </div>
                  <div className="h-[460px] overflow-y-auto bg-[var(--bg)]">
                    <ChordSheet song={previewSong} onChordTap={() => {}} allowMultiColumn={false} />
                  </div>
                </div>
              </div>

              {/* Spotify match */}
              {spotifyLoading ? (
                <div className="text-xs font-mono text-[var(--muted)]">Buscando referência no Spotify…</div>
              ) : spotifyResults.length > 0 ? (
                <div className="gm3-card bg-[var(--surface)] rounded-[24px] p-5 space-y-3">
                  <div className="field-label">Referência no Spotify (opcional)</div>
                  <div className="space-y-1.5">
                    {spotifyResults.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        aria-pressed={selectedSpotifyId === track.id}
                        onClick={() => setSelectedSpotifyId(track.id)}
                        className={`gm3-menu-item w-full flex items-center gap-3 p-2.5 text-left cursor-pointer ${
                          selectedSpotifyId === track.id
                            ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                            : 'bg-[var(--bg)] hover:bg-[var(--surface-high)]'
                        }`}
                      >
                        {track.albumArt ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={track.albumArt} alt="" width={40} height={40} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-[var(--surface2)] flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-display font-medium text-[var(--ink)] truncate">{track.name}</div>
                          <div className="text-xs text-[var(--muted)] truncate">{track.artist}</div>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={selectedSpotifyId === null}
                      onClick={() => setSelectedSpotifyId(null)}
                      className={`pill-btn px-3.5 h-9 text-xs ${
                        selectedSpotifyId === null ? 'pill-btn-primary' : 'bg-[var(--bg)]'
                      }`}
                    >
                      Sem vínculo com Spotify
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(true)}
                  className="pill-btn h-11 px-5 text-sm"
                >
                  Tentar novamente
                </button>
                <button
                  type="button"
                  disabled={!canSave}
                  onClick={handleConfirm}
                  className="pill-btn pill-btn-primary h-11 px-6 text-sm"
                >
                  Salvar no repertório
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Descartar esta prévia?"
        description="As edições feitas nos metadados e no código ChordPro desta nova música serão descartadas."
        confirmLabel="Descartar"
        danger
        onConfirm={() => {
          setConfirmResetOpen(false);
          runStateViewTransition(() => setPreview(null), 'morph');
        }}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}

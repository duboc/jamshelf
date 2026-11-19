'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { processWithGemini } from '@/lib/utils/ai-import';
import { parseChordPro, patchChordProMeta } from '@/lib/utils/chordpro-parser';
import type { ChordProEntry } from '@/lib/types/song';
import type { SpotifyTrackResult } from '@/lib/spotify';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';

export default function AddSongPage() {
  const router = useRouter();
  const { addEntry } = useSongStore();
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ChordProEntry | null>(null);
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackResult[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [selectedSpotifyId, setSelectedSpotifyId] = useState<string | null>(null);

  const previewSong = preview ? parseChordPro(preview.id, preview.text) : null;

  useEffect(() => {
    if (!previewSong?.title) return;
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

  const updatePreviewMeta = (key: string, value: string | number) => {
    if (!preview) return;
    const newText = patchChordProMeta(preview.text, key, value);
    setPreview({
      ...preview,
      text: newText,
    });
  };

  const handleProcess = async () => {
    if (!rawText.trim()) {
      setError('Cole uma cifra ou digite o nome da música primeiro.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const entry = await processWithGemini(rawText.trim());
      setPreview(entry);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível processar a cifra.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    const text = selectedSpotifyId
      ? patchChordProMeta(preview.text, 'spotify', selectedSpotifyId)
      : preview.text;
    const saved = addEntry({ ...preview, text });
    router.push(`/song/${saved.id}`);
  };

  return (
    <div className="flex-1 flex flex-col">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Nova música' }]} />

      <main className="flex-1 w-full px-4 sm:px-6 py-6 sm:py-8">
        <div className={`${preview ? 'max-w-5xl' : 'max-w-3xl'} mx-auto space-y-6 transition-all duration-300`}>
          <div className="space-y-1">
            <div className="eyebrow">Repertório</div>
            <h1 className="font-display text-3xl sm:text-4xl text-[var(--ink)]">Nova música</h1>
            <p className="text-sm text-[var(--muted)]">
              Cole uma cifra pronta (formatada direto sem alterar sua versão) ou digite o nome e artista para buscar com IA.
            </p>
          </div>

          {!preview ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4">
              <div>
                <label htmlFor="raw-song-input" className="eyebrow block mb-2">
                  Cifra colada, nome da música ou URL
                </label>
                <textarea
                  id="raw-song-input"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={14}
                  placeholder="Ex.: 'Evidências Chitãozinho e Xororó' ou cole aqui a cifra completa com letra e acordes..."
                  className="studio-input w-full px-4 py-3 font-mono text-xs sm:text-sm resize-y"
                />
              </div>

              {error && (
                <div className="text-sm text-[var(--rec)] bg-[var(--rec)]/10 border border-[var(--rec)]/30 rounded-xl px-4 py-2.5">
                  {error}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={loading}
                  className="pill-btn pill-btn-primary px-6 py-2.5 text-sm"
                >
                  {loading ? 'Processando com IA...' : 'Converter para ChordPro'}
                </button>
              </div>
            </div>
          ) : previewSong ? (
            <div className="space-y-6">
              {/* Metadata editor */}
              <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-5 space-y-4">
                <div className="eyebrow">Dados da música</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block eyebrow mb-1.5">Título</label>
                    <input
                      type="text"
                      value={previewSong.title}
                      onChange={(e) => updatePreviewMeta('title', e.target.value)}
                      className="studio-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block eyebrow mb-1.5">Artista</label>
                    <input
                      type="text"
                      value={previewSong.artist}
                      onChange={(e) => updatePreviewMeta('artist', e.target.value)}
                      className="studio-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block eyebrow mb-1.5">Tom</label>
                    <input
                      type="text"
                      value={previewSong.originalKey}
                      onChange={(e) => updatePreviewMeta('key', e.target.value)}
                      className="studio-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block eyebrow mb-1.5">Capo</label>
                    <input
                      type="number"
                      value={previewSong.capo}
                      min={0}
                      max={12}
                      onChange={(e) => updatePreviewMeta('capo', parseInt(e.target.value) || 0)}
                      className="studio-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block eyebrow mb-1.5">Tempo (BPM)</label>
                    <input
                      type="number"
                      value={previewSong.tempo}
                      min={20}
                      max={300}
                      onChange={(e) => updatePreviewMeta('tempo', parseInt(e.target.value) || 120)}
                      className="studio-input w-full px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block eyebrow mb-1.5">Compasso</label>
                    <select
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
                <div className="lg:col-span-5 bg-[var(--surface)] rounded-2xl border border-[var(--line)] overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-[var(--line)] flex justify-between items-center">
                    <span className="eyebrow">Fonte ChordPro</span>
                    <span className="font-mono text-[10.5px] text-[var(--muted)]">Editável</span>
                  </div>
                  <textarea
                    value={preview.text}
                    onChange={(e) => setPreview({ ...preview, text: e.target.value })}
                    rows={18}
                    className="w-full p-4 bg-[var(--bg)]/50 text-[var(--ink)] font-mono text-xs leading-relaxed outline-none resize-none h-[420px] overflow-y-auto"
                    title="Editar código ChordPro"
                  />
                </div>

                <div className="lg:col-span-7 bg-[var(--surface)] rounded-2xl border border-[var(--line)] overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-[var(--line)] flex justify-between items-center">
                    <span className="eyebrow">Prévia da cifra</span>
                    <span className="font-mono text-[10.5px] text-[var(--muted)]">Em tempo real</span>
                  </div>
                  <div className="h-[420px] overflow-y-auto bg-[var(--bg)]/40">
                    <ChordSheet song={previewSong} onChordTap={() => {}} />
                  </div>
                </div>
              </div>

              {/* Spotify match */}
              {spotifyLoading ? (
                <div className="text-xs font-mono text-[var(--muted)]">Buscando referência no Spotify...</div>
              ) : spotifyResults.length > 0 ? (
                <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] p-4 space-y-2.5">
                  <div className="eyebrow">Referência no Spotify (opcional)</div>
                  <div className="space-y-1.5">
                    {spotifyResults.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => setSelectedSpotifyId(track.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                          selectedSpotifyId === track.id
                            ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                            : 'border-[var(--line)] hover:bg-[var(--surface2)]/60'
                        }`}
                      >
                        {track.albumArt ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={track.albumArt} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-[var(--surface2)] flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--ink)] truncate">{track.name}</div>
                          <div className="text-xs text-[var(--muted)] truncate">{track.artist}</div>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedSpotifyId(null)}
                      className={`pill-btn px-3 py-1 text-xs ${
                        selectedSpotifyId === null ? 'pill-btn-primary' : ''
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
                  onClick={() => setPreview(null)}
                  className="pill-btn px-5 py-2.5 text-sm"
                >
                  Tentar novamente
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="pill-btn pill-btn-primary px-6 py-2.5 text-sm"
                >
                  Salvar no repertório
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

'use client';

import type { SpotifyTrackResult } from '@/lib/spotify';

interface SpotifySectionProps {
  spotifyTrackId: string | null;
  showPreview: boolean;
  showPicker: boolean;
  results: SpotifyTrackResult[];
  loading: boolean;
  suggestionDismissed: boolean;
  showMoreSuggestions: boolean;
  onSelect: (trackId: string) => void;
  onClear: () => void;
  onDismissSuggestion: () => void;
  onToggleMoreSuggestions: () => void;
  onClosePicker: () => void;
}

export function SpotifySection({
  spotifyTrackId,
  showPreview,
  showPicker,
  results,
  loading,
  suggestionDismissed,
  showMoreSuggestions,
  onSelect,
  onClear,
  onDismissSuggestion,
  onToggleMoreSuggestions,
  onClosePicker,
}: SpotifySectionProps) {
  return (
    <>
      {/* Embedded player */}
      {showPreview && spotifyTrackId && (
        <div className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)]/60 px-4 sm:px-6 py-2.5">
          <div className="max-w-5xl mx-auto">
            <iframe
              key={spotifyTrackId}
              src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator`}
              width="100%"
              height="152"
              style={{ border: 0, borderRadius: '12px' }}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Automatic suggestion banner for unmatched songs */}
      {!spotifyTrackId && !suggestionDismissed && results.length > 0 && (
        <div className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--accent-dim)]/55 px-4 sm:px-6 py-2.5">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3">
              {results[0].albumArt ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={results[0].albumArt}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[var(--surface2)] flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="eyebrow text-[var(--accent-ink)]">Sugestão no Spotify</div>
                <div className="text-sm font-semibold text-[var(--ink)] truncate">
                  {results[0].name}{' '}
                  <span className="font-normal text-[var(--muted)]">· {results[0].artist}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(results[0].id)}
                  className="pill-btn pill-btn-primary px-3 py-1 text-xs"
                >
                  Vincular
                </button>
                {results.length > 1 && (
                  <button
                    type="button"
                    onClick={onToggleMoreSuggestions}
                    className="pill-btn px-2.5 py-1 text-xs"
                  >
                    {showMoreSuggestions ? 'Ocultar' : `+${results.length - 1}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDismissSuggestion}
                  title="Dispensar"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer text-lg"
                >
                  &times;
                </button>
              </div>
            </div>

            {showMoreSuggestions && (
              <div className="mt-2.5 space-y-1.5 pl-13">
                {results.slice(1).map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => onSelect(track.id)}
                    className="w-full flex items-center gap-2.5 p-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface2)] text-left transition-colors cursor-pointer"
                  >
                    {track.albumArt ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.albumArt} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-[var(--surface2)] flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--ink)] truncate">{track.name}</div>
                      <div className="text-[11px] text-[var(--muted)] truncate">{track.artist}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Spotify picker modal */}
      {showPicker && (
        <div
          className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={onClosePicker}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3"
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="eyebrow">Spotify</div>
                <h3 className="font-display text-xl text-[var(--ink)]">Escolher faixa de referência</h3>
              </div>
              <button
                type="button"
                onClick={onClosePicker}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer text-lg"
              >
                &times;
              </button>
            </div>

            {loading ? (
              <div className="text-xs font-mono text-[var(--muted)] py-6 text-center">
                Buscando no Spotify…
              </div>
            ) : results.length === 0 ? (
              <div className="text-xs text-[var(--muted)] py-6 text-center">
                Nenhuma faixa encontrada.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {results.map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => onSelect(track.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-colors cursor-pointer ${
                      spotifyTrackId === track.id
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--line)] hover:bg-[var(--surface2)]/70'
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
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              {spotifyTrackId ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-xs text-[var(--rec)] hover:underline cursor-pointer"
                >
                  Remover vínculo
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={onClosePicker} className="pill-btn px-3.5 py-1.5 text-xs">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

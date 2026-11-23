'use client';

import { useRef } from 'react';
import type { SpotifyTrackResult } from '@/lib/spotify';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence } from '@/lib/hooks/use-animated-presence';
import { CloseIcon } from '@/components/ui/Icons';
import { SpotifyWebPlayer } from './SpotifyWebPlayer';

interface SpotifySectionProps {
  spotifyTrackId: string | null;
  songTitle?: string;
  songArtist?: string;
  showPreview: boolean;
  showPicker: boolean;
  results: SpotifyTrackResult[];
  loading: boolean;
  suggestionDismissed: boolean;
  showMoreSuggestions: boolean;
  oauthError?: string | null;
  onDismissOauthError?: () => void;
  onSelect: (trackId: string) => void;
  onClear: () => void;
  onDismissSuggestion: () => void;
  onToggleMoreSuggestions: () => void;
  onClosePicker: () => void;
}

export function SpotifySection({
  spotifyTrackId,
  songTitle,
  songArtist,
  showPreview,
  showPicker,
  results,
  loading,
  suggestionDismissed,
  showMoreSuggestions,
  oauthError = null,
  onDismissOauthError,
  onSelect,
  onClear,
  onDismissSuggestion,
  onToggleMoreSuggestions,
  onClosePicker,
}: SpotifySectionProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const { mounted: pickerMounted, closing: pickerClosing } = useAnimatedPresence(showPicker, 220);
  const showPlayerRow = Boolean(showPreview && spotifyTrackId);
  const showSuggestionRow = Boolean(!spotifyTrackId && !suggestionDismissed && results.length > 0);
  const { mounted: playerMounted } = useAnimatedPresence(showPlayerRow, 420);
  const matchedTrack = spotifyTrackId ? results.find((r) => r.id === spotifyTrackId) ?? null : null;
  useDialogA11y(showPicker, onClosePicker, pickerRef);

  return (
    <>
      {/* Custom Web Playback SDK player (bidirectional 0fr <-> 1fr glide) */}
      <div
        className="gm3-collapsible flex-shrink-0"
        data-compact-slot="true"
        data-collapsed={!showPlayerRow ? 'true' : undefined}
        aria-hidden={!showPlayerRow || undefined}
        inert={!showPlayerRow || undefined}
      >
        <div className="gm3-collapsible-inner">
          {playerMounted && spotifyTrackId && (
            <div className="bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2">
              <div className="w-full">
                <SpotifyWebPlayer
                  key={spotifyTrackId}
                  spotifyTrackId={spotifyTrackId}
                  songTitle={songTitle}
                  songArtist={songArtist}
                  matchedTrack={matchedTrack}
                  oauthError={oauthError}
                  onDismissOauthError={onDismissOauthError}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Automatic suggestion banner for unmatched songs (glides smoothly on async load & dismiss) */}
      <div
        className="gm3-collapsible flex-shrink-0"
        data-compact-slot="true"
        data-collapsed={!showSuggestionRow ? 'true' : undefined}
        aria-hidden={!showSuggestionRow || undefined}
        inert={!showSuggestionRow || undefined}
      >
        <div className="gm3-collapsible-inner">
          {results.length > 0 && (
            <div className="bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2">
              <div className="w-full rounded-[20px] bg-[var(--primary-container)]/55 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  {results[0].albumArt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={results[0].albumArt}
                      alt=""
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[var(--surface2)] flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="field-label text-[var(--accent-ink)]">Sugestão no Spotify</div>
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
                        aria-expanded={showMoreSuggestions}
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
                      aria-label="Dispensar sugestão do Spotify"
                      className="gm3-icon-btn w-8 h-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer"
                    >
                      <CloseIcon size={15} />
                    </button>
                  </div>
                </div>

                {results.length > 1 && (
                  <div
                    className="gm3-collapsible"
                    data-compact-slot="true"
                    data-collapsed={!showMoreSuggestions ? 'true' : undefined}
                    aria-hidden={!showMoreSuggestions || undefined}
                    inert={!showMoreSuggestions || undefined}
                  >
                    <div className="gm3-collapsible-inner">
                      <div className="mt-2.5 space-y-1.5 pl-13">
                        {results.slice(1).map((track) => (
                          <button
                            key={track.id}
                            type="button"
                            onClick={() => onSelect(track.id)}
                            className="gm3-menu-item w-full flex items-center gap-2.5 p-2 bg-[var(--surface)] hover:bg-[var(--surface-high)] text-left cursor-pointer"
                          >
                            {track.albumArt ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={track.albumArt} alt="" width={32} height={32} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-[var(--surface2)] flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[var(--ink)] truncate">{track.name}</div>
                              <div className="text-xs text-[var(--muted)] truncate">{track.artist}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Spotify picker modal */}
      {pickerMounted && (
        <div
          className={`${pickerClosing ? 'gm3-backdrop-exit' : 'gm3-backdrop-enter'} fixed inset-0 bg-black/45 z-[70] flex items-center justify-center p-4`}
          onClick={pickerClosing ? undefined : onClosePicker}
          inert={pickerClosing || undefined}
        >
          <div
            ref={pickerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="spotify-picker-title"
            className={`${pickerClosing ? 'gm3-dialog-exit' : 'gm3-dialog-enter'} w-full max-w-md rounded-[28px] bg-[var(--surface)] p-6 space-y-3`}
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="spotify-picker-title" className="font-display text-lg font-bold text-[var(--ink)]">
                Escolher faixa no Spotify
              </h2>
              <button
                type="button"
                onClick={onClosePicker}
                aria-label="Fechar seleção do Spotify"
                className="gm3-icon-btn w-9 h-9 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer"
              >
                <CloseIcon size={16} />
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
                    className={`gm3-menu-item w-full flex items-center gap-3 p-2.5 text-left cursor-pointer ${
                      spotifyTrackId === track.id
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
              <button type="button" onClick={onClosePicker} className="pill-btn bg-[var(--bg)] px-4 h-9 text-xs">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

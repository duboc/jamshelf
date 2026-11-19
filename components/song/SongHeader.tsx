'use client';

import { useEffect, useRef, useState } from 'react';
import type { ParsedSong, Setlist } from '@/lib/types/song';
import type { DisplayMode } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { formatDuration, parseDurationValue } from '@/lib/utils/chordpro-parser';
import { playReferencePitch } from '@/lib/utils/pitch-audio';

interface SongHeaderProps {
  song: ParsedSong;
  displayedKey: string;
  pitchTarget: string;
  titleInput: string;
  artistInput: string;
  onTitleChange: (v: string) => void;
  onArtistChange: (v: string) => void;
  onSaveTitle: () => void;
  onSaveArtist: () => void;
  onPatchMeta: (key: string, value: string | number) => void;
  // Display & focus
  displayMode: DisplayMode;
  onSetDisplayMode: (m: DisplayMode) => void;
  editMode: boolean;
  onEnterFocusMode: () => void;
  // Setlist & live
  activeSetlist: Setlist | null;
  setlistSongIdx: number;
  totalSetlistSongs: number;
  prevSongId: string | null;
  nextSongId: string | null;
  onNavigateSong: (songId: string) => void;
  onOpenSetlistDrawer: () => void;
  onEnterShowMode: () => void;
  live: ReturnType<typeof useLiveSession>;
  handleGoLive: () => void;
  confirmGoLive: () => void;
  showNamePrompt: boolean;
  nameInput: string;
  setNameInput: (v: string) => void;
  setShowNamePrompt: (v: boolean) => void;
  // Secondary menu actions
  setlists: Setlist[];
  onAddToSetlist: (setlistId: string, setlistName: string) => void;
  onGoToCreateSetlist: () => void;
  showSpotifyPreview: boolean;
  onToggleSpotifyPreview: () => void;
  onOpenSpotifyPicker: () => void;
  onOpenEnhance: () => void;
  onOpenHistory: () => void;
  onOpenChordPro: () => void;
  onEditNotes: () => void;
  statusMsg: string;
}

export function SongHeader({
  song,
  displayedKey,
  pitchTarget,
  titleInput,
  artistInput,
  onTitleChange,
  onArtistChange,
  onSaveTitle,
  onSaveArtist,
  onPatchMeta,
  displayMode,
  onSetDisplayMode,
  editMode,
  onEnterFocusMode,
  activeSetlist,
  setlistSongIdx,
  totalSetlistSongs,
  prevSongId,
  nextSongId,
  onNavigateSong,
  onOpenSetlistDrawer,
  onEnterShowMode,
  live,
  handleGoLive,
  confirmGoLive,
  showNamePrompt,
  nameInput,
  setNameInput,
  setShowNamePrompt,
  setlists,
  onAddToSetlist,
  onGoToCreateSetlist,
  showSpotifyPreview,
  onToggleSpotifyPreview,
  onOpenSpotifyPicker,
  onOpenEnhance,
  onOpenHistory,
  onOpenChordPro,
  onEditNotes,
  statusMsg,
}: SongHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [pitchRinging, setPitchRinging] = useState(false);
  const [durationDraft, setDurationDraft] = useState(
    song.duration ? formatDuration(song.duration) : ''
  );
  const moreRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);

  const handlePlayPitch = () => {
    if (!pitchTarget) return;
    if (playReferencePitch(pitchTarget, { mode: 'chord' })) {
      setPitchRinging(true);
      setTimeout(() => setPitchRinging(false), 1600);
    }
  };

  useEffect(() => {
    if (!moreOpen && !metaOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
      if (metaOpen && metaRef.current && !metaRef.current.contains(e.target as Node)) {
        setMetaOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        setMetaOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen, metaOpen]);

  return (
    <section className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pt-2 pb-3">
      <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-3">
        {/* Left: Title/Artist + inline setlist stepper on mobile + full-width metadata chips */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
          {activeSetlist && (
            <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                disabled={!prevSongId || live.isFollowing}
                className="pill-btn w-8 h-8 text-base"
                title="Música anterior no setlist"
                aria-label="Música anterior no setlist"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={onOpenSetlistDrawer}
                className="pill-btn px-2.5 h-8 font-mono text-xs"
                title="Abrir lista do setlist"
              >
                {setlistSongIdx + 1}/{totalSetlistSongs}
              </button>
              <button
                type="button"
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                disabled={!nextSongId || live.isFollowing}
                className="pill-btn w-8 h-8 text-base"
                title="Próxima música no setlist"
                aria-label="Próxima música no setlist"
              >
                ›
              </button>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {activeSetlist && (
                <div className="flex sm:hidden items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => prevSongId && onNavigateSong(prevSongId)}
                    disabled={!prevSongId || live.isFollowing}
                    className="pill-btn w-7 h-7 text-sm"
                    title="Música anterior no setlist"
                    aria-label="Música anterior no setlist"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSetlistDrawer}
                    className="pill-btn px-2 h-7 font-mono text-xs"
                    title="Abrir lista do setlist"
                  >
                    {setlistSongIdx + 1}/{totalSetlistSongs}
                  </button>
                  <button
                    type="button"
                    onClick={() => nextSongId && onNavigateSong(nextSongId)}
                    disabled={!nextSongId || live.isFollowing}
                    className="pill-btn w-7 h-7 text-sm"
                    title="Próxima música no setlist"
                    aria-label="Próxima música no setlist"
                  >
                    ›
                  </button>
                </div>
              )}
              <input
                type="text"
                value={titleInput}
                onChange={(e) => onTitleChange(e.target.value)}
                onBlur={onSaveTitle}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="font-display font-bold text-xl sm:text-[26px] leading-tight text-[var(--ink)] bg-transparent border-b border-transparent hover:border-[var(--line-subtle)] focus:border-[var(--accent)] outline-none min-w-0 flex-1 w-full"
                title="Clique para editar o título"
                aria-label="Título da música"
              />
              {statusMsg && (
                <span className="font-mono text-xs text-[var(--tune)] font-semibold flex-shrink-0">
                  {statusMsg}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
              <input
                type="text"
                value={artistInput}
                onChange={(e) => onArtistChange(e.target.value)}
                onBlur={onSaveArtist}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                size={Math.max(8, Math.min(26, artistInput.length || 12))}
                className="text-xs sm:text-[13px] text-[var(--muted)] bg-transparent border-b border-transparent hover:border-[var(--line-subtle)] focus:border-[var(--accent)] outline-none max-w-[200px]"
                placeholder="Artista não informado"
                title="Clique para editar o artista"
                aria-label="Artista"
              />

              {/* Compact metadata button -> opens popover for Capo, BPM, Time Signature */}
              <div ref={metaRef} className="relative flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setDurationDraft(song.duration ? formatDuration(song.duration) : '');
                    setMetaOpen((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 min-h-[28px] cursor-pointer group"
                  title="Ajustar capo, andamento (BPM), compasso e duração"
                >
                  {displayedKey && (
                    <span className="studio-chip bg-[var(--primary-container)] text-[var(--on-primary-container)] font-semibold">
                      Tom {displayedKey}
                    </span>
                  )}
                  {song.capo > 0 && (
                    <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)]">Capo {song.capo}</span>
                  )}
                  <span className="studio-chip bg-[var(--surface)] text-[var(--muted)] group-hover:text-[var(--ink)]">
                    {song.tempo} BPM · {song.timeSignature}
                    {song.duration ? ` · ${formatDuration(song.duration)}` : ''} ✎
                  </span>
                </button>

                {pitchTarget && (
                  <button
                    type="button"
                    onClick={handlePlayPitch}
                    className={`pill-btn px-2.5 h-7 text-xs ${
                      pitchRinging
                        ? 'pill-btn-primary'
                        : 'text-[var(--accent-ink)]'
                    }`}
                    title={`Tocar acorde-guia (${pitchTarget}) para pegar o tom antes de começar`}
                  >
                    ♪ {pitchRinging ? 'Tocando…' : 'Guia'}
                  </button>
                )}

                {metaOpen && (
                  <div
                    role="dialog"
                    aria-label="Ajustes musicais da faixa"
                    className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-32px))] rounded-[24px] bg-[var(--surface)] p-4 space-y-3"
                    style={{ boxShadow: 'var(--shadow-md)' }}
                  >
                    <div className="field-label">Propriedades da música</div>

                    {/* Capo */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink)]">Capotraste</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPatchMeta('capo', Math.max(0, song.capo - 1))}
                          className="pill-btn bg-[var(--bg)] w-8 h-8 text-xs font-mono"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs text-[var(--accent-ink)] w-6 text-center tabular-nums">
                          {song.capo}
                        </span>
                        <button
                          type="button"
                          onClick={() => onPatchMeta('capo', Math.min(12, song.capo + 1))}
                          className="pill-btn bg-[var(--bg)] w-8 h-8 text-xs font-mono"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* BPM */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink)]">Andamento (BPM)</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPatchMeta('tempo', Math.max(20, song.tempo - 1))}
                          className="pill-btn bg-[var(--bg)] w-8 h-8 text-xs font-mono"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={song.tempo}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v >= 20 && v <= 300) onPatchMeta('tempo', v);
                          }}
                          className="studio-input w-14 text-center text-xs font-mono py-1"
                        />
                        <button
                          type="button"
                          onClick={() => onPatchMeta('tempo', Math.min(300, song.tempo + 1))}
                          className="pill-btn bg-[var(--bg)] w-8 h-8 text-xs font-mono"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Time signature */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--ink)]">Compasso</span>
                      <select
                        value={song.timeSignature}
                        onChange={(e) => onPatchMeta('time', e.target.value)}
                        className="studio-input px-2.5 py-1 text-xs font-mono"
                      >
                        <option value="4/4">4/4</option>
                        <option value="3/4">3/4</option>
                        <option value="6/8">6/8</option>
                        <option value="2/4">2/4</option>
                        <option value="5/4">5/4</option>
                        <option value="7/8">7/8</option>
                      </select>
                    </div>

                    {/* Duration (used by proportional auto-scroll) */}
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink)]">Duração</div>
                        <div className="text-xs text-[var(--muted)]">Base do auto-scroll</div>
                      </div>
                      <input
                        type="text"
                        value={durationDraft}
                        onChange={(e) => setDurationDraft(e.target.value)}
                        onBlur={() => {
                          const parsed = parseDurationValue(durationDraft);
                          if (parsed !== null) {
                            onPatchMeta('duration', parsed);
                            setDurationDraft(formatDuration(parsed));
                          } else if (song.duration) {
                            setDurationDraft(formatDuration(song.duration));
                          }
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        placeholder="3:30"
                        className="studio-input w-20 text-center text-xs font-mono py-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Reading mode segmented control + Focus + Setlist Show/Live + More menu */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Primary Reading Mode Switch (1-tap hide chords for singers!) */}
          <div
            role="group"
            aria-label="Modo de leitura"
            className="inline-flex flex-shrink-0 p-0.5 rounded-full bg-[var(--surface-high)] gap-0.5"
          >
            {(
              [
                { mode: 'both', label: 'Cifra' },
                { mode: 'lyrics-only', label: 'Só letra' },
                { mode: 'chords-only', label: 'Acordes' },
              ] as { mode: DisplayMode; label: string }[]
            ).map(({ mode, label }) => {
              const active = displayMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={editMode}
                  onClick={() => onSetDisplayMode(mode)}
                  aria-pressed={active}
                  title={
                    editMode
                      ? 'Indisponível durante a edição'
                      : mode === 'lyrics-only'
                      ? 'Esconde os acordes e melhora a tipografia para cantar'
                      : undefined
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Focus / clean reading mode directly on the song page */}
          {!editMode && (
            <button
              type="button"
              onClick={onEnterFocusMode}
              className="pill-btn px-2.5 sm:px-3 py-1.5 text-xs"
              title="Esconde menus e barras para ler ou cantar com a tela livre"
            >
              Tela limpa
            </button>
          )}

          {/* Setlist-specific Show Mode + Live Session controls */}
          {activeSetlist && (
            <>
              <button
                type="button"
                onClick={onEnterShowMode}
                className="pill-btn pill-btn-rec px-3 py-1.5 text-xs"
                title="Abrir no Modo Show com deslize entre músicas"
              >
                ▶ Show
              </button>

              <div className="relative flex items-center gap-1.5">
                {live.isLeading ? (
                  <>
                    <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec)] animate-pulse" />
                      Liderando
                    </span>
                    <button
                      type="button"
                      onClick={live.stopLeading}
                      className="pill-btn px-2.5 py-1 text-xs"
                    >
                      Parar
                    </button>
                  </>
                ) : live.isFollowing ? (
                  <>
                    <span className="studio-chip text-[var(--tune)] border border-[var(--tune)]/40 bg-[var(--tune-dim)]">
                      {live.isLeaderStale
                        ? `${live.session.leaderName} inativo`
                        : `Seguindo ${live.session.leaderName}`}
                    </span>
                    <button
                      type="button"
                      onClick={handleGoLive}
                      className="pill-btn px-2.5 py-1 text-xs"
                    >
                      Assumir
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoLive}
                    className="pill-btn px-3 py-1.5 text-xs"
                    title="Sincronizar rolagem, metrônomo e troca de música com a banda"
                  >
                    <span className="w-2 h-2 rounded-full bg-[var(--rec)]" />
                    Ao vivo
                  </button>
                )}

                {showNamePrompt && (
                  <div
                    role="dialog"
                    className="absolute right-0 top-[calc(100%+8px)] w-[min(264px,calc(100vw-32px))] bg-[var(--surface)] rounded-[24px] z-50 p-4 space-y-3"
                    style={{ boxShadow: 'var(--shadow-md)' }}
                  >
                    <div className="text-xs text-[var(--muted)]">
                      Seu nome, para a banda saber quem está puxando a música:
                    </div>
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmGoLive();
                        if (e.key === 'Escape') setShowNamePrompt(false);
                      }}
                      placeholder="Ex.: Alex - Guitarra"
                      className="studio-input w-full px-2.5 py-1.5 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNamePrompt(false)}
                        className="pill-btn bg-[var(--bg)] px-3.5 py-1.5 text-xs"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={confirmGoLive}
                        className="pill-btn pill-btn-primary px-3.5 py-1.5 text-xs"
                      >
                        Iniciar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Spotify quick preview button if already matched */}
          {song.spotifyTrackId && (
            <button
              type="button"
              onClick={onToggleSpotifyPreview}
              className={`pill-btn px-3 py-1.5 text-xs ${
                showSpotifyPreview ? 'pill-btn-tune' : ''
              }`}
              title="Ouvir faixa original no Spotify"
            >
              ♪ Ouvir
            </button>
          )}

          {/* Favorite heart */}
          <button
            type="button"
            onClick={() => onPatchMeta('favorite', song.favorite ? 'false' : 'true')}
            className={`pill-btn w-8 h-8 text-base ${
              song.favorite ? 'text-[var(--rec)] border-[var(--rec)]/40' : 'text-[var(--muted)]'
            }`}
            title={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
            aria-label={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
          >
            {song.favorite ? '♥' : '♡'}
          </button>

          {/* Overflow menu: Rating, Add to setlist, Spotify, AI Enhance, History, ChordPro */}
          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="pill-btn px-3 py-1.5 text-xs"
              title="Mais ações da música"
            >
              Mais ▾
            </button>

            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(272px,calc(100vw-32px))] rounded-[24px] bg-[var(--surface)] py-2"
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                {/* Rating */}
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="field-label">Avaliação</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => onPatchMeta('rating', song.rating === star ? 0 : star)}
                        className={`w-7 h-7 flex items-center justify-center text-base cursor-pointer transition-colors ${
                          star <= song.rating
                            ? 'text-[var(--warn)]'
                            : 'text-[var(--line-subtle)] hover:text-[var(--warn)]/75'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className="my-1.5 mx-3 border-t border-[var(--line-subtle)]/40" />

                {/* Setlists */}
                <div className="px-4 pt-1 pb-1 field-label">Adicionar ao setlist</div>
                {setlists.length === 0 ? (
                  <div className="px-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onGoToCreateSetlist();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[var(--accent-ink)] hover:bg-[var(--surface-high)] cursor-pointer"
                    >
                      Criar primeiro setlist →
                    </button>
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto px-1.5">
                    {setlists.map((sl) => {
                      const already = sl.songIds.includes(song.id);
                      return (
                        <button
                          key={sl.id}
                          type="button"
                          disabled={already}
                          onClick={() => {
                            if (!already) {
                              onAddToSetlist(sl.id, sl.name);
                              setMoreOpen(false);
                            }
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-[13px] flex items-center justify-between gap-2 transition-colors ${
                            already
                              ? 'text-[var(--muted)] opacity-60 cursor-default'
                              : 'text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer'
                          }`}
                        >
                          <span className="truncate">{sl.name}</span>
                          {already && <span className="font-mono text-xs">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="my-1.5 mx-3 border-t border-[var(--line-subtle)]/40" />

                <div className="px-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onEditNotes();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer transition-colors"
                  >
                    {song.notes ? 'Editar notas de palco' : 'Adicionar notas de palco'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenSpotifyPicker();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer transition-colors"
                  >
                    {song.spotifyTrackId ? 'Trocar vínculo no Spotify' : 'Buscar faixa no Spotify'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenEnhance();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer transition-colors"
                  >
                    Revisar letra e acordes com IA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenHistory();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer transition-colors"
                  >
                    Histórico de versões
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenChordPro();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer transition-colors"
                  >
                    Editar fonte ChordPro (.cho)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

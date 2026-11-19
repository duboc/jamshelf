'use client';

import { useEffect, useRef, useState } from 'react';
import type { ParsedSong, Setlist } from '@/lib/types/song';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { formatDuration, parseDurationValue } from '@/lib/utils/chordpro-parser';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  HeadphonesIcon,
  HeartIcon,
  PitchWaveIcon,
  PlayIcon,
  StarIcon,
} from '@/components/ui/Icons';

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
  const { capoDisplay, setCapoDisplay } = useDisplayStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [pitchRinging, setPitchRinging] = useState(false);
  const [bpmDraft, setBpmDraft] = useState(String(song.tempo));
  const [bpmHint, setBpmHint] = useState('');
  const [durationDraft, setDurationDraft] = useState(
    song.duration ? formatDuration(song.duration) : ''
  );
  const [durationHint, setDurationHint] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const isEditingTitle = editMode || editingIdentity;

  const handlePlayPitch = () => {
    if (!pitchTarget) return;
    if (playReferencePitch(pitchTarget, { mode: 'chord' })) {
      setPitchRinging(true);
      setTimeout(() => setPitchRinging(false), 1600);
    }
  };

  const commitBpmDraft = () => {
    const parsed = parseInt(bpmDraft.trim(), 10);
    if (isNaN(parsed)) {
      setBpmDraft(String(song.tempo));
      setBpmHint('Use um número entre 40 e 240');
      return;
    }
    const clamped = Math.max(40, Math.min(240, parsed));
    setBpmDraft(String(clamped));
    setBpmHint(clamped !== parsed ? 'Ajustado para o limite de 40 a 240 BPM' : '');
    if (clamped !== song.tempo) onPatchMeta('tempo', clamped);
  };

  const commitDurationDraft = () => {
    const trimmed = durationDraft.trim();
    if (!trimmed) {
      setDurationHint('');
      return;
    }
    const parsed = parseDurationValue(trimmed);
    if (parsed !== null) {
      onPatchMeta('duration', parsed);
      setDurationDraft(formatDuration(parsed));
      setDurationHint('');
    } else {
      setDurationDraft(song.duration ? formatDuration(song.duration) : '');
      setDurationHint('Formato mm:ss (ex.: 3:30)');
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

  const setlistStepper = activeSetlist && (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        type="button"
        onClick={() => prevSongId && onNavigateSong(prevSongId)}
        disabled={!prevSongId || live.isFollowing}
        className="pill-btn w-9 h-9"
        title="Música anterior no setlist"
        aria-label="Música anterior no setlist"
      >
        <ChevronLeftIcon size={16} />
      </button>
      <button
        type="button"
        onClick={onOpenSetlistDrawer}
        className="pill-btn px-2.5 h-9 font-mono text-xs tabular-nums"
        title="Abrir lista do setlist (atalho: S)"
      >
        {setlistSongIdx + 1}/{totalSetlistSongs}
      </button>
      <button
        type="button"
        onClick={() => nextSongId && onNavigateSong(nextSongId)}
        disabled={!nextSongId || live.isFollowing}
        className="pill-btn w-9 h-9"
        title="Próxima música no setlist"
        aria-label="Próxima música no setlist"
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>
  );

  return (
    <section className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pt-1.5 pb-2.5">
      <div className="w-full flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-3">
        {/* Left: Setlist stepper (desktop/tablet) + flush-left Title/Artist + musical metadata */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
          {activeSetlist && <div className="hidden sm:flex">{setlistStepper}</div>}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={titleInput}
                    onChange={(e) => onTitleChange(e.target.value)}
                    onBlur={onSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onSaveTitle();
                        if (!editMode) setEditingIdentity(false);
                      }
                      if (e.key === 'Escape' && !editMode) {
                        setEditingIdentity(false);
                      }
                    }}
                    className="studio-input font-display font-bold text-lg sm:text-2xl leading-tight text-[var(--ink)] px-2.5 py-1 min-w-0 flex-1 w-full"
                    aria-label="Título da música"
                  />
                  {!editMode && (
                    <button
                      type="button"
                      onClick={() => {
                        onSaveTitle();
                        onSaveArtist();
                        setEditingIdentity(false);
                      }}
                      className="pill-btn pill-btn-tonal px-3 h-9 text-xs flex-shrink-0"
                    >
                      <CheckIcon size={14} />
                      OK
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <h1 className="font-display font-bold text-xl sm:text-[26px] leading-tight text-[var(--ink)] truncate">
                    {titleInput || song.title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIdentity(true);
                      requestAnimationFrame(() => titleInputRef.current?.focus());
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] transition-colors flex-shrink-0 cursor-pointer"
                    title="Editar título e artista"
                    aria-label="Editar título e artista"
                  >
                    <EditIcon size={14} />
                  </button>
                </>
              )}

              {statusMsg && (
                <span
                  role="status"
                  aria-live="polite"
                  className="font-mono text-xs text-[var(--tune)] font-semibold flex-shrink-0"
                >
                  {statusMsg}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-1">
              {isEditingTitle ? (
                <input
                  type="text"
                  value={artistInput}
                  onChange={(e) => onArtistChange(e.target.value)}
                  onBlur={onSaveArtist}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSaveArtist();
                      if (!editMode) setEditingIdentity(false);
                    }
                  }}
                  className="studio-input text-xs sm:text-[13px] text-[var(--ink)] px-2.5 py-1 max-w-[220px]"
                  placeholder="Artista não informado"
                  aria-label="Artista"
                />
              ) : (
                <p className="text-xs sm:text-[13px] text-[var(--muted)] truncate max-w-[220px]">
                  {artistInput || 'Artista não informado'}
                </p>
              )}

              {/* Compact metadata button -> opens popover for Capo, BPM, Time Signature, Duration */}
              <div ref={metaRef} className="relative flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setBpmDraft(String(song.tempo));
                    setBpmHint('');
                    setDurationDraft(song.duration ? formatDuration(song.duration) : '');
                    setDurationHint('');
                    setMetaOpen((v) => !v);
                  }}
                  aria-expanded={metaOpen}
                  className="inline-flex items-center gap-1 min-h-[32px] cursor-pointer group rounded-full"
                  title="Ajustar capo, andamento (BPM), compasso e duração"
                >
                  {displayedKey && (
                    <span className="studio-chip bg-[var(--primary-container)] text-[var(--on-primary-container)] font-semibold">
                      Tom {displayedKey}
                    </span>
                  )}
                  {song.capo > 0 && (
                    <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)]">
                      Capo {song.capo}
                    </span>
                  )}
                  <span className="studio-chip bg-[var(--surface)] text-[var(--muted)] group-hover:text-[var(--ink)]">
                    {!song.tempoConfirmed ? '~' : ''}{song.tempo} BPM · {song.timeSignature}
                    {song.duration ? ` · ${formatDuration(song.duration)}` : ''}
                  </span>
                </button>

                {song.capo > 0 && !editMode && (
                  <button
                    type="button"
                    aria-pressed={capoDisplay === 'shapes'}
                    onClick={() =>
                      setCapoDisplay(capoDisplay === 'shapes' ? 'sounding' : 'shapes')
                    }
                    className={`pill-btn px-2.5 h-8 text-xs ${
                      capoDisplay === 'shapes' ? 'pill-btn-tonal' : ''
                    }`}
                    title={
                      capoDisplay === 'shapes'
                        ? `Exibindo posições de dedo para Capo ${song.capo}. Clique para ver o tom real.`
                        : `Exibindo acordes no tom real. Clique para ver posições com Capo ${song.capo}.`
                    }
                  >
                    {capoDisplay === 'shapes' ? `Formas (Capo ${song.capo})` : 'Tom real'}
                  </button>
                )}

                {pitchTarget && !editMode && (
                  <button
                    type="button"
                    onClick={handlePlayPitch}
                    className={`pill-btn px-2.5 h-8 text-xs ${
                      pitchRinging ? 'pill-btn-primary' : 'text-[var(--accent-ink)]'
                    }`}
                    title={`Tocar acorde-guia (${pitchTarget}) para pegar o tom antes de começar`}
                  >
                    <PitchWaveIcon size={14} />
                    {pitchRinging ? 'Tocando…' : 'Guia'}
                  </button>
                )}

                {metaOpen && (
                  <div
                    role="dialog"
                    aria-label="Ajustes musicais da faixa"
                    className="gm3-dialog-enter absolute left-0 top-[calc(100%+8px)] z-50 w-[min(296px,calc(100vw-32px))] rounded-[24px] bg-[var(--surface)] p-4 space-y-3"
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
                          className="pill-btn bg-[var(--bg)] w-9 h-9 text-xs font-mono"
                          aria-label="Diminuir capotraste"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs text-[var(--accent-ink)] w-6 text-center tabular-nums">
                          {song.capo}
                        </span>
                        <button
                          type="button"
                          onClick={() => onPatchMeta('capo', Math.min(12, song.capo + 1))}
                          className="pill-btn bg-[var(--bg)] w-9 h-9 text-xs font-mono"
                          aria-label="Aumentar capotraste"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {song.capo > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--muted)]">Mostrar acordes como</span>
                        <div className="inline-flex p-0.5 rounded-full bg-[var(--bg)] gap-0.5">
                          <button
                            type="button"
                            aria-pressed={capoDisplay === 'sounding'}
                            onClick={() => setCapoDisplay('sounding')}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer ${
                              capoDisplay === 'sounding'
                                ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                                : 'text-[var(--muted)]'
                            }`}
                          >
                            Tom real
                          </button>
                          <button
                            type="button"
                            aria-pressed={capoDisplay === 'shapes'}
                            onClick={() => setCapoDisplay('shapes')}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer ${
                              capoDisplay === 'shapes'
                                ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                                : 'text-[var(--muted)]'
                            }`}
                          >
                            Formas
                          </button>
                        </div>
                      </div>
                    )}

                    {/* BPM (buffered input so typing 80 or 125 never gets rejected mid-digit) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <label htmlFor="meta-bpm-input" className="text-xs font-semibold text-[var(--ink)] block">
                            Andamento (BPM)
                          </label>
                          <span className="text-xs text-[var(--muted)]">40 a 240 BPM</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.max(40, song.tempo - 1);
                              setBpmDraft(String(next));
                              setBpmHint('');
                              onPatchMeta('tempo', next);
                            }}
                            className="pill-btn bg-[var(--bg)] w-9 h-9 text-xs font-mono"
                            aria-label="Diminuir andamento em 1 BPM"
                          >
                            -
                          </button>
                          <input
                            id="meta-bpm-input"
                            type="number"
                            min={40}
                            max={240}
                            value={bpmDraft}
                            onChange={(e) => {
                              setBpmDraft(e.target.value);
                              setBpmHint('');
                            }}
                            onBlur={commitBpmDraft}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            className="studio-input w-16 text-center text-xs font-mono py-1.5"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.min(240, song.tempo + 1);
                              setBpmDraft(String(next));
                              setBpmHint('');
                              onPatchMeta('tempo', next);
                            }}
                            className="pill-btn bg-[var(--bg)] w-9 h-9 text-xs font-mono"
                            aria-label="Aumentar andamento em 1 BPM"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {bpmHint && (
                        <div className="text-xs text-[var(--warn-ink)]" role="status">
                          {bpmHint}
                        </div>
                      )}
                    </div>

                    {/* Time signature */}
                    <div className="flex items-center justify-between">
                      <label htmlFor="meta-time-select" className="text-xs font-semibold text-[var(--ink)]">
                        Compasso
                      </label>
                      <select
                        id="meta-time-select"
                        value={song.timeSignature}
                        onChange={(e) => onPatchMeta('time', e.target.value)}
                        className="studio-input px-2.5 py-1.5 text-xs font-mono"
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
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <label htmlFor="meta-duration-input" className="text-xs font-semibold text-[var(--ink)] block">
                            Duração
                          </label>
                          <div className="text-xs text-[var(--muted)]">Base do auto-scroll (mm:ss)</div>
                        </div>
                        <input
                          id="meta-duration-input"
                          type="text"
                          value={durationDraft}
                          onChange={(e) => {
                            setDurationDraft(e.target.value);
                            setDurationHint('');
                          }}
                          onBlur={commitDurationDraft}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          placeholder="3:30"
                          className="studio-input w-20 text-center text-xs font-mono py-1.5"
                        />
                      </div>
                      {durationHint && (
                        <div className="text-xs text-[var(--warn-ink)]" role="status">
                          {durationHint}
                        </div>
                      )}
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
                      ? 'Esconde os acordes e melhora a tipografia para cantar (atalho: L)'
                      : undefined
                  }
                  className={`px-3 h-8 rounded-full text-xs font-medium transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
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
              className="pill-btn px-3 h-9 text-xs"
              title="Esconde menus e barras para ler ou cantar com a tela livre"
            >
              Tela limpa
            </button>
          )}

          {/* Setlist-specific Show Mode + Live Session controls (hidden during visual edit) */}
          {activeSetlist && !editMode && (
            <>
              <button
                type="button"
                onClick={onEnterShowMode}
                className="pill-btn pill-btn-rec px-3.5 h-9 text-xs"
                title="Abrir no Modo Show com deslize entre músicas"
              >
                <PlayIcon size={12} />
                Show
              </button>

              <div className="relative flex items-center gap-1.5 flex-wrap">
                {live.isLeading ? (
                  <>
                    <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec-dot)] animate-pulse" aria-hidden="true" />
                      Liderando
                    </span>
                    <button
                      type="button"
                      onClick={live.stopLeading}
                      className="pill-btn px-3 h-9 text-xs"
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
                      className="pill-btn px-3 h-9 text-xs"
                    >
                      Assumir
                    </button>
                    <button
                      type="button"
                      onClick={live.unfollow}
                      className="pill-btn px-3 h-9 text-xs"
                      title="Sair do acompanhamento automático e navegar livremente neste aparelho"
                    >
                      Desconectar
                    </button>
                  </>
                ) : live.hasRemoteLeader && live.localUnfollow ? (
                  <button
                    type="button"
                    onClick={live.refollow}
                    className="pill-btn pill-btn-tune px-3 h-9 text-xs"
                    title={`Voltar a acompanhar ${live.session.leaderName}`}
                  >
                    Seguir {live.session.leaderName}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoLive}
                    className="pill-btn px-3 h-9 text-xs"
                    title="Sincronizar rolagem, metrônomo e troca de música com a banda"
                  >
                    <span className="w-2 h-2 rounded-full bg-[var(--rec-dot)]" aria-hidden="true" />
                    Ao vivo
                  </button>
                )}

                {live.liveError && (
                  <span role="alert" className="studio-chip bg-[var(--rec-dim)] text-[var(--on-rec-container)]">
                    {live.liveError}
                  </span>
                )}

                {showNamePrompt && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Iniciar sessão Ao Vivo"
                    className="gm3-dialog-enter absolute right-0 top-[calc(100%+8px)] w-[min(272px,calc(100vw-32px))] bg-[var(--surface)] rounded-[24px] z-50 p-4 space-y-3"
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
                      aria-label="Seu nome na sessão ao vivo"
                      placeholder="Ex.: Alex - Guitarra"
                      className="studio-input w-full px-3 py-2 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNamePrompt(false)}
                        className="pill-btn bg-[var(--bg)] px-3.5 h-9 text-xs"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={confirmGoLive}
                        className="pill-btn pill-btn-primary px-3.5 h-9 text-xs"
                      >
                        Iniciar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Spotify quick preview button on wide desktop (always available in Mais on smaller screens) */}
          {song.spotifyTrackId && !editMode && (
            <button
              type="button"
              aria-pressed={showSpotifyPreview}
              onClick={onToggleSpotifyPreview}
              className={`hidden xl:inline-flex pill-btn px-3 h-9 text-xs ${showSpotifyPreview ? 'pill-btn-tune' : ''}`}
              title="Ouvir faixa original no Spotify"
            >
              <HeadphonesIcon size={14} />
              Ouvir
            </button>
          )}

          {/* Favorite heart */}
          <button
            type="button"
            aria-pressed={song.favorite}
            onClick={() => onPatchMeta('favorite', song.favorite ? 'false' : 'true')}
            className={`pill-btn w-9 h-9 ${
              song.favorite ? 'text-[var(--rec)] border-[var(--rec)]/40' : 'text-[var(--muted)]'
            }`}
            title={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
            aria-label={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
          >
            <HeartIcon size={17} filled={song.favorite} />
          </button>

          {/* Overflow popover: Rating, Add to setlist, Spotify, AI Enhance, History, ChordPro */}
          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="pill-btn px-3 h-9 text-xs"
              title="Mais ações da música"
            >
              Mais
              <ChevronDownIcon size={14} />
            </button>

            {moreOpen && (
              <div
                role="dialog"
                aria-label="Mais ações da música"
                className="gm3-dialog-enter absolute right-0 top-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-32px))] rounded-[24px] bg-[var(--surface)] py-2"
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                {/* Rating */}
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="field-label">Avaliação</span>
                  <div className="flex gap-0.5" role="group" aria-label="Avaliar música de 1 a 5 estrelas">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        aria-label={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                        aria-pressed={song.rating === star}
                        onClick={() => onPatchMeta('rating', song.rating === star ? 0 : star)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--surface-high)] ${
                          star <= song.rating ? 'text-[var(--warn-icon)]' : 'text-[var(--muted)]'
                        }`}
                      >
                        <StarIcon size={16} filled={star <= song.rating} />
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
                      Criar primeiro setlist
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
                              ? 'text-[var(--muted)] opacity-65 cursor-default'
                              : 'text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer'
                          }`}
                        >
                          <span className="truncate">{sl.name}</span>
                          {already && <CheckIcon size={14} className="text-[var(--tune)] flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="my-1.5 mx-3 border-t border-[var(--line-subtle)]/40" />

                <div className="px-1.5 space-y-0.5">
                  {song.spotifyTrackId && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onToggleSpotifyPreview();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer transition-colors"
                    >
                      {showSpotifyPreview ? 'Ocultar player do Spotify' : 'Ouvir prévia no Spotify'}
                    </button>
                  )}
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

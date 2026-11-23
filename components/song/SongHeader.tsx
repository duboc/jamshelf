'use client';

import { useEffect, useRef, useState } from 'react';
import type { ParsedSong, Setlist } from '@/lib/types/song';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence } from '@/lib/hooks/use-animated-presence';
import { formatDuration, parseDurationValue } from '@/lib/utils/chordpro-parser';
import { isMinorKey } from '@/lib/utils/music';
import { playReferencePitch } from '@/lib/utils/pitch-audio';

const KEY_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import { Gm3FocalBadge } from '@/components/ui/Gm3FocalBadge';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  HeadphonesIcon,
  HeartIcon,
  PauseIcon,
  PitchWaveIcon,
  PlayIcon,
  SlidesIcon,
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
  onEnterSlidesMode: () => void;
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
  /** Unified toolbar controls: flows inline in the single horizontal scroll strip on < lg, and spans Row 2 on >= lg. */
  toolbarSlot?: React.ReactNode;
  /** Scroll-collapsed compact GM3 Top App Bar state (maximizes lyric space while reading/scrolling). */
  compact?: boolean;
  onExpandHeader?: () => void;
  onBack?: () => void;
  isAutoScrolling?: boolean;
  onToggleAutoScroll?: () => void;
  isFollowing?: boolean;
  onOverlayStateChange?: (state: { popoverOpen: boolean; editingIdentity: boolean }) => void;
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
  onEnterSlidesMode,
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
  toolbarSlot,
  compact = false,
  onExpandHeader,
  onBack,
  isAutoScrolling = false,
  onToggleAutoScroll,
  isFollowing = false,
  onOverlayStateChange,
}: SongHeaderProps) {
  const { capoDisplay, setCapoDisplay } = useDisplayStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [pitchRinging, setPitchRinging] = useState(false);
  const [favPop, setFavPop] = useState(false);
  const [starPop, setStarPop] = useState<number | null>(null);
  const [bpmDraft, setBpmDraft] = useState(String(song.tempo));
  const [bpmHint, setBpmHint] = useState('');
  const [keyQuality, setKeyQuality] = useState<'major' | 'minor'>(
    isMinorKey(song.originalKey) ? 'minor' : 'major'
  );
  const bpmTapTimesRef = useRef<number[]>([]);
  const bpmHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmHoldIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bpmLiveRef = useRef(song.tempo);
  const onPatchMetaRef = useRef(onPatchMeta);
  useEffect(() => {
    bpmLiveRef.current = song.tempo;
    onPatchMetaRef.current = onPatchMeta;
  });
  const [durationDraft, setDurationDraft] = useState(
    song.duration ? formatDuration(song.duration) : ''
  );
  const [durationHint, setDurationHint] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const metaTriggerRef = useRef<HTMLButtonElement>(null);
  const compactAutoScrollRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const goLiveDialogRef = useRef<HTMLDivElement>(null);

  const { mounted: moreMounted, closing: moreClosing } = useAnimatedPresence(moreOpen, 220);
  const { mounted: metaMounted, closing: metaClosing } = useAnimatedPresence(metaOpen, 220);
  const { mounted: goLiveMounted, closing: goLiveClosing } = useAnimatedPresence(showNamePrompt, 220);

  useDialogA11y(showNamePrompt, () => setShowNamePrompt(false), goLiveDialogRef);

  const isEditingTitle = editMode || editingIdentity;
  const minorKey = isMinorKey(displayedKey);
  const keyChipToneClasses = minorKey
    ? 'bg-[var(--minor-container)] text-[var(--on-minor-container)]'
    : 'bg-[var(--primary-container)] text-[var(--on-primary-container)]';

  const handlePlayPitch = () => {
    if (!pitchTarget) return;
    if (playReferencePitch(pitchTarget, { mode: 'chord' })) {
      setPitchRinging(true);
      setTimeout(() => setPitchRinging(false), 1600);
    }
  };

  const stopBpmHold = () => {
    if (bpmHoldTimeoutRef.current) {
      clearTimeout(bpmHoldTimeoutRef.current);
      bpmHoldTimeoutRef.current = null;
    }
    if (bpmHoldIntervalRef.current) {
      clearInterval(bpmHoldIntervalRef.current);
      bpmHoldIntervalRef.current = null;
    }
  };

  useEffect(() => stopBpmHold, []);

  const stepBpm = (delta: number) => {
    const next = Math.max(40, Math.min(240, bpmLiveRef.current + delta));
    bpmLiveRef.current = next;
    setBpmDraft(String(next));
    setBpmHint('');
    onPatchMetaRef.current('tempo', next);
  };

  const startBpmHold = (delta: number) => {
    stopBpmHold();
    stepBpm(delta);
    bpmHoldTimeoutRef.current = setTimeout(() => {
      bpmHoldIntervalRef.current = setInterval(() => stepBpm(delta), 75);
    }, 300);
  };

  const handleMetaTapTempo = () => {
    const now = Date.now();
    const prev = bpmTapTimesRef.current;
    const recent = prev.length && now - prev[prev.length - 1] > 2000 ? [now] : [...prev.slice(-4), now];
    bpmTapTimesRef.current = recent;
    if (recent.length >= 2) {
      let sum = 0;
      for (let i = 1; i < recent.length; i++) sum += recent[i] - recent[i - 1];
      const avgMs = sum / (recent.length - 1);
      const tapped = Math.max(40, Math.min(240, Math.round(60000 / avgMs)));
      bpmLiveRef.current = tapped;
      setBpmDraft(String(tapped));
      setBpmHint(`Tap: ${tapped} BPM`);
      onPatchMeta('tempo', tapped);
    } else {
      setBpmHint('Continue batendo no ritmo…');
    }
  };

  const currentKeyRoot = song.originalKey
    ? song.originalKey.match(/^([A-G][#b]?)/)?.[1] ?? ''
    : '';

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
        if (moreOpen) {
          setMoreOpen(false);
          moreTriggerRef.current?.focus();
        }
        if (metaOpen) {
          setMetaOpen(false);
          metaTriggerRef.current?.focus();
        }
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen, metaOpen]);

  useEffect(() => {
    onOverlayStateChange?.({ popoverOpen: moreOpen || metaOpen, editingIdentity });
  }, [moreOpen, metaOpen, editingIdentity, onOverlayStateChange]);

  // Preserve keyboard focus if scroll-collapse applies inert to the currently focused header control
  useEffect(() => {
    if (!compact) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && headerRef.current?.contains(active) && active.closest('[inert]')) {
      (compactAutoScrollRef.current ?? moreTriggerRef.current)?.focus({ preventScroll: true });
    }
  }, [compact]);

  return (
    <section
      ref={headerRef}
      data-compact={compact ? 'true' : undefined}
      className={`relative z-30 flex-shrink-0 px-4 sm:px-6 lg:px-8 py-1.5 border-b transition-colors duration-[420ms] ease-out ${
        compact
          ? 'bg-[var(--surface)]/95 backdrop-blur-md border-[var(--line-subtle)]/35'
          : 'bg-transparent border-transparent'
      }`}
    >
      {/*
        Responsive single-DOM grid:
        - Mobile/Tablet (< lg):
          Row 1: Title (left) + Favorite & Mais (right, outside scroll so popovers never clip)
          Row 2: Calm subtitle line (Artist · Tom · BPM · Capo)
          Row 3: ONE unified horizontal scrollable pill bar (actions + toolbar tools)
        - Desktop (>= lg):
          Row 1: Setlist stepper + Title/Subtitle (col 1) | Action pills (col 2) | Favorite & Mais (col 3)
          Row 2: Dedicated full-width GM3 toolbar capsule spanning cols 1-3
        - Compact (scrolled down):
          Row 2 & Row 3 glide smoothly to 0fr over 480ms while Row 1 slots glide smoothly open via gm3-slot-x
          and the title scales smoothly via GPU transform (zero frame-0 layout snaps).
      */}
      <div className="w-full grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 lg:gap-x-3 gap-y-0 items-center">
        {/* Col 1, Row 1: Inline Back slot (compact) + Setlist stepper (sm+) + Title + Key slot (compact) */}
        <div className="col-start-1 row-start-1 min-w-0 flex items-center">
          {onBack && (
            <div
              data-compact-slot="true"
              data-collapsed={compact ? undefined : 'true'}
              aria-hidden={!compact || undefined}
              inert={!compact || undefined}
              className="gm3-slot-x flex-shrink-0"
            >
              <div className="gm3-slot-x-inner">
                <button
                  type="button"
                  onClick={onBack}
                  className="group gm3-icon-btn mr-2 w-9 h-9 flex items-center justify-center text-[var(--ink)] bg-[var(--bg)] hover:bg-[var(--surface-high)] flex-shrink-0 cursor-pointer"
                  title="Voltar"
                  aria-label="Voltar"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    className="transition-transform group-hover:-translate-x-0.5"
                  >
                    <path
                      d="M13 8H3.5M7.5 3.8 3.3 8l4.2 4.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {activeSetlist && (
            <div className="hidden sm:inline-flex gm3-btn-group flex-shrink-0 mr-2.5">
              <button
                type="button"
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                disabled={!prevSongId || live.isFollowing}
                className={`pill-btn w-9 h-9 ${compact ? 'bg-[var(--bg)]' : ''}`}
                title="Música anterior no setlist"
                aria-label="Música anterior no setlist"
              >
                <ChevronLeftIcon size={16} />
              </button>
              <button
                type="button"
                onClick={onOpenSetlistDrawer}
                className={`pill-btn px-2.5 h-9 font-mono text-xs tabular-nums ${compact ? 'bg-[var(--bg)]' : ''}`}
                title="Abrir lista do setlist (atalho: S)"
              >
                {setlistSongIdx + 1}/{totalSetlistSongs}
              </button>
              <button
                type="button"
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                disabled={!nextSongId || live.isFollowing}
                className={`pill-btn w-9 h-9 ${compact ? 'bg-[var(--bg)]' : ''}`}
                title="Próxima música no setlist"
                aria-label="Próxima música no setlist"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center min-w-0">
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
                    className="studio-input font-display font-bold text-lg sm:text-2xl leading-tight text-[var(--ink)] px-2.5 py-1 min-w-0 flex-1 w-full max-w-xl"
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
                  <h1
                    data-vt-song-title={song.id}
                    className="gm3-title-morph font-display font-bold text-xl sm:text-[24px] leading-tight text-[var(--ink)] truncate"
                  >
                    {titleInput || song.title}
                  </h1>
                  {displayedKey && (
                    <div
                      data-compact-slot="true"
                      data-collapsed={compact ? undefined : 'true'}
                      aria-hidden={!compact || undefined}
                      className="gm3-slot-x flex-shrink-0"
                    >
                      <div className="gm3-slot-x-inner pl-1.5">
                        <span
                          data-vt-song-key={compact ? song.id : undefined}
                          title={`Tom ${displayedKey}`}
                          className={`studio-chip ${keyChipToneClasses} font-semibold flex-shrink-0 px-2.5 py-0.5 text-xs`}
                        >
                          {displayedKey}
                        </span>
                      </div>
                    </div>
                  )}
                  <div
                    data-expanded-slot="true"
                    data-collapsed={compact ? 'true' : undefined}
                    aria-hidden={compact || undefined}
                    inert={compact || undefined}
                    className="gm3-slot-x flex-shrink-0"
                  >
                    <div className="gm3-slot-x-inner pl-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdentity(true);
                          requestAnimationFrame(() => titleInputRef.current?.focus());
                        }}
                        className="gm3-icon-btn w-9 h-9 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] flex-shrink-0 cursor-pointer"
                        title="Editar título e artista"
                        aria-label="Editar título e artista"
                      >
                        <EditIcon size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Auto-scroll slot (compact) + Favorite + Mais + Expand slot (compact): pinned top-right (never inside overflow-hidden) */}
        <div className="col-start-2 row-start-1 lg:col-start-3 lg:row-start-1 lg:row-span-2 flex items-center flex-shrink-0 justify-end">
          {!isFollowing && !editMode && onToggleAutoScroll && (
            <div
              data-compact-slot="true"
              data-collapsed={compact ? undefined : 'true'}
              aria-hidden={!compact || undefined}
              inert={!compact || undefined}
              className="gm3-slot-x flex-shrink-0"
            >
              <div className="gm3-slot-x-inner pr-1.5">
                <button
                  ref={compactAutoScrollRef}
                  type="button"
                  aria-pressed={isAutoScrolling}
                  onClick={onToggleAutoScroll}
                  className={`pill-btn h-9 w-9 sm:w-auto sm:px-3 text-xs flex-shrink-0 ${
                    isAutoScrolling ? 'pill-btn-tune' : 'bg-[var(--bg)]'
                  }`}
                  title={isAutoScrolling ? 'Pausar auto-scroll (Espaço)' : 'Iniciar auto-scroll (Espaço)'}
                  aria-label={isAutoScrolling ? 'Pausar auto-scroll' : 'Iniciar auto-scroll'}
                >
                  {isAutoScrolling ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
                  <span className="hidden sm:inline">{isAutoScrolling ? 'Pausar' : 'Rolar'}</span>
                </button>
              </div>
            </div>
          )}

          <div
            data-collapsed={compact ? 'true' : undefined}
            className="gm3-slot-x-mobile flex-shrink-0"
          >
            <div className="gm3-slot-x-inner pr-1.5">
              <button
                type="button"
                aria-pressed={song.favorite}
                onClick={() => {
                  if (!song.favorite) {
                    setFavPop(true);
                    setTimeout(() => setFavPop(false), 380);
                  }
                  onPatchMeta('favorite', song.favorite ? 'false' : 'true');
                }}
                className={`pill-btn gm3-fav-btn ${favPop ? 'gm3-pop-once' : ''} w-9 h-9 ${
                  compact ? 'bg-[var(--bg)]' : ''
                } ${
                  song.favorite ? 'text-[var(--rec)] border-[var(--rec)]/40' : 'text-[var(--muted)]'
                }`}
                title={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
                aria-label={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
              >
                <HeartIcon size={17} filled={song.favorite} />
              </button>
            </div>
          </div>

          <div ref={moreRef} className="relative">
            <button
              ref={moreTriggerRef}
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={`pill-btn px-2.5 sm:px-3 h-9 text-xs ${compact ? 'bg-[var(--bg)]' : ''}`}
              title="Mais ações da música"
            >
              Mais
              <ChevronDownIcon size={14} className="gm3-chevron" />
            </button>

            {moreMounted && (
              <div
                role="dialog"
                aria-label="Mais ações da música"
                inert={moreClosing || undefined}
                className={`gm3-popover-top-right ${moreClosing ? 'gm3-popover-exit' : ''} absolute right-0 top-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-32px))] rounded-[24px] bg-[var(--surface)] py-2`}
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
                        onClick={() => {
                          const next = song.rating === star ? 0 : star;
                          if (next > 0) {
                            setStarPop(star);
                            setTimeout(() => setStarPop(null), 380);
                          }
                          onPatchMeta('rating', next);
                        }}
                        className={`gm3-icon-btn gm3-star-btn ${
                          starPop === star ? 'gm3-pop-once' : ''
                        } w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-[var(--surface-high)] ${
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
                      className="gm3-menu-item w-full text-left px-3 py-2 text-xs font-medium text-[var(--accent-ink)] hover:bg-[var(--surface-high)] cursor-pointer"
                    >
                      Criar primeiro setlist
                    </button>
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto px-1.5 py-1">
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
                          className={`gm3-menu-item w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-2 ${
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
                  {editMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onOpenChordPro();
                      }}
                      className="gm3-menu-item w-full text-left px-3 py-2 text-[13px] font-medium text-[var(--accent-ink)] hover:bg-[var(--surface-high)] cursor-pointer flex items-center justify-between gap-2"
                    >
                      <span>Editar fonte ChordPro (.cho)</span>
                      <span className="text-[11px] font-normal text-[var(--muted)]">rascunho</span>
                    </button>
                  )}
                  {editMode && (
                    <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-[var(--muted)]">
                      Salve ou cancele a edição visual para usar:
                    </div>
                  )}
                  {song.spotifyTrackId && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onToggleSpotifyPreview();
                      }}
                      className="gm3-menu-item w-full text-left px-3 py-2 text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer"
                    >
                      {showSpotifyPreview ? 'Ocultar player do Spotify' : 'Ouvir prévia no Spotify'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={editMode}
                    onClick={() => {
                      setMoreOpen(false);
                      onEditNotes();
                    }}
                    className={`gm3-menu-item w-full text-left px-3 py-2 text-[13px] ${
                      editMode
                        ? 'text-[var(--muted)] opacity-50 cursor-not-allowed'
                        : 'text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer'
                    }`}
                  >
                    {song.notes ? 'Editar notas de palco' : 'Adicionar notas de palco'}
                  </button>
                  <button
                    type="button"
                    disabled={editMode}
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenSpotifyPicker();
                    }}
                    className={`gm3-menu-item w-full text-left px-3 py-2 text-[13px] ${
                      editMode
                        ? 'text-[var(--muted)] opacity-50 cursor-not-allowed'
                        : 'text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer'
                    }`}
                  >
                    {song.spotifyTrackId ? 'Trocar vínculo no Spotify' : 'Buscar faixa no Spotify'}
                  </button>
                  <button
                    type="button"
                    disabled={editMode}
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenEnhance();
                    }}
                    className={`gm3-menu-item w-full text-left px-3 py-2 text-[13px] ${
                      editMode
                        ? 'text-[var(--muted)] opacity-50 cursor-not-allowed'
                        : 'text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer'
                    }`}
                  >
                    Revisar letra e acordes com IA
                  </button>
                  <button
                    type="button"
                    disabled={editMode}
                    onClick={() => {
                      setMoreOpen(false);
                      onOpenHistory();
                    }}
                    className={`gm3-menu-item w-full text-left px-3 py-2 text-[13px] ${
                      editMode
                        ? 'text-[var(--muted)] opacity-50 cursor-not-allowed'
                        : 'text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer'
                    }`}
                  >
                    Histórico de versões
                  </button>
                  {!editMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onOpenChordPro();
                      }}
                      className="gm3-menu-item w-full text-left px-3 py-2 text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer"
                    >
                      Editar fonte ChordPro (.cho)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {onExpandHeader && (
            <div
              data-compact-slot="true"
              data-collapsed={compact ? undefined : 'true'}
              aria-hidden={!compact || undefined}
              inert={!compact || undefined}
              className="gm3-slot-x flex-shrink-0"
            >
              <div className="gm3-slot-x-inner pl-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onExpandHeader();
                    requestAnimationFrame(() => metaTriggerRef.current?.focus({ preventScroll: true }));
                  }}
                  className="gm3-icon-btn w-9 h-9 flex items-center justify-center bg-[var(--bg)] text-[var(--ink)] hover:bg-[var(--surface-high)] flex-shrink-0 cursor-pointer"
                  title="Mostrar todos os controles da música"
                  aria-label="Expandir cabeçalho e controles"
                >
                  <ChevronDownIcon size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Row 2 (full width on < lg, col 1 on >= lg): Calm Artist + Musical Metadata line */}
        <div
          className={`gm3-collapsible gm3-header-collapse col-span-2 row-start-2 lg:col-span-1 lg:col-start-1 lg:row-start-2 min-w-0 ${
            metaMounted ? 'relative z-20' : ''
          }`}
          data-collapsed={compact ? 'true' : undefined}
          aria-hidden={compact || undefined}
          inert={compact || undefined}
        >
          <div className={metaMounted ? 'gm3-collapsible-inner-open' : 'gm3-collapsible-inner'}>
            <div
              className={`${
                isEditingTitle ? 'pt-1.5 gap-y-1.5' : 'pt-1 lg:pt-1.5 gap-y-1'
              } pb-0.5 px-1 -mx-1 flex flex-wrap items-center gap-x-2 min-w-0 sm:pl-1`}
            >
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
                  className="studio-input text-base lg:text-sm text-[var(--ink)] px-2.5 py-1 min-h-[38px] lg:min-h-[34px] min-w-[110px] flex-1 sm:flex-none sm:w-56 max-w-[200px] sm:max-w-[240px]"
                  placeholder="Artista não informado"
                  aria-label="Artista"
                />
              ) : (
                <p className="text-xs sm:text-[13px] text-[var(--muted)] truncate max-w-[180px] sm:max-w-[240px]">
                  {artistInput || 'Artista não informado'}
                </p>
              )}

              {/* Compact metadata trigger -> opens popover cleanly outside scroll */}
              <div ref={metaRef} className="relative flex items-center gap-1.5 flex-wrap">
                <button
                  ref={metaTriggerRef}
                  type="button"
                  onClick={() => {
                    setBpmDraft(String(song.tempo));
                    setBpmHint('');
                    setKeyQuality(isMinorKey(song.originalKey) ? 'minor' : 'major');
                    setDurationDraft(song.duration ? formatDuration(song.duration) : '');
                    setDurationHint('');
                    setMetaOpen((v) => !v);
                  }}
                  aria-expanded={metaOpen}
                  aria-haspopup="dialog"
                  className={`pill-btn min-h-[38px] group ${
                    editMode
                      ? 'bg-[var(--surface)] border border-[var(--line-subtle)]/75 hover:bg-[var(--surface-high)] px-2.5'
                      : 'bg-transparent hover:bg-[var(--surface-high)] px-1.5'
                  }`}
                  title="Ajustar tom, capo, andamento (BPM), compasso e duração"
                >
                  {displayedKey && (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-xs font-medium text-[var(--muted)]">Tom</span>{' '}
                      <Gm3FocalBadge
                        size="sm"
                        tone={minorKey ? 'minor' : 'primary'}
                        vtSongKey={compact ? undefined : song.id}
                        title={`Tom ${displayedKey}`}
                      >
                        {displayedKey}
                      </Gm3FocalBadge>
                    </span>
                  )}
              {song.capo > 0 && (
                <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)]">
                  Capo {song.capo}
                </span>
              )}
              <span className="font-mono text-xs text-[var(--muted)] group-hover:text-[var(--ink)] tabular-nums">
                {!song.tempoConfirmed ? '~' : ''}{song.tempo} BPM
                <span className={editMode ? 'hidden sm:inline' : ''}>
                  {' '}· {song.timeSignature}
                  {song.duration ? ` · ${formatDuration(song.duration)}` : ''}
                </span>
              </span>
              {editMode && (
                <ChevronDownIcon size={13} className="gm3-chevron text-[var(--muted)] ml-0.5 flex-shrink-0" />
              )}
            </button>

            {song.capo > 0 && !editMode && (
              <button
                type="button"
                aria-pressed={capoDisplay === 'shapes'}
                onClick={() =>
                  setCapoDisplay(capoDisplay === 'shapes' ? 'sounding' : 'shapes')
                }
                className={`pill-btn px-3 h-9 text-xs ${
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

            {metaMounted && (
              <div
                role="dialog"
                aria-label="Ajustes musicais da faixa"
                inert={metaClosing || undefined}
                className={`gm3-popover-top-left ${metaClosing ? 'gm3-popover-exit' : ''} absolute left-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-32px))] rounded-[24px] bg-[var(--surface)] p-4 space-y-3`}
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                <div className="field-label">Propriedades da música</div>

                {/* Original Key: 1-tap 12-note pill grid + Maior/Menor toggle */}
                <div className="space-y-2" role="group" aria-label="Tom original">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--ink)]">
                      Tom original{song.originalKey ? `: ${song.originalKey}` : ''}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <ConnectedGroup value={keyQuality} ariaLabel="Modo do tom" subtle>
                        <button
                          type="button"
                          aria-pressed={keyQuality === 'major'}
                          onClick={() => {
                            setKeyQuality('major');
                            if (currentKeyRoot) onPatchMeta('key', currentKeyRoot);
                          }}
                          className="gm3-connected-btn inline-flex items-center justify-center px-2.5 h-8 text-xs font-medium cursor-pointer"
                        >
                          Maior
                        </button>
                        <button
                          type="button"
                          aria-pressed={keyQuality === 'minor'}
                          onClick={() => {
                            setKeyQuality('minor');
                            if (currentKeyRoot) onPatchMeta('key', `${currentKeyRoot}m`);
                          }}
                          className="gm3-connected-btn inline-flex items-center justify-center px-2.5 h-8 text-xs font-medium cursor-pointer"
                        >
                          Menor
                        </button>
                      </ConnectedGroup>
                      {song.originalKey && (
                        <button
                          type="button"
                          onClick={() => onPatchMeta('key', '')}
                          className="text-[11px] font-mono text-[var(--muted)] hover:text-[var(--ink)] px-1 py-1 cursor-pointer"
                          title="Limpar tom"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {KEY_ROOTS.map((root) => {
                      const candidate = keyQuality === 'minor' ? `${root}m` : root;
                      const active = song.originalKey === candidate;
                      return (
                        <button
                          key={root}
                          type="button"
                          data-key-option={candidate}
                          aria-pressed={active}
                          onClick={() => onPatchMeta('key', candidate)}
                          className={`h-9 rounded-xl font-mono text-xs font-bold transition-colors cursor-pointer ${
                            active
                              ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                              : 'bg-[var(--bg)] text-[var(--ink)] hover:bg-[var(--surface-high)]'
                          }`}
                        >
                          {candidate}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Capo */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--ink)]">Capotraste</span>
                  <div className="gm3-btn-group">
                    <button
                      type="button"
                      onClick={() => onPatchMeta('capo', Math.max(0, song.capo - 1))}
                      className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9 text-xs font-mono"
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
                      className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9 text-xs font-mono"
                      aria-label="Aumentar capotraste"
                    >
                      +
                    </button>
                  </div>
                </div>

                {song.capo > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--muted)]">Mostrar acordes como</span>
                    <ConnectedGroup
                      value={capoDisplay}
                      ariaLabel="Formato de exibição dos acordes com capo"
                      subtle
                    >
                      <button
                        type="button"
                        aria-pressed={capoDisplay === 'sounding'}
                        onClick={() => setCapoDisplay('sounding')}
                        className="gm3-connected-btn min-h-[36px] px-3 py-1 text-xs font-medium cursor-pointer"
                      >
                        Tom real
                      </button>
                      <button
                        type="button"
                        aria-pressed={capoDisplay === 'shapes'}
                        onClick={() => setCapoDisplay('shapes')}
                        className="gm3-connected-btn min-h-[36px] px-3 py-1 text-xs font-medium cursor-pointer"
                      >
                        Formas
                      </button>
                    </ConnectedGroup>
                  </div>
                )}

                {/* BPM */}
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
                        onClick={handleMetaTapTempo}
                        className="pill-btn pill-btn-tonal px-2.5 h-10 lg:h-9 text-xs font-mono font-semibold"
                        title="Toque no pulso da música para detectar o BPM automaticamente"
                      >
                        Tap
                      </button>
                      <div className="gm3-btn-group">
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            startBpmHold(-1);
                          }}
                          onPointerUp={stopBpmHold}
                          onPointerLeave={stopBpmHold}
                          onPointerCancel={stopBpmHold}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              stepBpm(-1);
                            }
                          }}
                          className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9 text-xs font-mono touch-none select-none"
                          aria-label="Diminuir andamento em 1 BPM"
                          title="Diminuir BPM (segure para ajustar rápido)"
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
                          className="studio-input w-14 text-center text-base lg:text-xs font-mono py-1.5 min-h-[40px] lg:min-h-[34px]"
                        />
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            startBpmHold(1);
                          }}
                          onPointerUp={stopBpmHold}
                          onPointerLeave={stopBpmHold}
                          onPointerCancel={stopBpmHold}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              stepBpm(1);
                            }
                          }}
                          className="pill-btn bg-[var(--bg)] w-10 h-10 lg:w-9 lg:h-9 text-xs font-mono touch-none select-none"
                          aria-label="Aumentar andamento em 1 BPM"
                          title="Aumentar BPM (segure para ajustar rápido)"
                        >
                          +
                        </button>
                      </div>
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
                    className="studio-input px-2.5 py-1.5 min-h-[40px] lg:min-h-[34px] text-base lg:text-xs font-mono"
                  >
                    <option value="4/4">4/4</option>
                    <option value="3/4">3/4</option>
                    <option value="6/8">6/8</option>
                    <option value="2/4">2/4</option>
                    <option value="5/4">5/4</option>
                    <option value="7/8">7/8</option>
                  </select>
                </div>

                {/* Duration */}
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
                      className="studio-input w-20 text-center text-base lg:text-xs font-mono py-1.5 min-h-[40px] lg:min-h-[34px]"
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

        {/*
          Row 3 on < lg: ONE single horizontal scrollable pill strip merging actions + toolbar,
          wrapped in gm3-collapsible-mobile so scrolling collapses it smoothly to 0fr.
          On >= lg: gm3-collapsible-mobile dissolves via display: contents; Action Pills collapse
          horizontally via gm3-collapsible-desktop-x and toolbarSlot collapses vertically via gm3-collapsible-desktop.
        */}
        <div
          className="gm3-collapsible-mobile relative col-span-2 row-start-3"
          data-collapsed={compact ? 'true' : undefined}
          aria-hidden={compact || undefined}
          inert={compact || undefined}
        >
          <div className="gm3-collapsible-inner lg:contents">
            <div className="pt-1.5 pb-1 px-1 -mx-1 lg:p-0 lg:m-0 lg:contents">
              <div className="relative lg:contents">
                <div
                  className={`rounded-2xl bg-[var(--surface-high)] px-2 py-1.5 flex items-center gap-1.5 flex-nowrap lg:contents ${
                    editMode ? 'w-full' : 'pr-9 overflow-x-auto no-scrollbar'
                  }`}
                >
                  {/* Header Action Pills (hidden on mobile during editMode so edit bar stays spotless) */}
                  <div
                    className="gm3-collapsible-desktop-x lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center"
                    data-collapsed={compact ? 'true' : undefined}
                  >
                    <div className="contents lg:block lg:min-w-0 lg:overflow-hidden">
                      <div
                        className={`${
                          editMode ? 'hidden lg:flex' : 'flex'
                        } items-center gap-1.5 flex-nowrap flex-shrink-0 lg:justify-end lg:p-1`}
                      >
              {/* Show Mode CTA first on mobile/tablet when in setlist */}
              {activeSetlist && !editMode && (
                <button
                  type="button"
                  onClick={onEnterShowMode}
                  className="pill-btn pill-btn-rec px-3.5 h-9 text-xs flex-shrink-0 order-first lg:order-none"
                  title="Abrir no Modo Show com deslize entre músicas"
                >
                  <PlayIcon size={12} />
                  Show
                </button>
              )}

              {/* Reading mode M3 Expressive Connected Button Group */}
              {!editMode && (
                <ConnectedGroup
                  value={displayMode}
                  ariaLabel="Modo de leitura"
                  className="flex-shrink-0"
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
                        onClick={() => onSetDisplayMode(mode)}
                        aria-pressed={active}
                        title={
                          mode === 'lyrics-only'
                            ? 'Esconde os acordes e melhora a tipografia para cantar (atalho: L)'
                            : undefined
                        }
                        className="gm3-connected-btn px-3 h-9 text-xs font-medium cursor-pointer"
                      >
                        {label}
                      </button>
                    );
                  })}
                </ConnectedGroup>
              )}

              {/* Pitch guide */}
              {pitchTarget && !editMode && (
                <button
                  type="button"
                  onClick={handlePlayPitch}
                  className={`pill-btn px-2.5 h-9 text-xs flex-shrink-0 ${
                    pitchRinging ? 'pill-btn-primary' : 'text-[var(--accent-ink)]'
                  }`}
                  title={`Tocar acorde-guia (${pitchTarget}) para pegar o tom antes de começar`}
                >
                  <PitchWaveIcon size={14} className={pitchRinging ? 'gm3-wave-ringing' : undefined} />
                  {pitchRinging ? 'Tocando…' : 'Guia'}
                </button>
              )}

              {/* Slideshow paginated stage mode */}
              {!editMode && (
                <button
                  type="button"
                  onClick={onEnterSlidesMode}
                  className="pill-btn px-3 h-9 text-xs flex-shrink-0"
                  title={
                    activeSetlist
                      ? 'Abrir o setlist inteiro em páginas (Slides) para iPad e pedal Bluetooth'
                      : 'Abrir esta música em páginas (Slides) para iPad e pedal Bluetooth'
                  }
                >
                  <SlidesIcon size={14} />
                  Slides
                </button>
              )}

              {/* Clean reading / Focus mode */}
              {!editMode && (
                <button
                  type="button"
                  onClick={onEnterFocusMode}
                  className="pill-btn px-3 h-9 text-xs flex-shrink-0"
                  title="Esconde menus e barras para ler ou cantar com a tela livre"
                >
                  Tela limpa
                </button>
              )}

              {/* Live session controls */}
              {activeSetlist && !editMode && (
                <div className="flex items-center gap-1.5 flex-nowrap flex-shrink-0">
                  {live.isLeading ? (
                    <>
                      <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec-dot)] animate-pulse" aria-hidden="true" />
                        Liderando
                      </span>
                      <button
                        type="button"
                        onClick={live.stopLeading}
                        className="pill-btn px-3 h-9 text-xs flex-shrink-0"
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
                        className="pill-btn px-3 h-9 text-xs flex-shrink-0"
                      >
                        Assumir
                      </button>
                      <button
                        type="button"
                        onClick={live.unfollow}
                        className="pill-btn px-3 h-9 text-xs flex-shrink-0"
                        title="Sair do acompanhamento automático e navegar livremente neste aparelho"
                      >
                        Desconectar
                      </button>
                    </>
                  ) : live.hasRemoteLeader && live.localUnfollow ? (
                    <button
                      type="button"
                      onClick={live.refollow}
                      className="pill-btn pill-btn-tune px-3 h-9 text-xs flex-shrink-0"
                      title={`Voltar a acompanhar ${live.session.leaderName}`}
                    >
                      Seguir {live.session.leaderName}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGoLive}
                      className="pill-btn px-3 h-9 text-xs flex-shrink-0"
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
                </div>
              )}

              {/* Spotify quick preview */}
              {song.spotifyTrackId && !editMode && (
                <button
                  type="button"
                  aria-pressed={showSpotifyPreview}
                  onClick={onToggleSpotifyPreview}
                  className={`pill-btn px-3 h-9 text-xs flex-shrink-0 lg:hidden xl:inline-flex ${
                    showSpotifyPreview ? 'pill-btn-tune' : ''
                  }`}
                  title="Ouvir faixa original no Spotify"
                >
                  <HeadphonesIcon size={14} />
                  Ouvir
                </button>
              )}
                    </div>
                  </div>
                </div>

                {!editMode && (
                  <span
                    aria-hidden="true"
                    className="lg:hidden w-px h-5 bg-[var(--line-subtle)] flex-shrink-0 mx-0.5"
                  />
                )}

                {/* Unified Toolbar Slot: inline inside the horizontal scroll on < lg, full-width collapsible Row 3 on >= lg */}
                <div
                  className="gm3-collapsible-desktop lg:col-span-3 lg:row-start-3"
                  data-collapsed={compact ? 'true' : undefined}
                >
                  <div className="contents lg:block gm3-collapsible-inner">
                    <div className="contents lg:block lg:pt-2 lg:pb-1 lg:px-1 lg:-mx-1">
                      {toolbarSlot}
                    </div>
                  </div>
                </div>
              </div>

              {!editMode && (
                <div
                  aria-hidden="true"
                  className="lg:hidden pointer-events-none absolute right-0 top-0 bottom-0 w-9 rounded-r-2xl bg-gradient-to-l from-[var(--surface-high)] to-transparent"
                />
              )}
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Centered Go-Live name prompt modal (never clips inside horizontal scroll strip) */}
      {goLiveMounted && (
        <div
          className={`${goLiveClosing ? 'gm3-backdrop-exit' : 'gm3-backdrop-enter'} fixed inset-0 z-[75] bg-black/45 flex items-center justify-center p-4`}
          onClick={goLiveClosing ? undefined : () => setShowNamePrompt(false)}
          inert={goLiveClosing || undefined}
        >
          <div
            ref={goLiveDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="song-go-live-title"
            className={`${goLiveClosing ? 'gm3-dialog-exit' : 'gm3-dialog-enter'} w-full max-w-xs bg-[var(--surface)] rounded-[28px] p-6 space-y-4`}
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 id="song-go-live-title" className="font-display text-lg font-bold text-[var(--ink)]">
                Iniciar Ao Vivo
              </h2>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Seu nome, para a banda saber quem está puxando a música:
              </p>
            </div>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmGoLive();
              }}
              aria-label="Seu nome na sessão ao vivo"
              placeholder="Ex.: Alex - Guitarra"
              className="studio-input w-full px-3.5 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNamePrompt(false)}
                className="pill-btn bg-[var(--bg)] h-10 px-4 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmGoLive}
                className="pill-btn pill-btn-primary h-10 px-4 text-xs"
              >
                Iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

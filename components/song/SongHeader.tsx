'use client';

import { useEffect, useRef, useState } from 'react';
import type { ParsedSong, Setlist } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence } from '@/lib/hooks/use-animated-presence';
import { isMinorKey } from '@/lib/utils/music';
import { SongMetaPopover } from './SongMetaPopover';
import { SongAdjustmentsPopover } from './SongAdjustmentsPopover';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  MenuListIcon,
  MoreVertIcon,
  PauseIcon,
  PlayIcon,
  SlidersIcon,
  SlidesIcon,
} from '@/components/ui/Icons';

interface SongHeaderProps {
  song: ParsedSong;
  displayedKey: string;
  pitchTarget: string;
  beatsPerBar: number;
  chordCount: number;
  titleInput: string;
  artistInput: string;
  onTitleChange: (v: string) => void;
  onArtistChange: (v: string) => void;
  onSaveTitle: () => void;
  onSaveArtist: () => void;
  onPatchMeta: (key: string, value: string | number) => void;
  // Modes & navigation
  editMode: boolean;
  editingIdentity: boolean;
  onSetEditingIdentity: (v: boolean) => void;
  scrolled: boolean;
  onBack: () => void;
  onEnterFocusMode: () => void;
  onEnterSlidesMode: () => void;
  onEnterEdit: () => void;
  // Setlist & live
  activeSetlist: Setlist | null;
  setlistSongIdx: number;
  totalSetlistSongs: number;
  prevSongId: string | null;
  nextSongId: string | null;
  onNavigateSong: (songId: string) => void;
  onOpenSetlistDrawer: () => void;
  live: ReturnType<typeof useLiveSession>;
  handleGoLive: () => void;
  confirmGoLive: () => void;
  showNamePrompt: boolean;
  nameInput: string;
  setNameInput: (v: string) => void;
  setShowNamePrompt: (v: boolean) => void;
  // Rehearsal & adjustments actions
  audioBlocked: boolean;
  onUnlockAudio: () => void;
  hasCalibration: boolean;
  canCalibrate: boolean;
  calibrating: boolean;
  onStartCalibration: () => void;
  onClearCalibration: () => void;
  onSaveBpm: (bpm: number) => void;
  onRequestSaveTranspose: () => void;
  onTriggerCountIn: () => void;
  onToggleChordsRef: () => void;
  // Secondary menu actions ("Mais")
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
  /** Pinned edit toolbar rendered below the title row when editMode === true */
  editToolbarSlot?: React.ReactNode;
}

/**
 * Constant-height GM3 Pinned Top Bar (56px in reading mode).
 * Zero layout height shifts on scroll, zero title-scaling distortion, zero scroll-back fights.
 */
export function SongHeader({
  song,
  displayedKey,
  pitchTarget,
  beatsPerBar,
  chordCount,
  titleInput,
  artistInput,
  onTitleChange,
  onArtistChange,
  onSaveTitle,
  onSaveArtist,
  onPatchMeta,
  editMode,
  editingIdentity,
  onSetEditingIdentity,
  scrolled,
  onBack,
  onEnterFocusMode,
  onEnterSlidesMode,
  onEnterEdit,
  activeSetlist,
  setlistSongIdx,
  totalSetlistSongs,
  prevSongId,
  nextSongId,
  onNavigateSong,
  onOpenSetlistDrawer,
  live,
  handleGoLive,
  confirmGoLive,
  showNamePrompt,
  nameInput,
  setNameInput,
  setShowNamePrompt,
  audioBlocked,
  onUnlockAudio,
  hasCalibration,
  canCalibrate,
  calibrating,
  onStartCalibration,
  onClearCalibration,
  onSaveBpm,
  onRequestSaveTranspose,
  onTriggerCountIn,
  onToggleChordsRef,
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
  editToolbarSlot,
}: SongHeaderProps) {
  const store = usePlayerStore();
  const { fontSize, chordsRefOpen, sheetColumns } = useDisplayStore();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const adjustRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const adjustTriggerRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const goLiveDialogRef = useRef<HTMLDivElement>(null);

  const { mounted: adjustMounted, closing: adjustClosing } = useAnimatedPresence(adjustOpen, 200);
  const { mounted: moreMounted, closing: moreClosing } = useAnimatedPresence(moreOpen, 200);
  const { mounted: goLiveMounted, closing: goLiveClosing } = useAnimatedPresence(showNamePrompt, 220);

  useDialogA11y(showNamePrompt, () => setShowNamePrompt(false), goLiveDialogRef);

  useEffect(() => {
    if (editingIdentity) {
      requestAnimationFrame(() => titleInputRef.current?.focus());
    }
  }, [editingIdentity]);

  useEffect(() => {
    if (!adjustOpen && !moreOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (adjustOpen && adjustRef.current && !adjustRef.current.contains(e.target as Node)) {
        setAdjustOpen(false);
      }
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (adjustOpen) {
          setAdjustOpen(false);
          adjustTriggerRef.current?.focus();
        }
        if (moreOpen) {
          setMoreOpen(false);
          moreTriggerRef.current?.focus();
        }
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [adjustOpen, moreOpen]);

  const minorKey = isMinorKey(displayedKey);
  const keyChipToneClasses = minorKey
    ? 'bg-[var(--minor-container)] text-[var(--on-minor-container)]'
    : 'bg-[var(--primary-container)] text-[var(--on-primary-container)]';

  const hasActiveAdjustments =
    store.transpose !== 0 ||
    fontSize !== 100 ||
    store.metronomeOn ||
    chordsRefOpen ||
    sheetColumns === 2 ||
    live.isLeading ||
    live.isFollowing;

  const moreMenuDialog = moreMounted ? (
    <div
      role="dialog"
      aria-label="Mais ações da música"
      inert={moreClosing || undefined}
      className={`gm3-popover-top-right ${moreClosing ? 'gm3-popover-exit' : ''} absolute right-0 top-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-24px))] max-h-[min(78vh,560px)] overflow-y-auto rounded-[24px] bg-[var(--surface)] py-2`}
      style={{ boxShadow: 'var(--shadow-md)' }}
    >
      {/* Primary edit actions */}
      {!editMode && (
        <>
          <div className="px-1.5 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onEnterEdit();
              }}
              className="gm3-menu-item w-full text-left px-3 py-2 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer flex items-center gap-2"
            >
              <EditIcon size={14} className="text-[var(--muted)]" />
              Editar letra e acordes
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onSetEditingIdentity(true);
              }}
              className="gm3-menu-item w-full text-left px-3 py-2 text-[13px] text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer"
            >
              Renomear título e artista
            </button>
          </div>
          <div className="my-1.5 mx-3 border-t border-[var(--line-subtle)]/40" />
        </>
      )}

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
          {song.notes ? 'Editar notas de palco (Deixa)' : 'Adicionar notas de palco (Deixa)'}
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
  ) : null;

  // Dedicated pinned Edit Top Bar (keeps Title/Artist/Meta + Undo/Redo/Save always reachable)
  if (editMode) {
    return (
      <header className="relative z-30 flex-shrink-0 bg-[var(--bg)] border-b border-[var(--line-subtle)]/35 px-3 sm:px-6 lg:px-8 py-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <input
              ref={titleInputRef}
              type="text"
              value={titleInput}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={onSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveTitle();
              }}
              className="studio-input font-display font-bold text-base sm:text-xl leading-tight text-[var(--ink)] px-2.5 py-1 w-full max-w-xl"
              aria-label="Título da música"
            />
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <input
                type="text"
                value={artistInput}
                onChange={(e) => onArtistChange(e.target.value)}
                onBlur={onSaveArtist}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveArtist();
                }}
                className="studio-input text-base lg:text-sm text-[var(--ink)] px-2.5 py-1 min-h-[38px] lg:min-h-[34px] w-40 sm:w-52"
                placeholder="Artista"
                aria-label="Artista"
              />
              <SongMetaPopover
                song={song}
                displayedKey={displayedKey}
                onPatchMeta={onPatchMeta}
                editMode
              />
            </div>
          </div>

          <div ref={moreRef} className="relative flex-shrink-0">
            <button
              ref={moreTriggerRef}
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className="pill-btn h-9 px-2.5 sm:px-3 text-xs"
              title="Mais ações da música"
              aria-label="Mais ações"
            >
              <span className="sm:hidden">
                <MoreVertIcon size={17} />
              </span>
              <span className="hidden sm:inline-flex items-center gap-1">
                Mais
                <ChevronDownIcon size={14} className="gm3-chevron" />
              </span>
            </button>
            {moreMenuDialog}
          </div>
        </div>

        {editToolbarSlot}
      </header>
    );
  }

  // Calm, constant-height 56px Top App Bar in Reading Mode (zero height shift on scroll!)
  return (
    <>
      <header
        data-song-topbar="true"
        data-scrolled={scrolled ? 'true' : undefined}
        className={`relative z-30 flex-shrink-0 h-[56px] px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 border-b transition-colors duration-200 ${
          scrolled
            ? 'bg-[var(--surface)]/95 backdrop-blur-md border-[var(--line-subtle)]/35'
            : 'bg-transparent border-transparent'
        }`}
      >
        {/* Left: Back + Setlist (md+) + Title + subtle Key chip (when scrolled) */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className={`group gm3-icon-btn w-9 h-9 flex items-center justify-center text-[var(--ink)] flex-shrink-0 cursor-pointer ${
              scrolled ? 'bg-[var(--bg)] hover:bg-[var(--surface-high)]' : 'bg-[var(--surface)] hover:bg-[var(--surface-high)]'
            }`}
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

          {activeSetlist && (
            <>
              {/* Desktop (lg+): full prev / counter / next stepper */}
              <div className="hidden lg:inline-flex gm3-btn-group flex-shrink-0">
                <button
                  type="button"
                  onClick={() => prevSongId && onNavigateSong(prevSongId)}
                  disabled={!prevSongId || live.isFollowing}
                  className={`pill-btn w-9 h-9 ${scrolled ? 'bg-[var(--bg)]' : ''}`}
                  title="Música anterior no setlist"
                  aria-label="Música anterior no setlist"
                >
                  <ChevronLeftIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={onOpenSetlistDrawer}
                  className={`pill-btn px-2.5 h-9 font-mono text-xs tabular-nums ${scrolled ? 'bg-[var(--bg)]' : ''}`}
                  title="Abrir lista do setlist (atalho: S)"
                >
                  {setlistSongIdx + 1}/{totalSetlistSongs}
                </button>
                <button
                  type="button"
                  onClick={() => nextSongId && onNavigateSong(nextSongId)}
                  disabled={!nextSongId || live.isFollowing}
                  className={`pill-btn w-9 h-9 ${scrolled ? 'bg-[var(--bg)]' : ''}`}
                  title="Próxima música no setlist"
                  aria-label="Próxima música no setlist"
                >
                  <ChevronRightIcon size={16} />
                </button>
              </div>
              {/* Tablet portrait (md..lg): compact single counter pill opening setlist drawer */}
              <button
                type="button"
                onClick={onOpenSetlistDrawer}
                className={`hidden md:inline-flex lg:hidden pill-btn h-9 px-2.5 font-mono text-xs tabular-nums flex-shrink-0 ${
                  scrolled ? 'bg-[var(--bg)]' : ''
                }`}
                title="Abrir lista do setlist (atalho: S)"
                aria-label={`Setlist ${setlistSongIdx + 1} de ${totalSetlistSongs}`}
              >
                <MenuListIcon size={14} />
                {setlistSongIdx + 1}/{totalSetlistSongs}
              </button>
            </>
          )}

          {editingIdentity ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <input
                ref={titleInputRef}
                type="text"
                value={titleInput}
                onChange={(e) => onTitleChange(e.target.value)}
                onBlur={onSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSaveTitle();
                    onSetEditingIdentity(false);
                  }
                  if (e.key === 'Escape') {
                    onSetEditingIdentity(false);
                  }
                }}
                className="studio-input font-display font-bold text-base sm:text-lg text-[var(--ink)] px-2.5 py-1 min-w-0 flex-1 max-w-xs"
                aria-label="Título da música"
              />
              <input
                type="text"
                value={artistInput}
                onChange={(e) => onArtistChange(e.target.value)}
                onBlur={onSaveArtist}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSaveArtist();
                    onSetEditingIdentity(false);
                  }
                }}
                className="hidden sm:block studio-input text-xs text-[var(--ink)] px-2.5 py-1 w-40"
                placeholder="Artista"
                aria-label="Artista"
              />
              <button
                type="button"
                onClick={() => {
                  onSaveTitle();
                  onSaveArtist();
                  onSetEditingIdentity(false);
                }}
                className="pill-btn pill-btn-tonal px-3 h-9 text-xs flex-shrink-0"
              >
                <CheckIcon size={14} />
                OK
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h1
                data-vt-song-title={song.id}
                title={titleInput || song.title}
                className="font-display font-bold text-[17px] sm:text-xl text-[var(--ink)] truncate leading-tight"
              >
                {titleInput || song.title}
              </h1>
              {displayedKey && (
                <span
                  aria-hidden={!scrolled || undefined}
                  className={`hidden sm:inline-flex studio-chip ${keyChipToneClasses} font-semibold px-2.5 py-0.5 text-xs flex-shrink-0 transition-opacity duration-200 ${
                    scrolled ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {displayedKey}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Active live chips + ONLY 4 calm primary controls (Rolar, Tela limpa, Slides, Ajustes, Mais) */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {store.metronomeOn && (
            <button
              type="button"
              onClick={() => store.setMetronomeOn(false)}
              className="hidden sm:inline-flex pill-btn pill-btn-primary h-9 px-2.5 text-xs font-mono tabular-nums"
              title="Metrônomo ativo — toque para parar"
            >
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" aria-hidden="true" />
              {store.bpm}
            </button>
          )}

          {activeSetlist && live.isLeading && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setAdjustOpen((v) => !v);
              }}
              className="hidden sm:inline-flex studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10 cursor-pointer"
              title="Você está liderando o Ao vivo"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec-dot)] animate-pulse" aria-hidden="true" />
              Ao vivo
            </button>
          )}

          {activeSetlist && live.isFollowing && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setAdjustOpen((v) => !v);
              }}
              className="hidden sm:inline-flex studio-chip text-[var(--tune)] bg-[var(--tune-dim)] cursor-pointer"
              title={`Seguindo ${live.session.leaderName}`}
            >
              Seguindo
            </button>
          )}

          {!live.isFollowing && !calibrating && (
            <button
              type="button"
              aria-pressed={store.isAutoScrolling}
              onClick={store.toggleAutoScroll}
              className={`pill-btn h-9 w-9 sm:w-auto sm:px-3 text-xs flex-shrink-0 ${
                store.isAutoScrolling ? 'pill-btn-tune' : scrolled ? 'bg-[var(--bg)]' : ''
              }`}
              title={store.isAutoScrolling ? 'Pausar auto-scroll (Espaço)' : 'Iniciar auto-scroll (Espaço)'}
              aria-label={store.isAutoScrolling ? 'Pausar auto-scroll' : 'Iniciar auto-scroll'}
            >
              {store.isAutoScrolling ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
              <span className="hidden sm:inline">{store.isAutoScrolling ? 'Pausar' : 'Rolar'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onEnterFocusMode}
            className={`hidden lg:inline-flex pill-btn h-9 px-3 text-xs flex-shrink-0 ${
              scrolled ? 'bg-[var(--bg)]' : ''
            }`}
            title="Abrir Tela limpa para tocar ou cantar sem distrações"
          >
            Tela limpa
          </button>

          <button
            type="button"
            onClick={onEnterSlidesMode}
            className={`pill-btn h-9 w-9 sm:w-auto sm:px-3 text-xs flex-shrink-0 ${
              scrolled ? 'bg-[var(--bg)]' : ''
            }`}
            title={
              activeSetlist
                ? 'Abrir setlist em Slides para iPad e pedal Bluetooth'
                : 'Abrir esta música em Slides para iPad e pedal Bluetooth'
            }
            aria-label="Slides"
          >
            <SlidesIcon size={15} />
            <span className="hidden sm:inline">Slides</span>
          </button>

          {/* Unified Adjustments & Rehearsal popover */}
          <div ref={adjustRef} className="relative">
            <button
              ref={adjustTriggerRef}
              type="button"
              data-song-adjustments-trigger="true"
              onClick={() => {
                setMoreOpen(false);
                setAdjustOpen((v) => !v);
              }}
              aria-expanded={adjustOpen}
              aria-haspopup="dialog"
              aria-label="Ajustes e ensaio"
              title="Ajustes de leitura, tom, metrônomo e palco"
              className={`relative pill-btn h-9 w-9 xl:w-auto xl:px-3 text-xs flex-shrink-0 ${
                adjustOpen ? 'pill-btn-tonal' : scrolled ? 'bg-[var(--bg)]' : ''
              }`}
            >
              <SlidersIcon size={16} />
              <span className="hidden xl:inline">Ajustes</span>
              {hasActiveAdjustments && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 xl:static w-2 h-2 rounded-full bg-[var(--accent)]"
                />
              )}
            </button>

            {adjustMounted && (
              <div
                role="dialog"
                aria-label="Ajustes e ferramentas de ensaio"
                data-song-adjustments-popover="true"
                inert={adjustClosing || undefined}
                className={`gm3-popover-top-right ${adjustClosing ? 'gm3-popover-exit' : ''} fixed right-3 top-[60px] sm:absolute sm:right-0 sm:top-[calc(100%+8px)] z-50 w-[min(330px,calc(100vw-24px))] max-h-[min(78vh,620px)] overflow-y-auto rounded-[24px] bg-[var(--surface)] p-4`}
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                <SongAdjustmentsPopover
                  variant="song"
                  displayedKey={displayedKey}
                  pitchTarget={pitchTarget}
                  capo={song.capo}
                  beatsPerBar={beatsPerBar}
                  savedTempo={song.tempo}
                  tempoConfirmed={song.tempoConfirmed}
                  isFollowing={live.isFollowing}
                  audioBlocked={audioBlocked}
                  onUnlockAudio={onUnlockAudio}
                  chordCount={chordCount}
                  onToggleChordsRef={onToggleChordsRef}
                  hasCalibration={hasCalibration}
                  canCalibrate={canCalibrate}
                  calibrating={calibrating}
                  onStartCalibration={onStartCalibration}
                  onClearCalibration={onClearCalibration}
                  hasSpotify={Boolean(song.spotifyTrackId)}
                  showSpotifyPreview={showSpotifyPreview}
                  onToggleSpotifyPreview={onToggleSpotifyPreview}
                  onSaveBpm={onSaveBpm}
                  onRequestSaveTranspose={onRequestSaveTranspose}
                  onTriggerCountIn={onTriggerCountIn}
                  hasSetlist={Boolean(activeSetlist)}
                  live={live}
                  onGoLive={handleGoLive}
                  onEnterFocusMode={onEnterFocusMode}
                  onEnterEdit={onEnterEdit}
                  onClose={() => setAdjustOpen(false)}
                />
              </div>
            )}
          </div>

          {/* Song management menu ("Mais") */}
          <div ref={moreRef} className="relative">
            <button
              ref={moreTriggerRef}
              type="button"
              onClick={() => {
                setAdjustOpen(false);
                setMoreOpen((v) => !v);
              }}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              aria-label="Mais ações"
              title="Mais ações da música"
              className={`pill-btn h-9 w-9 lg:w-auto lg:px-3 text-xs flex-shrink-0 ${
                moreOpen ? 'pill-btn-tonal' : scrolled ? 'bg-[var(--bg)]' : ''
              }`}
            >
              <span className="lg:hidden">
                <MoreVertIcon size={17} />
              </span>
              <span className="hidden lg:inline-flex items-center gap-1">
                Mais
                <ChevronDownIcon size={14} className="gm3-chevron" />
              </span>
            </button>
            {moreMenuDialog}
          </div>
        </div>
      </header>

      {/* Centered Go-Live name prompt modal */}
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
    </>
  );
}

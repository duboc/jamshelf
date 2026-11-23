'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { useLiveSession, type LiveScrollState } from '@/lib/stores/live-session-store';
import {
  extractChords,
  extractLyricText,
  getDiatonicChordsForKey,
  transposeChord,
  parseLine,
  transposeSong,
} from '@/lib/utils/music';
import {
  moveChordWithIndex,
  moveChordByWordWithIndex,
  getChordMoveBounds,
  countChordOccurrences,
  replaceAllChordsInSections,
  findAdjacentChord,
  renameChord,
  deleteChord,
  insertChord,
  addSongSection,
  duplicateSongSection,
  removeSongSection,
  moveSongSection,
  renameSongSection,
} from '@/lib/utils/edit-chordpro';
import {
  parseChordPro,
  songToChordPro,
  removeChordProMeta,
  patchChordProMeta,
  serializeMarks,
} from '@/lib/utils/chordpro-parser';
import { domToLines } from '@/lib/utils/editable-section';
import { hasUsableMarks } from '@/lib/utils/autoscroll';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { ChordPanel } from '@/components/chord-diagrams/ChordPanel';
import { EditChordOverlay } from '@/components/chord-sheet/EditChordOverlay';
import { ChordStampDock } from '@/components/chord-sheet/ChordStampDock';
import { VisualPulse } from '@/components/metronome/VisualPulse';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import { ChordProEditor } from '@/components/ui/ChordProEditor';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CleanStageView } from '@/components/song/CleanStageView';
import { SetlistDrawer } from '@/components/show-mode/SetlistDrawer';
import { EnhanceModal } from '@/components/song/EnhanceModal';
import { VersionHistoryModal } from '@/components/song/VersionHistoryModal';
import { ChordsReference } from '@/components/chord-diagrams/ChordsReference';
import { SongHeader } from '@/components/song/SongHeader';
import { SongHeroStrip } from '@/components/song/SongHeroStrip';
import { SongToolbar } from '@/components/song/SongToolbar';
import { SectionNav } from '@/components/song/SectionNav';
import { SpotifySection } from '@/components/song/SpotifySection';
import { CalibrationBar } from '@/components/song/CalibrationBar';
import { StageNotesBar } from '@/components/song/StageNotesBar';
import { CountInOverlay } from '@/components/song/CountInOverlay';
import { useWakeLock } from '@/lib/hooks/use-wake-lock';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence, useRetainedValue } from '@/lib/hooks/use-animated-presence';
import { ensureMetronomeAudioContext, useMetronomeEngine } from '@/lib/hooks/use-metronome-engine';
import { navigateWithTransition, runStateViewTransition } from '@/lib/utils/view-transition';
import { CloseIcon, PauseIcon, PlusIcon, UndoIcon } from '@/components/ui/Icons';
import type { SpotifyTrackResult } from '@/lib/spotify';

type SelectedCoord = { sectionIdx: number; lineIdx: number; segIdx: number };
type AddTarget = { sectionIdx: number; lineIdx: number; charPos: number };
type ChoModalView = 'split' | 'editor' | 'preview';

export default function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const entries = useSongStore((s) => s.entries);
  const songsLoaded = useSongStore((s) => s.isLoaded);
  const { getSong, patchMeta, exportEntry, updateEntry } = useSongStore();
  const { setlists, addSongToSetlist } = useSetlistStore();
  const store = usePlayerStore();
  const {
    displayMode,
    toggleHideChords,
    chordsRefOpen,
    setChordsRefOpen,
    focusMode,
    setFocusMode,
    capoDisplay,
    singleKeyShortcuts,
  } = useDisplayStore();

  // Source modal state (with live split preview!)
  const [showExport, setShowExport] = useState(false);
  const [choDraft, setChoDraft] = useState('');
  const [choView, setChoView] = useState<ChoModalView>('split');
  const [discardArmed, setDiscardArmed] = useState(false);

  // Other modals & overlays
  const [showEnhance, setShowEnhance] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSetlistDrawer, setShowSetlistDrawer] = useState(false);
  const [showSpotifyPreview, setShowSpotifyPreview] = useState(false);
  const [showSpotifyPicker, setShowSpotifyPicker] = useState(false);
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackResult[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifySuggestionDismissed, setSpotifySuggestionDismissed] = useState(false);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showTransposeConfirm, setShowTransposeConfirm] = useState(false);
  const [showClearCalConfirm, setShowClearCalConfirm] = useState(false);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [arrivedSectionIdx, setArrivedSectionIdx] = useState<number | null>(null);
  const arrivedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpCancelRef = useRef<(() => void) | null>(null);
  const [chordsRefEverOpened, setChordsRefEverOpened] = useState(chordsRefOpen);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const choModalRef = useRef<HTMLDivElement>(null);
  const [localCountIn, setLocalCountIn] = useState<{
    nonce: number;
    bpm: number;
    beats: number;
    leaderName?: string | null;
  } | null>(null);

  // Visual edit mode draft + Undo/Redo stacks (single PUT on save!)
  const [editOriginText, setEditOriginText] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState<string | null>(null);
  const [editSubMode, setEditSubMode] = useState<'text' | 'chords'>('text');
  const [stampChord, setStampChord] = useState<string | null>(null);
  const [pickStampOpen, setPickStampOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [domSyncKey, setDomSyncKey] = useState(0);
  const [editDiscardArmed, setEditDiscardArmed] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState<SelectedCoord | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [deletedSectionToast, setDeletedSectionToast] = useState<{ label: string; nonce: number } | null>(null);
  const [replaceAllToast, setReplaceAllToast] = useState<{
    from: string;
    to: string;
    remaining: number;
    nonce: number;
  } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replaceAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const choPreviewScrollRef = useRef<HTMLDivElement>(null);
  const lastMoveMetaRef = useRef<{ sectionIdx: number; lineIdx: number; at: number } | null>(null);
  const saveVisualEditRef = useRef<(() => void) | null>(null);
  const saveChoRef = useRef<(() => void) | null>(null);

  // Section timing calibration state ("Gravar rolagem")
  const [calibrating, setCalibrating] = useState(false);
  const [calStartMs, setCalStartMs] = useState<number>(0);
  const [calElapsedSec, setCalElapsedSec] = useState(0);
  const [calMarks, setCalMarks] = useState<(number | null)[]>([]);
  const [calNextIdx, setCalNextIdx] = useState(1);

  // Live session (cross-device sync with normalized scrollRatio)
  const setlistIdParam = searchParams.get('setlist');
  const cleanUrlParam = searchParams.get('show') === '1' || searchParams.get('clean') === '1';
  const isCleanStage = !store.editMode && (focusMode || cleanUrlParam);
  const activeSetlist = setlistIdParam
    ? setlists.find((sl) => sl.id === setlistIdParam) ?? null
    : null;
  const scrollStateRef = useRef<LiveScrollState>({ scrollTop: 0, scrollRatio: 0 });
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const live = useLiveSession(activeSetlist ? activeSetlist.id : null, id, scrollStateRef);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const { mounted: exportMounted, closing: exportClosing } = useAnimatedPresence(showExport, 220);
  const { mounted: statusMounted, closing: statusClosing } = useAnimatedPresence(Boolean(statusMsg), 200);
  const displayStatus = useRetainedValue(statusMsg || null);
  const { mounted: deletedToastMounted, closing: deletedToastClosing } = useAnimatedPresence(
    Boolean(deletedSectionToast),
    200
  );
  const displayDeletedToast = useRetainedValue(deletedSectionToast, deletedSectionToast?.nonce ?? null);
  const { mounted: replaceToastMounted, closing: replaceToastClosing } = useAnimatedPresence(
    Boolean(replaceAllToast),
    200
  );
  const displayReplaceToast = useRetainedValue(replaceAllToast, replaceAllToast?.nonce ?? null);
  const activeCountIn =
    localCountIn ??
    (live.incomingCountIn
      ? { ...live.incomingCountIn, leaderName: live.session.leaderName }
      : null);
  const countInKey = activeCountIn
    ? `${activeCountIn.nonce}:${activeCountIn.bpm}:${activeCountIn.beats}:${activeCountIn.leaderName ?? ''}`
    : null;
  const displayCountIn = useRetainedValue(activeCountIn, countInKey);

  // Keep screen awake during Clean Stage, Auto-scroll, or Metronome
  const wakeLock = useWakeLock(
    isCleanStage || store.isAutoScrolling || store.metronomeOn
  );

  const storedSong = useMemo(() => {
    void entries;
    return getSong(id);
  }, [entries, getSong, id]);

  // While visual edit mode is active, render from the local draft (preserving empty sections & trailing blanks)
  // so edits never spam Firestore/GCS and Undo/Redo is instant.
  const song = useMemo(() => {
    if (store.editMode && editDraftText !== null) {
      return parseChordPro(id, editDraftText, { preserveEmptySections: true });
    }
    return storedSong;
  }, [store.editMode, editDraftText, id, storedSong]);

  // Headless Web Audio metronome scheduler mounted at page level so closing Ajustes never interrupts clicks
  const { audioBlocked: metronomeAudioBlocked, unlockAudio: unlockMetronomeAudio } =
    useMetronomeEngine(parseInt(song?.timeSignature ?? '4/4', 10) || 4);

  const allChords = useMemo(
    () => (song ? extractChords(song.sections) : []),
    [song]
  );

  const choPreviewSong = useMemo(() => {
    if (!showExport) return null;
    return parseChordPro(id, choDraft);
  }, [showExport, id, choDraft]);

  const [titleInput, setTitleInput] = useState(song?.title || '');
  const [artistInput, setArtistInput] = useState(song?.artist || '');

  const flashStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatusMsg('');
      statusTimerRef.current = null;
    }, 2600);
  }, []);

  const clearDeletedSectionToast = useCallback(() => {
    if (deletedToastTimerRef.current) {
      clearTimeout(deletedToastTimerRef.current);
      deletedToastTimerRef.current = null;
    }
    setDeletedSectionToast(null);
  }, []);

  const clearReplaceAllToast = useCallback(() => {
    if (replaceAllTimerRef.current) {
      clearTimeout(replaceAllTimerRef.current);
      replaceAllTimerRef.current = null;
    }
    setReplaceAllToast(null);
  }, []);

  const syncedTitle = song?.title ?? '';
  const syncedArtist = song?.artist ?? '';
  const syncedId = song?.id ?? '';
  useEffect(() => {
    if (syncedId) {
      setTitleInput(syncedTitle);
      setArtistInput(syncedArtist);
    }
  }, [syncedId, syncedTitle, syncedArtist]);

  // Reset transient player state cleanly when switching songs
  const songIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!storedSong) return;
    if (songIdRef.current !== storedSong.id) {
      songIdRef.current = storedSong.id;
      store.resetForSong(storedSong.tempo, storedSong.capo, storedSong.scrollSpeed, storedSong.displayKey);
      setActiveSectionIdx(0);
      setSelectedCoord(null);
      setAddTarget(null);
      setEditOriginText(null);
      setEditDraftText(null);
      setEditSubMode('text');
      setStampChord(null);
      setPickStampOpen(false);
      setUndoStack([]);
      setRedoStack([]);
      clearDeletedSectionToast();
      clearReplaceAllToast();
      lastMoveMetaRef.current = null;
      setCalibrating(false);
      setShowSpotifyPreview(false);
      setSpotifySuggestionDismissed(false);
      setEditingIdentity(false);
      setHeaderScrolled(false);
      scrollStateRef.current = { scrollTop: 0, scrollRatio: 0 };
    }
  }, [storedSong, store]);

  useEffect(() => {
    if (storedSong) store.setBpm(storedSong.tempo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSong?.tempo]);

  useEffect(() => {
    if (storedSong) store.setCapo(storedSong.capo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSong?.capo]);

  // Follow live session leader, preserving &show=1 in Clean Stage mode
  useEffect(() => {
    if (!activeSetlist) return;
    if (live.isFollowing && live.session.currentSongId && live.session.currentSongId !== id) {
      const showSuffix = cleanUrlParam ? '&show=1' : '';
      navigateWithTransition(
        router,
        `/song/${live.session.currentSongId}?setlist=${activeSetlist.id}${showSuffix}`,
        { direction: 'next' }
      );
    }
  }, [activeSetlist, live.isFollowing, live.session.currentSongId, id, cleanUrlParam, router]);

  // Auto-search Spotify for unmatched songs
  const spotifySongId = storedSong?.spotifyTrackId ?? null;
  const spotifySongTitle = storedSong?.title ?? '';
  const spotifySongArtist = storedSong?.artist ?? '';
  useEffect(() => {
    if (!spotifySongTitle || spotifySongId) return;
    let cancelled = false;
    const query = `${spotifySongTitle} ${spotifySongArtist}`.trim();
    fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSpotifyResults(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setSpotifyResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [spotifySongId, spotifySongTitle, spotifySongArtist]);

  // Calibration stopwatch tick
  useEffect(() => {
    if (!calibrating) return;
    const timer = setInterval(() => {
      setCalElapsedSec((Date.now() - calStartMs) / 1000);
    }, 200);
    return () => clearInterval(timer);
  }, [calibrating, calStartMs]);

  // Clear edit selection when leaving edit mode
  useEffect(() => {
    if (!store.editMode) {
      const timer = setTimeout(() => {
        setSelectedCoord(null);
        setAddTarget(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [store.editMode]);

  useEffect(() => {
    return () => {
      jumpCancelRef.current?.();
      if (arrivedTimerRef.current) clearTimeout(arrivedTimerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      if (deletedToastTimerRef.current) clearTimeout(deletedToastTimerRef.current);
      if (replaceAllTimerRef.current) clearTimeout(replaceAllTimerRef.current);
    };
  }, []);

  const handleJumpToSection = useCallback((sectionIdx: number) => {
    setActiveSectionIdx(sectionIdx);
    if (arrivedTimerRef.current) clearTimeout(arrivedTimerRef.current);
    jumpCancelRef.current?.();
    jumpCancelRef.current = null;

    const triggerArrival = () => {
      setArrivedSectionIdx(sectionIdx);
      if (arrivedTimerRef.current) clearTimeout(arrivedTimerRef.current);
      arrivedTimerRef.current = setTimeout(() => setArrivedSectionIdx(null), 740);
    };

    const container = sheetScrollRef.current;
    if (!container) {
      triggerArrival();
      return;
    }
    const target = container.querySelector<HTMLElement>(`#section-${sectionIdx}`);
    if (target) {
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      const targetTop = Math.min(maxScroll, Math.max(0, target.offsetTop - 16));
      const startTop = container.scrollTop;
      const delta = targetTop - startTop;

      if (reducedMotion || Math.abs(delta) < 8) {
        container.scrollTop = targetTop;
        triggerArrival();
      } else {
        const durationMs = Math.min(560, Math.max(360, Math.abs(delta) * 0.45));
        const t0 = performance.now();
        let rafId = 0;

        const stop = () => {
          if (rafId) cancelAnimationFrame(rafId);
          container.removeEventListener('wheel', stop);
          container.removeEventListener('touchstart', stop);
          if (jumpCancelRef.current === stop) jumpCancelRef.current = null;
        };

        container.addEventListener('wheel', stop, { passive: true, once: true });
        container.addEventListener('touchstart', stop, { passive: true, once: true });
        jumpCancelRef.current = stop;

        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / durationMs);
          // Smooth quintic deceleration closely matching cubic-bezier(0.22, 1, 0.36, 1)
          const eased = 1 - Math.pow(1 - p, 4);
          container.scrollTop = startTop + delta * eased;
          if (p < 1) {
            rafId = requestAnimationFrame(step);
          } else {
            stop();
            triggerArrival();
          }
        };
        rafId = requestAnimationFrame(step);
      }
      // Move keyboard focus safely to the target section so collapsing SectionNav never drops focus to body
      target.focus({ preventScroll: true });
    }
  }, []);

  const markCalibrationSection = useCallback(
    (sectionIdx: number) => {
      if (!calibrating) return;
      const nowSec = Math.max(0, Number(((Date.now() - calStartMs) / 1000).toFixed(1)));
      setCalMarks((prev) => {
        const next = [...prev];
        next[sectionIdx] = sectionIdx === 0 ? 0 : nowSec;
        return next;
      });
      setCalNextIdx(sectionIdx + 1);
      handleJumpToSection(sectionIdx);
    },
    [calibrating, calStartMs, handleJumpToSection]
  );

  // Synchronous DOM snapshot of in-progress visual edits (prevents 0ms click-Save / Ctrl+Z races)
  const captureLiveDraft = useCallback((): string | null => {
    if (editDraftText === null) return null;
    const baseSong = parseChordPro(id, editDraftText, { preserveEmptySections: true });
    let sectionsChanged = false;
    const nextSections = baseSong.sections.map((sec) => ({ ...sec, lines: [...sec.lines] }));

    const container = sheetScrollRef.current;
    if (container) {
      container.querySelectorAll<HTMLElement>('[data-section-editor-idx]').forEach((el) => {
        const idx = Number(el.dataset.sectionEditorIdx);
        if (!Number.isNaN(idx) && idx >= 0 && idx < nextSections.length) {
          const liveLines = domToLines(el);
          const prev = nextSections[idx].lines;
          if (liveLines.length !== prev.length || liveLines.some((l, i) => l !== prev[i])) {
            nextSections[idx].lines = liveLines;
            sectionsChanged = true;
          }
        }
      });

      container.querySelectorAll<HTMLInputElement>('input[data-section-label-idx]').forEach((input) => {
        const idx = Number(input.dataset.sectionLabelIdx);
        const trimmed = input.value.replace(/[{}]/g, '').trim();
        if (
          !Number.isNaN(idx) &&
          idx >= 0 &&
          idx < nextSections.length &&
          trimmed &&
          trimmed !== nextSections[idx].label
        ) {
          nextSections[idx].label = trimmed;
          sectionsChanged = true;
        }
      });
    }

    let nextText = sectionsChanged
      ? songToChordPro({ ...baseSong, sections: nextSections })
      : editDraftText;

    const cleanTitle = titleInput.replace(/[{}]/g, '').trim();
    const cleanArtist = artistInput.replace(/[{}]/g, '').trim();
    if (cleanTitle && cleanTitle !== baseSong.title) {
      nextText = patchChordProMeta(nextText, 'title', cleanTitle);
    }
    if (cleanArtist !== baseSong.artist) {
      nextText = patchChordProMeta(nextText, 'artist', cleanArtist);
    }
    return nextText;
  }, [editDraftText, id, titleInput, artistInput]);

  // Undo / Redo actions in visual edit mode (seamlessly handles unflushed live DOM edits!)
  const handleUndo = useCallback(() => {
    if (editDraftText === null) return;
    lastMoveMetaRef.current = null;
    clearDeletedSectionToast();
    clearReplaceAllToast();
    const liveText = captureLiveDraft();
    if (liveText !== null && liveText !== editDraftText) {
      setRedoStack((s) => [...s, liveText]);
      setDomSyncKey((k) => k + 1);
      setSelectedCoord(null);
      setAddTarget(null);
      return;
    }
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, editDraftText]);
    setEditDraftText(previous);
    setDomSyncKey((k) => k + 1);
    setSelectedCoord(null);
    setAddTarget(null);
  }, [undoStack, editDraftText, captureLiveDraft, clearDeletedSectionToast, clearReplaceAllToast]);

  const handleRedo = useCallback(() => {
    if (!redoStack.length || editDraftText === null) return;
    lastMoveMetaRef.current = null;
    clearDeletedSectionToast();
    clearReplaceAllToast();
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, editDraftText]);
    setEditDraftText(next);
    setDomSyncKey((k) => k + 1);
    setSelectedCoord(null);
    setAddTarget(null);
  }, [redoStack, editDraftText, clearDeletedSectionToast, clearReplaceAllToast]);

  const existingSetlistSongIds = useMemo(() => {
    void entries;
    return activeSetlist ? activeSetlist.songIds.filter((sid) => getSong(sid) !== null) : [];
  }, [activeSetlist, getSong, entries]);
  const setlistSongIdx = existingSetlistSongIds.indexOf(id);
  const prevSongId = setlistSongIdx > 0 ? existingSetlistSongIds[setlistSongIdx - 1] : null;
  const nextSongId =
    setlistSongIdx >= 0 && setlistSongIdx < existingSetlistSongIds.length - 1
      ? existingSetlistSongIds[setlistSongIdx + 1]
      : null;

  const editDirtyForUnload =
    store.editMode && editOriginText !== null && editDraftText !== null && editDraftText !== editOriginText;

  // Warn before accidental reload/close with unsaved visual edits
  useEffect(() => {
    if (!editDirtyForUnload) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editDirtyForUnload]);

  const choBaselineText = store.editMode && editDraftText !== null ? editDraftText : exportEntry(id) ?? '';
  const choIsDirtyEarly = choDraft !== choBaselineText;
  const closeExportModalCallback = useCallback(() => {
    if (choIsDirtyEarly && !discardArmed) {
      setDiscardArmed(true);
      setTimeout(() => setDiscardArmed(false), 6000);
      return;
    }
    setDiscardArmed(false);
    setShowExport(false);
  }, [choIsDirtyEarly, discardArmed]);

  useDialogA11y(showExport, closeExportModalCallback, choModalRef);

  // Global keyboard shortcuts on song page (CleanStageView handles its own shortcuts)
  useEffect(() => {
    if (isCleanStage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Ctrl/Cmd+S saves visual edit mode or raw .cho modal instead of opening browser Save Page
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') {
        if (showExport) {
          e.preventDefault();
          saveChoRef.current?.();
          return;
        }
        if (store.editMode) {
          e.preventDefault();
          saveVisualEditRef.current?.();
          return;
        }
      }

      // Ctrl/Cmd+Z & Ctrl/Cmd+Y inside visual edit mode (when not typing inside text input)
      if (store.editMode && !showExport && (e.metaKey || e.ctrlKey) && !inInput) {
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
          return;
        }
        if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      if (inInput) return;

      const modalOpen =
        showExport ||
        showEnhance ||
        showHistory ||
        showTransposeConfirm ||
        showClearCalConfirm ||
        showNamePrompt ||
        showSpotifyPicker ||
        showSetlistDrawer;

      const onInteractiveControl = Boolean(
        target &&
          (target.tagName === 'BUTTON' ||
            target.tagName === 'A' ||
            target.tagName === 'SELECT' ||
            target.tagName === 'SUMMARY' ||
            target.getAttribute('role') === 'button')
      );

      if (calibrating) {
        if ((e.key === ' ' || e.key === 'Enter') && !onInteractiveControl) {
          e.preventDefault();
          if (song && calNextIdx < song.sections.length) {
            markCalibrationSection(calNextIdx);
          }
        } else if (e.key === 'Escape') {
          setCalibrating(false);
        }
        return;
      }

      if (e.key === 'Escape' && focusMode && !modalOpen) {
        runStateViewTransition(() => setFocusMode(false), 'morph');
        return;
      }

      if (modalOpen || store.editMode) return;

      if (
        activeSetlist &&
        !live.isFollowing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !onInteractiveControl
      ) {
        if (e.key === 'ArrowRight' && nextSongId) {
          e.preventDefault();
          navigateWithTransition(router, `/song/${nextSongId}?setlist=${activeSetlist.id}`, {
            direction: 'next',
          });
          return;
        }
        if (e.key === 'ArrowLeft' && prevSongId) {
          e.preventDefault();
          navigateWithTransition(router, `/song/${prevSongId}?setlist=${activeSetlist.id}`, {
            direction: 'prev',
          });
          return;
        }
      }

      if (!singleKeyShortcuts || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === ' ' && !live.isFollowing && !onInteractiveControl) {
        e.preventDefault();
        store.toggleAutoScroll();
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        runStateViewTransition(toggleHideChords, 'morph');
      } else if (e.key.toLowerCase() === 's' && activeSetlist) {
        e.preventDefault();
        setShowSetlistDrawer((v) => !v);
      } else if (e.key.toLowerCase() === 'c' && !live.isFollowing && song) {
        e.preventDefault();
        const bpb = parseInt(song.timeSignature, 10) || 4;
        setLocalCountIn({
          nonce: Date.now(),
          bpm: store.bpm,
          beats: bpb,
          leaderName: live.isLeading ? live.deviceName : null,
        });
        if (live.isLeading) live.triggerCountIn(store.bpm, bpb);
      } else if (e.key.toLowerCase() === 'm' && !live.isFollowing) {
        e.preventDefault();
        if (!store.metronomeOn) ensureMetronomeAudioContext();
        store.setMetronomeOn(!store.metronomeOn);
      } else if ((e.key === '+' || e.key === '=') && !live.isFollowing) {
        e.preventDefault();
        store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1);
      } else if ((e.key === '-' || e.key === '_') && !live.isFollowing) {
        e.preventDefault();
        store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isCleanStage,
    store,
    handleUndo,
    handleRedo,
    calibrating,
    song,
    calNextIdx,
    markCalibrationSection,
    focusMode,
    setFocusMode,
    live,
    showExport,
    showEnhance,
    showHistory,
    showTransposeConfirm,
    showClearCalConfirm,
    showNamePrompt,
    showSpotifyPicker,
    showSetlistDrawer,
    singleKeyShortcuts,
    toggleHideChords,
    activeSetlist,
    nextSongId,
    prevSongId,
    router,
  ]);

  const handleGoLive = () => {
    if (!live.deviceName) {
      setNameInput('');
      setShowNamePrompt(true);
    } else {
      live.startLeading();
    }
  };

  const confirmGoLive = () => {
    if (!nameInput.trim()) return;
    live.startLeading(nameInput.trim());
    setShowNamePrompt(false);
  };

  if (!song) {
    if (!songsLoaded) {
      return (
        <div className="flex-1 flex flex-col">
          <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Carregando…' }]} />
          <main id="main-content" className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-4 space-y-4">
            <div className="gm3-skeleton h-9 w-64 rounded-2xl" />
            <div className="gm3-skeleton h-12 w-full rounded-2xl" />
            <div className="gm3-skeleton h-44 w-full rounded-[24px]" />
            <div className="gm3-skeleton h-44 w-full rounded-[24px]" />
          </main>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col">
        <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Não encontrada' }]} />
        <main id="main-content" className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-[var(--muted)]">Essa música não foi encontrada no repertório.</p>
          <button
            type="button"
            onClick={() => navigateWithTransition(router, '/', { direction: 'back' })}
            className="pill-btn pill-btn-tonal px-5 h-10 text-xs"
          >
            Voltar para o repertório
          </button>
        </main>
      </div>
    );
  }

  const beatsPerBar = parseInt(song.timeSignature, 10) || 4;
  // {key:} is already the concert sounding key; freeze at original key during visual edit mode to match 0-shift editor.
  const displayedKey =
    !store.editMode && store.transpose
      ? transposeChord(song.displayKey, store.transpose, store.useFlats)
      : song.displayKey;
  const chordDisplayShift =
    capoDisplay === 'shapes' ? store.transpose : store.transpose + store.capo;
  const pitchTarget =
    displayedKey ||
    (allChords[0]
      ? transposeChord(allChords[0], store.transpose + store.capo, store.useFlats)
      : '');

  const handleTriggerCountIn = () => {
    setLocalCountIn({
      nonce: Date.now(),
      bpm: store.bpm,
      beats: beatsPerBar,
      leaderName: live.isLeading ? live.deviceName : null,
    });
    if (live.isLeading) {
      live.triggerCountIn(store.bpm, beatsPerBar);
    }
  };

  const closeCountIn = () => {
    setLocalCountIn(null);
    live.clearIncomingCountIn();
  };

  // ── Visual edit session lifecycle & draft helpers ───────────────────────────
  const currentSong = song;
  const editDirty =
    store.editMode && editOriginText !== null && editDraftText !== null && editDraftText !== editOriginText;

  const enterVisualEdit = () => {
    const raw = exportEntry(id) ?? songToChordPro(currentSong);
    lastMoveMetaRef.current = null;
    clearDeletedSectionToast();
    clearReplaceAllToast();
    runStateViewTransition(() => {
      setCalibrating(false);
      setEditOriginText(raw);
      setEditDraftText(raw);
      setEditSubMode('text');
      setStampChord(allChords[0] ?? getDiatonicChordsForKey(currentSong.originalKey)[0] ?? null);
      setPickStampOpen(false);
      setUndoStack([]);
      setRedoStack([]);
      setDomSyncKey((k) => k + 1);
      setEditDiscardArmed(false);
      store.setEditMode(true);
    }, 'morph');
  };

  const handleSwitchEditSubMode = (nextMode: 'text' | 'chords') => {
    if (nextMode === editSubMode) return;
    if (nextMode === 'chords') {
      const liveText = captureLiveDraft();
      if (liveText !== null && liveText !== editDraftText) {
        commitDraftText(liveText);
      }
      if (!stampChord) {
        setStampChord(allChords[0] ?? getDiatonicChordsForKey(currentSong.originalKey)[0] ?? null);
      }
    }
    setPickStampOpen(false);
    setEditSubMode(nextMode);
  };

  const commitDraftText = (nextText: string, opts?: { coalesce?: boolean }) => {
    if (editDraftText !== null && nextText === editDraftText) return;
    if (!opts?.coalesce) {
      lastMoveMetaRef.current = null;
    }
    if (editDraftText !== null && (!opts?.coalesce || undoStack.length === 0)) {
      setUndoStack((s) => [...s.slice(-49), editDraftText]);
    }
    setRedoStack([]);
    setEditDraftText(nextText);
    setEditDiscardArmed(false);
  };

  const handleSaveVisualEdit = () => {
    // Synchronously flush live SectionEditor DOM + section labels + title/artist so 0ms clicks never drop keystrokes
    const finalText = captureLiveDraft();
    clearDeletedSectionToast();
    clearReplaceAllToast();
    lastMoveMetaRef.current = null;
    if (finalText !== null && editOriginText !== null && finalText !== editOriginText) {
      // Snapshot the pre-edit version in the background so visual edits are undoable in History
      fetch(`/api/songs/${id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editOriginText }),
      }).catch(() => {});
      updateEntry(id, finalText);
      flashStatus('✓ Alterações salvas');
    }
    runStateViewTransition(() => {
      store.setEditMode(false);
      setEditSubMode('text');
      setEditOriginText(null);
      setEditDraftText(null);
      setUndoStack([]);
      setRedoStack([]);
      setEditDiscardArmed(false);
      closeOverlay();
    }, 'morph');
  };
  saveVisualEditRef.current = handleSaveVisualEdit;

  const hasUnsavedVisualEdits = () => {
    if (!store.editMode || editOriginText === null) return false;
    const live = captureLiveDraft();
    return live !== null && live !== editOriginText;
  };

  const handleCancelVisualEdit = () => {
    if (hasUnsavedVisualEdits() && !editDiscardArmed) {
      setEditDiscardArmed(true);
      setTimeout(() => setEditDiscardArmed(false), 6000);
      return;
    }
    clearDeletedSectionToast();
    clearReplaceAllToast();
    lastMoveMetaRef.current = null;
    if (storedSong) {
      setTitleInput(storedSong.title);
      setArtistInput(storedSong.artist);
    }
    runStateViewTransition(() => {
      store.setEditMode(false);
      setEditSubMode('text');
      setEditOriginText(null);
      setEditDraftText(null);
      setUndoStack([]);
      setRedoStack([]);
      setEditDiscardArmed(false);
      closeOverlay();
    }, 'morph');
  };

  const guardLeaveEdit = (proceed: () => void) => {
    if (hasUnsavedVisualEdits() && !editDiscardArmed) {
      setEditDiscardArmed(true);
      flashStatus('Alterações não salvas · toque novamente para sair');
      setTimeout(() => setEditDiscardArmed(false), 6000);
      return;
    }
    if (store.editMode) {
      clearDeletedSectionToast();
      clearReplaceAllToast();
      lastMoveMetaRef.current = null;
      store.setEditMode(false);
      setEditSubMode('text');
      setEditOriginText(null);
      setEditDraftText(null);
      setUndoStack([]);
      setRedoStack([]);
      setEditDiscardArmed(false);
      closeOverlay();
    }
    proceed();
  };

  function applyLineEdit(
    sectionIdx: number,
    lineIdx: number,
    newLine: string,
    opts?: { coalesce?: boolean }
  ) {
    const updatedSections = currentSong.sections.map((sec, si) => {
      if (si !== sectionIdx) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l, li) => (li === lineIdx ? newLine : l)),
      };
    });
    commitDraftText(songToChordPro({ ...currentSong, sections: updatedSections }), opts);
  }

  function applySectionEdit(sectionIdx: number, lines: string[]) {
    const prevLines = currentSong.sections[sectionIdx]?.lines;
    if (prevLines && prevLines.length === lines.length && prevLines.every((l, i) => l === lines[i])) {
      return;
    }
    const updatedSections = currentSong.sections.map((sec, si) =>
      si === sectionIdx ? { ...sec, lines } : sec
    );
    commitDraftText(songToChordPro({ ...currentSong, sections: updatedSections }));
  }

  function handleRenameSection(sectionIdx: number, label: string) {
    const clean = label.replace(/[{}]/g, '').trim();
    if (!clean) return;
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: renameSongSection(currentSong.sections, sectionIdx, clean),
      })
    );
  }

  function handleDuplicateSection(sectionIdx: number) {
    const nextIdx = sectionIdx + 1;
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: duplicateSongSection(currentSong.sections, sectionIdx),
      })
    );
    closeOverlay();
    flashStatus('Seção duplicada');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = sheetScrollRef.current?.querySelector<HTMLElement>(`#section-${nextIdx}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  function handleMoveSection(sectionIdx: number, dir: 'up' | 'down') {
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: moveSongSection(currentSong.sections, sectionIdx, dir),
      })
    );
    closeOverlay();
  }

  function handleDeleteSection(sectionIdx: number) {
    const removedLabel = currentSong.sections[sectionIdx]?.label || 'Seção';
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: removeSongSection(currentSong.sections, sectionIdx),
      })
    );
    closeOverlay();
    if (deletedToastTimerRef.current) clearTimeout(deletedToastTimerRef.current);
    setDeletedSectionToast({ label: removedLabel, nonce: Date.now() });
    deletedToastTimerRef.current = setTimeout(() => {
      setDeletedSectionToast(null);
      deletedToastTimerRef.current = null;
    }, 6000);
  }

  function handleAddSection(label: string) {
    const nextIdx = currentSong.sections.length;
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: addSongSection(currentSong.sections, label),
      })
    );
    flashStatus(`Seção "${label}" adicionada`);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const sectionEl = sheetScrollRef.current?.querySelector<HTMLElement>(`#section-${nextIdx}`);
        sectionEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const editorEl = sectionEl?.querySelector<HTMLElement>(`[data-section-editor-idx="${nextIdx}"]`);
        editorEl?.focus({ preventScroll: true });
      });
    });
  }

  function handleChordSelect(sectionIdx: number, lineIdx: number, segIdx: number) {
    if (
      selectedCoord?.sectionIdx === sectionIdx &&
      selectedCoord?.lineIdx === lineIdx &&
      selectedCoord?.segIdx === segIdx
    ) {
      setSelectedCoord(null);
      setAddTarget(null);
      setPickStampOpen(false);
    } else {
      setSelectedCoord({ sectionIdx, lineIdx, segIdx });
      setAddTarget(null);
      setPickStampOpen(false);
    }
  }

  function handleAddChord(sectionIdx: number, lineIdx: number, charPos: number) {
    setSelectedCoord(null);
    setPickStampOpen(false);
    setAddTarget({ sectionIdx, lineIdx, charPos });
  }

  function handleStampChord(sectionIdx: number, lineIdx: number, charPos: number) {
    if (!stampChord) {
      handleAddChord(sectionIdx, lineIdx, charPos);
      return;
    }
    const line = currentSong.sections[sectionIdx]?.lines[lineIdx];
    if (line === undefined) return;
    applyLineEdit(sectionIdx, lineIdx, insertChord(line, charPos, stampChord));
  }

  function handleMove(sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') {
    const line = currentSong.sections[sectionIdx]?.lines[lineIdx];
    if (line === undefined) return;
    const { line: nextLine, nextSegIdx } = moveChordWithIndex(line, segIdx, dir);
    const now = Date.now();
    const prevMove = lastMoveMetaRef.current;
    const coalesce = Boolean(
      prevMove &&
        prevMove.sectionIdx === sectionIdx &&
        prevMove.lineIdx === lineIdx &&
        now - prevMove.at < 1200
    );
    applyLineEdit(sectionIdx, lineIdx, nextLine, { coalesce });
    lastMoveMetaRef.current = { sectionIdx, lineIdx, at: now };
    setSelectedCoord({ sectionIdx, lineIdx, segIdx: nextSegIdx });
  }

  function handleMoveWord(sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') {
    const line = currentSong.sections[sectionIdx]?.lines[lineIdx];
    if (line === undefined) return;
    const { line: nextLine, nextSegIdx } = moveChordByWordWithIndex(line, segIdx, dir);
    const now = Date.now();
    const prevMove = lastMoveMetaRef.current;
    const coalesce = Boolean(
      prevMove &&
        prevMove.sectionIdx === sectionIdx &&
        prevMove.lineIdx === lineIdx &&
        now - prevMove.at < 1200
    );
    applyLineEdit(sectionIdx, lineIdx, nextLine, { coalesce });
    lastMoveMetaRef.current = { sectionIdx, lineIdx, at: now };
    setSelectedCoord({ sectionIdx, lineIdx, segIdx: nextSegIdx });
  }

  function handleStepChord(dir: 'prev' | 'next') {
    if (!selectedCoord) return;
    const target = findAdjacentChord(currentSong.sections, selectedCoord, dir);
    if (target) {
      setSelectedCoord(target);
      setAddTarget(null);
    }
  }

  function handleRename(sectionIdx: number, lineIdx: number, segIdx: number, newChord: string) {
    const line = currentSong.sections[sectionIdx]?.lines[lineIdx];
    if (line === undefined) return;
    const oldChord = parseLine(line)[segIdx]?.chord ?? '';
    const updatedLine = renameChord(line, segIdx, newChord);
    const updatedSections = currentSong.sections.map((sec, si) =>
      si === sectionIdx
        ? { ...sec, lines: sec.lines.map((l, li) => (li === lineIdx ? updatedLine : l)) }
        : sec
    );
    commitDraftText(songToChordPro({ ...currentSong, sections: updatedSections }));

    if (oldChord && oldChord !== newChord) {
      const remaining = countChordOccurrences(updatedSections, oldChord);
      if (remaining > 0) {
        if (replaceAllTimerRef.current) clearTimeout(replaceAllTimerRef.current);
        setReplaceAllToast({ from: oldChord, to: newChord, remaining, nonce: Date.now() });
        replaceAllTimerRef.current = setTimeout(() => {
          setReplaceAllToast(null);
          replaceAllTimerRef.current = null;
        }, 6500);
      } else {
        clearReplaceAllToast();
      }
    }
  }

  function handleApplyReplaceAll() {
    if (!replaceAllToast) return;
    const { from, to } = replaceAllToast;
    const { sections: nextSections, replacedCount } = replaceAllChordsInSections(
      currentSong.sections,
      from,
      to
    );
    clearReplaceAllToast();
    if (replacedCount > 0) {
      commitDraftText(songToChordPro({ ...currentSong, sections: nextSections }));
      flashStatus(`✓ ${replacedCount} ${replacedCount === 1 ? 'acorde atualizado' : 'acordes atualizados'}`);
    }
  }

  function handleDelete(sectionIdx: number, lineIdx: number, segIdx: number) {
    const line = currentSong.sections[sectionIdx]?.lines[lineIdx];
    if (line === undefined) return;
    applyLineEdit(sectionIdx, lineIdx, deleteChord(line, segIdx));
  }

  function handleInsert(sectionIdx: number, lineIdx: number, charPos: number, chord: string) {
    const line = currentSong.sections[sectionIdx]?.lines[lineIdx];
    if (line === undefined) return;
    applyLineEdit(sectionIdx, lineIdx, insertChord(line, charPos, chord));
  }

  function handleInsertAndNext(sectionIdx: number, lineIdx: number, charPos: number, chord: string) {
    const line = currentSong.sections[sectionIdx]?.lines[lineIdx];
    if (line === undefined) return;
    const nextLine = insertChord(line, charPos, chord);
    applyLineEdit(sectionIdx, lineIdx, nextLine);
    const nextEnd = extractLyricText(nextLine).length;
    setAddTarget({ sectionIdx, lineIdx, charPos: nextEnd });
  }

  function closeOverlay() {
    setSelectedCoord(null);
    setAddTarget(null);
    setPickStampOpen(false);
  }

  const overlayChordName = selectedCoord
    ? parseLine(currentSong.sections[selectedCoord.sectionIdx]?.lines[selectedCoord.lineIdx] ?? '')[
        selectedCoord.segIdx
      ]?.chord ?? ''
    : '';

  const overlaySelected =
    selectedCoord && overlayChordName ? { ...selectedCoord, chord: overlayChordName } : null;

  const overlayMoveBounds = overlaySelected
    ? getChordMoveBounds(
        currentSong.sections[overlaySelected.sectionIdx]?.lines[overlaySelected.lineIdx] ?? '',
        overlaySelected.segIdx
      )
    : { canMoveLeft: true, canMoveRight: true, isChordOnly: false };

  const canStepPrev = Boolean(
    overlaySelected && findAdjacentChord(currentSong.sections, overlaySelected, 'prev')
  );
  const canStepNext = Boolean(
    overlaySelected && findAdjacentChord(currentSong.sections, overlaySelected, 'next')
  );

  // ── Auto-scroll calibration & saved pace ────────────────────────────────────
  const handleSaveScrollSpeed = () => {
    patchMeta(id, 'scroll', Number(store.autoScrollSpeed.toFixed(2)));
    flashStatus(`✓ Ritmo salvo (${store.autoScrollSpeed.toFixed(2)}×)`);
  };

  const handleStartCalibration = () => {
    store.setAutoScrolling(false);
    const initial: (number | null)[] = currentSong.sections.map((_, idx) => (idx === 0 ? 0 : null));
    setCalMarks(initial);
    setCalNextIdx(1);
    setCalStartMs(Date.now());
    setCalElapsedSec(0);
    setCalibrating(true);
    handleJumpToSection(0);
  };

  const handleSaveCalibration = () => {
    const rawText = exportEntry(id);
    if (!rawText) return;
    // Fill any unmarked trailing/intermediate gaps monotonically
    const filled: number[] = [];
    let last = 0;
    for (let i = 0; i < currentSong.sections.length; i++) {
      const m = calMarks[i];
      if (m !== null && m !== undefined) {
        last = Math.max(last, m);
        filled.push(last);
      } else if (i === 0) {
        filled.push(0);
      } else {
        break;
      }
    }
    if (filled.length < 2) {
      setCalibrating(false);
      return;
    }

    let nextText = patchChordProMeta(rawText, 'marks', serializeMarks(filled));
    // Also set duration if unset and calibration spanned at least 20s
    const totalNow = Math.round((Date.now() - calStartMs) / 1000);
    if (!currentSong.duration && totalNow >= 20) {
      nextText = patchChordProMeta(nextText, 'duration', totalNow);
    }
    updateEntry(id, nextText);
    store.setAutoScrollSpeed(1);
    setCalibrating(false);
    flashStatus('✓ Calibração por seção salva');
  };

  const handleClearCalibration = () => {
    const rawText = exportEntry(id);
    if (!rawText) return;
    fetch(`/api/songs/${id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText }),
    }).catch(() => {});
    updateEntry(id, removeChordProMeta(rawText, 'marks'));
    setShowClearCalConfirm(false);
    flashStatus('Calibração removida');
  };

  // ── Song metadata & actions ─────────────────────────────────────────────────
  // Route metadata edits through the active visual edit draft so Save keeps them and Cancel reverts them!
  const applyMetaEdit = (key: string, value: string | number) => {
    const removeEmptyKey = key === 'key' && String(value).trim() === '';
    if (store.editMode && editDraftText !== null) {
      const next = removeEmptyKey
        ? removeChordProMeta(editDraftText, 'key')
        : patchChordProMeta(editDraftText, key, value);
      commitDraftText(next);
      return;
    }
    if (removeEmptyKey) {
      const raw = exportEntry(id);
      if (raw) updateEntry(id, removeChordProMeta(raw, 'key'));
      return;
    }
    patchMeta(id, key, value);
  };

  const saveTitle = () => {
    const trimmed = titleInput.replace(/[{}]/g, '').trim();
    if (!trimmed) {
      setTitleInput(song.title);
      return;
    }
    if (trimmed !== titleInput) setTitleInput(trimmed);
    if (trimmed !== song.title) applyMetaEdit('title', trimmed);
  };

  const saveArtist = () => {
    const trimmed = artistInput.replace(/[{}]/g, '').trim();
    if (trimmed !== artistInput) setArtistInput(trimmed);
    if (trimmed !== song.artist) applyMetaEdit('artist', trimmed);
  };

  const handleSaveNotes = (nextNotes: string) => {
    const cleaned = nextNotes.replace(/[\r\n]+/g, ' · ').trim();
    const raw = exportEntry(id);
    if (raw) {
      const updated = cleaned
        ? patchChordProMeta(raw, 'notes', cleaned)
        : removeChordProMeta(raw, 'notes');
      updateEntry(id, updated);
    } else if (cleaned) {
      patchMeta(id, 'notes', cleaned);
    }
    setEditingNotes(false);
    flashStatus(cleaned ? '✓ Nota de palco salva' : 'Nota de palco removida');
  };

  const handleAddToSetlist = (setlistId: string, setlistName: string) => {
    addSongToSetlist(setlistId, id);
    flashStatus(`Adicionada em "${setlistName}"`);
  };

  const openSpotifyPicker = () => {
    setShowSpotifyPicker(true);
    setSpotifyLoading(true);
    const query = `${song.title} ${song.artist}`.trim();
    fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => setSpotifyResults(data.results ?? []))
      .catch(() => setSpotifyResults([]))
      .finally(() => setSpotifyLoading(false));
  };

  const handleSelectSpotify = (trackId: string) => {
    const track = spotifyResults.find((t) => t.id === trackId);
    const raw = exportEntry(id);
    if (raw) {
      let nextText = patchChordProMeta(raw, 'spotify', trackId);
      if (track?.durationMs && !song.duration) {
        nextText = patchChordProMeta(nextText, 'duration', Math.round(track.durationMs / 1000));
      }
      updateEntry(id, nextText);
    } else {
      patchMeta(id, 'spotify', trackId);
    }
    setShowSpotifyPicker(false);
    setShowMoreSuggestions(false);
    flashStatus(track?.durationMs && !song.duration ? 'Spotify e duração vinculados' : 'Spotify vinculado');
  };

  const handleClearSpotify = () => {
    const text = exportEntry(id);
    if (text) updateEntry(id, removeChordProMeta(text, 'spotify'));
    setShowSpotifyPicker(false);
    setShowSpotifyPreview(false);
    setSpotifySuggestionDismissed(false);
    flashStatus('Vínculo removido');
  };

  const handleSaveAsKey = () => {
    const prevRaw = exportEntry(id);
    if (prevRaw) {
      fetch(`/api/songs/${id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prevRaw }),
      }).catch(() => {});
    }
    const transposed = transposeSong(song, store.transpose, store.useFlats);
    updateEntry(id, songToChordPro(transposed));
    store.setTranspose(0);
    setShowTransposeConfirm(false);
    flashStatus('Salvo no novo tom');
  };

  const choIsDirty = choIsDirtyEarly;
  const choIsValid = /^[ \t]*\{title:[ \t]*[^\s}][^}\r\n]*\}[ \t]*$/im.test(choDraft);
  const closeExportModal = closeExportModalCallback;

  const handleSaveCho = () => {
    if (!choIsValid || !choIsDirty) return;
    if (store.editMode && editDraftText !== null) {
      commitDraftText(choDraft);
      setDomSyncKey((k) => k + 1);
      setDiscardArmed(false);
      setShowExport(false);
      flashStatus('✓ Rascunho atualizado');
      return;
    }
    const prev = exportEntry(id);
    if (prev && prev !== choDraft) {
      fetch(`/api/songs/${id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prev }),
      }).catch(() => {});
    }
    updateEntry(id, choDraft);
    setDiscardArmed(false);
    setShowExport(false);
    flashStatus('✓ Salvo');
  };
  saveChoRef.current = handleSaveCho;

  const navigateInSetlist = (songId: string, preserveCleanParam = false) => {
    if (!activeSetlist) return;
    const targetIdx = existingSetlistSongIds.indexOf(songId);
    const direction = targetIdx >= 0 && targetIdx < setlistSongIdx ? 'prev' : 'next';
    const cleanSuffix = preserveCleanParam && cleanUrlParam ? '&show=1' : '';
    guardLeaveEdit(() => {
      navigateWithTransition(router, `/song/${songId}?setlist=${activeSetlist.id}${cleanSuffix}`, {
        direction,
      });
    });
  };

  const handleOpenSlides = () => {
    navigateWithTransition(
      router,
      activeSetlist ? `/slides?setlist=${activeSetlist.id}&song=${id}` : `/slides?song=${id}`,
      { direction: 'forward' }
    );
  };

  const handleExitCleanStage = () => {
    if (cleanUrlParam) {
      setFocusMode(false);
      navigateWithTransition(
        router,
        activeSetlist ? `/song/${id}?setlist=${activeSetlist.id}` : `/song/${id}`,
        { songId: id, direction: 'back', replace: true }
      );
      return;
    }
    runStateViewTransition(() => setFocusMode(false), 'morph');
  };

  const songHasCalibration = hasUsableMarks(song.sectionMarks, song.sections.length);
  const baselineScrollSpeed = song.scrollSpeed ?? 1;
  const scrollSpeedChanged = Math.abs(store.autoScrollSpeed - baselineScrollSpeed) >= 0.04;

  // Unified Clean Stage ("Tela limpa", absorbing legacy Show Mode)
  if (isCleanStage) {
    return (
      <>
        <CleanStageView
          song={song}
          displayedKey={displayedKey}
          pitchTarget={pitchTarget}
          beatsPerBar={beatsPerBar}
          wakeLockActive={wakeLock.active}
          audioBlocked={metronomeAudioBlocked}
          onUnlockAudio={unlockMetronomeAudio}
          activeSetlist={activeSetlist}
          setlistSongIdx={setlistSongIdx}
          totalSongs={existingSetlistSongIds.length}
          prevSongId={prevSongId}
          nextSongId={nextSongId}
          live={live}
          handleGoLive={handleGoLive}
          confirmGoLive={confirmGoLive}
          showNamePrompt={showNamePrompt}
          nameInput={nameInput}
          setNameInput={setNameInput}
          setShowNamePrompt={setShowNamePrompt}
          onNavigateSong={(songId) => navigateInSetlist(songId, true)}
          onChordTap={(chord) => store.setActiveChord(chord)}
          onScrollStateChange={(st) => {
            scrollStateRef.current = { scrollTop: st.scrollTop, scrollRatio: st.scrollRatio };
          }}
          onTriggerCountIn={handleTriggerCountIn}
          onSaveBpm={(nextBpm) => {
            patchMeta(id, 'tempo', nextBpm);
            flashStatus(`✓ BPM salvo (${nextBpm})`);
          }}
          onRequestSaveTranspose={() => setShowTransposeConfirm(true)}
          onEnterSlidesMode={handleOpenSlides}
          onEnterEdit={() => {
            if (cleanUrlParam) {
              setFocusMode(false);
              router.replace(activeSetlist ? `/song/${id}?setlist=${activeSetlist.id}` : `/song/${id}`);
            } else {
              setFocusMode(false);
            }
            enterVisualEdit();
          }}
          onExit={handleExitCleanStage}
        />

        <ChordPanel
          chord={store.activeChord}
          onClose={() => store.setActiveChord(null)}
        />

        <ConfirmDialog
          open={showTransposeConfirm}
          title="Salvar neste novo tom?"
          description={
            <>
              <span className="font-mono text-[var(--ink)]">{song.displayKey || 'Tom atual'}</span>
              {' → '}
              <span className="font-mono font-semibold text-[var(--accent-ink)]">
                {transposeChord(song.displayKey, store.transpose, store.useFlats)}
              </span>
              . Todos os acordes da música serão reescritos permanentemente e a transposição volta para 0.
            </>
          }
          confirmLabel="Salvar tom"
          onConfirm={handleSaveAsKey}
          onCancel={() => setShowTransposeConfirm(false)}
        />

        {displayCountIn && (
          <CountInOverlay
            open={Boolean(activeCountIn)}
            nonce={displayCountIn.nonce}
            bpm={displayCountIn.bpm}
            beats={displayCountIn.beats}
            leaderName={displayCountIn.leaderName}
            onComplete={closeCountIn}
            onCancel={closeCountIn}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <VisualPulse />

      {/* Constant 56px Pinned Top Bar (or dedicated Edit Top Bar when editing) */}
      <SongHeader
        song={song}
        displayedKey={displayedKey}
        pitchTarget={pitchTarget}
        beatsPerBar={beatsPerBar}
        chordCount={allChords.length}
        titleInput={titleInput}
        artistInput={artistInput}
        onTitleChange={setTitleInput}
        onArtistChange={setArtistInput}
        onSaveTitle={saveTitle}
        onSaveArtist={saveArtist}
        onPatchMeta={applyMetaEdit}
        editMode={store.editMode}
        editingIdentity={editingIdentity}
        onSetEditingIdentity={setEditingIdentity}
        scrolled={headerScrolled}
        onBack={() =>
          guardLeaveEdit(() =>
            navigateWithTransition(
              router,
              activeSetlist ? `/setlists/${activeSetlist.id}` : '/',
              { songId: id, direction: 'back' }
            )
          )
        }
        onEnterFocusMode={() => runStateViewTransition(() => setFocusMode(true), 'morph')}
        onEnterSlidesMode={handleOpenSlides}
        onEnterEdit={enterVisualEdit}
        activeSetlist={activeSetlist}
        setlistSongIdx={setlistSongIdx}
        totalSetlistSongs={existingSetlistSongIds.length}
        prevSongId={prevSongId}
        nextSongId={nextSongId}
        onNavigateSong={(songId) => navigateInSetlist(songId)}
        onOpenSetlistDrawer={() => setShowSetlistDrawer(true)}
        live={live}
        handleGoLive={handleGoLive}
        confirmGoLive={confirmGoLive}
        showNamePrompt={showNamePrompt}
        nameInput={nameInput}
        setNameInput={setNameInput}
        setShowNamePrompt={setShowNamePrompt}
        audioBlocked={metronomeAudioBlocked}
        onUnlockAudio={unlockMetronomeAudio}
        hasCalibration={songHasCalibration}
        canCalibrate={song.sections.length >= 2}
        calibrating={calibrating}
        onStartCalibration={handleStartCalibration}
        onClearCalibration={() => setShowClearCalConfirm(true)}
        onSaveBpm={(nextBpm) => {
          patchMeta(id, 'tempo', nextBpm);
          flashStatus(`✓ BPM salvo (${nextBpm})`);
        }}
        onRequestSaveTranspose={() => setShowTransposeConfirm(true)}
        onTriggerCountIn={handleTriggerCountIn}
        onToggleChordsRef={() => {
          setChordsRefEverOpened(true);
          setChordsRefOpen(!chordsRefOpen);
        }}
        setlists={setlists}
        onAddToSetlist={handleAddToSetlist}
        onGoToCreateSetlist={() =>
          guardLeaveEdit(() =>
            navigateWithTransition(router, '/?tab=setlists', { direction: 'fade' })
          )
        }
        showSpotifyPreview={showSpotifyPreview}
        onToggleSpotifyPreview={() => setShowSpotifyPreview((v) => !v)}
        onOpenSpotifyPicker={openSpotifyPicker}
        onOpenEnhance={() => setShowEnhance(true)}
        onOpenHistory={() => setShowHistory(true)}
        onOpenChordPro={() => {
          const liveDraft = store.editMode ? captureLiveDraft() : null;
          if (store.editMode && liveDraft !== null && liveDraft !== editDraftText) {
            commitDraftText(liveDraft);
          }
          setChoDraft(liveDraft ?? (store.editMode && editDraftText !== null ? editDraftText : exportEntry(id) ?? ''));
          setChoView(typeof window !== 'undefined' && window.innerWidth < 1024 ? 'editor' : 'split');
          setDiscardArmed(false);
          setShowExport(true);
        }}
        onEditNotes={() => setEditingNotes(true)}
        editToolbarSlot={
          store.editMode ? (
            <SongToolbar
              editSubMode={editSubMode}
              onChangeEditSubMode={handleSwitchEditSubMode}
              editingOriginalKey={song.originalKey}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              editDirty={editDirty}
              editDiscardArmed={editDiscardArmed}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSaveEdit={handleSaveVisualEdit}
              onCancelEdit={handleCancelVisualEdit}
            />
          ) : undefined
        }
      />

      {/* Explicit transient overlays/strips (only visible when user opens them) */}
      <SpotifySection
        spotifyTrackId={song.spotifyTrackId}
        showPreview={showSpotifyPreview}
        showPicker={showSpotifyPicker}
        results={spotifyResults}
        loading={spotifyLoading}
        suggestionDismissed={spotifySuggestionDismissed}
        showMoreSuggestions={showMoreSuggestions}
        onSelect={handleSelectSpotify}
        onClear={handleClearSpotify}
        onDismissSuggestion={() => setSpotifySuggestionDismissed(true)}
        onToggleMoreSuggestions={() => setShowMoreSuggestions((v) => !v)}
        onClosePicker={() => setShowSpotifyPicker(false)}
      />

      {!store.editMode && editingNotes && (
        <StageNotesBar
          notes={song.notes}
          editing
          onStartEdit={() => setEditingNotes(true)}
          onSave={handleSaveNotes}
          onCancel={() => setEditingNotes(false)}
        />
      )}

      <CalibrationBar
        open={calibrating}
        sections={song.sections}
        elapsedSec={calElapsedSec}
        marks={calMarks}
        nextSectionIdx={calNextIdx}
        onMarkNext={() => {
          if (calNextIdx < song.sections.length) markCalibrationSection(calNextIdx);
        }}
        onSave={handleSaveCalibration}
        onCancel={() => setCalibrating(false)}
      />

      {/* Bidirectional Collapsible Chords Reference Strip (visible immediately even when toggled mid-song) */}
      {allChords.length > 0 && (() => {
        const chordsVisible = chordsRefOpen && !store.editMode && !calibrating && displayMode !== 'lyrics-only';
        return (
          <div
            data-chords-ref-collapsible="true"
            data-collapsed={chordsVisible ? undefined : 'true'}
            aria-hidden={!chordsVisible || undefined}
            inert={!chordsVisible || undefined}
            className="gm3-collapsible flex-shrink-0"
          >
            <div className="gm3-collapsible-inner">
              {(chordsVisible || chordsRefEverOpened) && (
                <ChordsReference
                  chords={allChords.map((c) => transposeChord(c, chordDisplayShift, store.useFlats))}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* Pinned SectionNav ONLY in Edit Mode / Calibration (in normal reading mode it scrolls naturally inside SongHeroStrip) */}
      {(store.editMode || calibrating) && (
        <div className="flex-shrink-0 pt-1">
          <SectionNav
            sections={song.sections}
            activeIdx={activeSectionIdx}
            onJump={(idx) => {
              if (calibrating) markCalibrationSection(idx);
              else handleJumpToSection(idx);
            }}
            leadingSlot={
              store.editMode ? (
                <ConnectedGroup
                  value={editSubMode}
                  ariaLabel="Ferramenta de edição"
                  subtle
                  className="sm:hidden flex-shrink-0 mr-1"
                >
                  <button
                    type="button"
                    aria-pressed={editSubMode === 'text'}
                    onClick={() => handleSwitchEditSubMode('text')}
                    className="gm3-connected-btn inline-flex items-center justify-center px-2.5 h-9 font-display text-xs font-semibold cursor-pointer"
                  >
                    Texto
                  </button>
                  <button
                    type="button"
                    aria-pressed={editSubMode === 'chords'}
                    onClick={() => handleSwitchEditSubMode('chords')}
                    className="gm3-connected-btn inline-flex items-center justify-center px-2.5 h-9 font-display text-xs font-semibold cursor-pointer"
                  >
                    Acordes
                  </button>
                </ConnectedGroup>
              ) : undefined
            }
            trailingSlot={
              store.editMode ? (
                <button
                  type="button"
                  onClick={() => {
                    const el = sheetScrollRef.current?.querySelector<HTMLElement>('#add-section-bar');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="flex-shrink-0 inline-flex items-center gap-1 rounded-full px-3 h-9 text-xs font-semibold bg-[var(--primary-container)] text-[var(--on-primary-container)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)] cursor-pointer transition-colors"
                  title="Ir para adicionar nova seção"
                >
                  <PlusIcon size={13} />
                  Seção
                </button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Main chord / lyric sheet (SongHeroStrip scrolls naturally 1:1 inside ChordSheet!) */}
      <main id="main-content" className="gm3-page-enter flex flex-1 relative min-h-0">
        <ChordSheet
          song={song}
          onChordTap={(chord) => store.setActiveChord(chord)}
          displayMode={displayMode}
          editMode={store.editMode}
          editSubMode={editSubMode}
          stampChord={stampChord}
          selectedCoord={selectedCoord}
          onChordSelect={handleChordSelect}
          onAddChord={handleAddChord}
          onStampChord={handleStampChord}
          onLinesChange={applySectionEdit}
          onRenameSection={handleRenameSection}
          onDuplicateSection={handleDuplicateSection}
          onMoveSection={handleMoveSection}
          onDeleteSection={handleDeleteSection}
          onAddSection={handleAddSection}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDismissOverlay={closeOverlay}
          domSyncKey={domSyncKey}
          calibrating={calibrating}
          calibrationMarks={calMarks}
          calibrationTargetIdx={calNextIdx}
          onCalibrationTap={markCalibrationSection}
          onScrollStateChange={(st) => {
            scrollStateRef.current = { scrollTop: st.scrollTop, scrollRatio: st.scrollRatio };
            const isPastTop = st.scrollTop > 12;
            setHeaderScrolled((prev) => (prev === isPastTop ? prev : isPastTop));
          }}
          syncCorrection={live.syncCorrection}
          scrollContainerRef={sheetScrollRef}
          onActiveSectionChange={setActiveSectionIdx}
          arrivedSectionIdx={arrivedSectionIdx}
          headerSlot={
            !store.editMode && !calibrating ? (
              <SongHeroStrip
                song={song}
                displayedKey={displayedKey}
                artistInput={artistInput}
                activeSetlist={activeSetlist}
                setlistSongIdx={setlistSongIdx}
                totalSetlistSongs={existingSetlistSongIds.length}
                prevSongId={prevSongId}
                nextSongId={nextSongId}
                isFollowing={live.isFollowing}
                activeSectionIdx={activeSectionIdx}
                onPatchMeta={applyMetaEdit}
                onNavigateSong={(songId) => navigateInSetlist(songId)}
                onOpenSetlistDrawer={() => setShowSetlistDrawer(true)}
                onJumpToSection={handleJumpToSection}
                onStartEditNotes={() => setEditingNotes(true)}
              />
            ) : undefined
          }
          bottomPaddingClass={
            store.editMode
              ? overlaySelected || addTarget || pickStampOpen
                ? 'pb-[55vh]'
                : editSubMode === 'chords'
                ? 'pb-52'
                : 'pb-48'
              : store.isAutoScrolling
              ? 'pb-28'
              : 'pb-20'
          }
        />

        {!store.editMode && !calibrating && (
          <ChordPanel
            chord={store.activeChord}
            onClose={() => store.setActiveChord(null)}
          />
        )}
      </main>

      {/* Floating Auto-Scroll Speed Pill (only mounted while scrolling; zero header reflow!) */}
      {!store.editMode && !calibrating && !live.isFollowing && store.isAutoScrolling && (
        <div
          className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-3 pointer-events-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div
            data-autoscroll-dock="true"
            className="gm3-sheet-enter pointer-events-auto flex items-center gap-1.5 flex-wrap justify-center rounded-full bg-[var(--surface)]/95 backdrop-blur-md px-2.5 py-1.5"
            style={{ boxShadow: 'var(--shadow-md)' }}
          >
            <button
              type="button"
              onClick={store.toggleAutoScroll}
              className="pill-btn pill-btn-tune h-9 px-3 text-xs"
              title="Pausar auto-scroll (Espaço)"
            >
              <PauseIcon size={12} />
              Pausar
            </button>
            <div className="gm3-btn-group">
              <button
                type="button"
                onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
                aria-label="Scroll mais devagar"
              >
                -
              </button>
              <span className="font-mono text-xs text-[var(--ink)] tabular-nums px-1.5 min-w-[44px] text-center flex items-center justify-center">
                {store.autoScrollSpeed.toFixed(2)}×
              </span>
              <button
                type="button"
                onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
                aria-label="Scroll mais rápido"
              >
                +
              </button>
            </div>
            <div className="hidden sm:inline-flex items-center gap-1">
              {[
                { label: '0.75×', value: 0.75 },
                { label: '1.0×', value: 1 },
                { label: '1.25×', value: 1.25 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={Math.abs(store.autoScrollSpeed - preset.value) < 0.04}
                  onClick={() => store.setAutoScrollSpeed(preset.value)}
                  className={`pill-btn px-2.5 h-9 font-mono text-xs ${
                    Math.abs(store.autoScrollSpeed - preset.value) < 0.04
                      ? 'pill-btn-tune'
                      : 'bg-[var(--bg)]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {scrollSpeedChanged && (
              <button
                type="button"
                onClick={handleSaveScrollSpeed}
                className="pill-btn pill-btn-tonal px-3 h-9 text-xs"
                title="Salvar esta velocidade como padrão desta música"
              >
                Salvar ritmo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Setlist Drawer */}
      {activeSetlist && (
        <SetlistDrawer
          open={showSetlistDrawer}
          setlist={activeSetlist}
          currentSongId={song.id}
          canReorder={!live.isFollowing}
          onNavigate={(songId) => navigateInSetlist(songId)}
          onClose={() => setShowSetlistDrawer(false)}
        />
      )}

      {/* Slim bottom chord stamp dock when in "Acordes" sub-mode */}
      {store.editMode && editSubMode === 'chords' && !overlaySelected && !addTarget && !pickStampOpen && (
        <ChordStampDock
          songChords={allChords}
          songKey={song.originalKey}
          activeChord={stampChord}
          onSelectChord={(c) => setStampChord(c)}
          onOpenCustomPicker={() => {
            setSelectedCoord(null);
            setAddTarget(null);
            setPickStampOpen(true);
          }}
        />
      )}

      {/* Visual chord editing overlay */}
      <EditChordOverlay
        selected={store.editMode ? overlaySelected : null}
        addTarget={store.editMode ? addTarget : null}
        pickStampMode={store.editMode && pickStampOpen}
        songChords={allChords}
        songKey={song.originalKey}
        canMoveLeft={overlayMoveBounds.canMoveLeft}
        canMoveRight={overlayMoveBounds.canMoveRight}
        isChordOnlyLine={overlayMoveBounds.isChordOnly}
        canStepPrev={canStepPrev}
        canStepNext={canStepNext}
        onMove={handleMove}
        onMoveWord={handleMoveWord}
        onStepChord={handleStepChord}
        onRename={handleRename}
        onDelete={handleDelete}
        onInsert={handleInsert}
        onInsertAndNext={handleInsertAndNext}
        onPickStamp={(c) => setStampChord(c)}
        onClose={closeOverlay}
      />

      {/* Save transposed key confirmation */}
      <ConfirmDialog
        open={showTransposeConfirm}
        title="Salvar neste novo tom?"
        description={
          <>
            <span className="font-mono text-[var(--ink)]">{song.displayKey || 'Tom atual'}</span>
            {' → '}
            <span className="font-mono font-semibold text-[var(--accent-ink)]">
              {transposeChord(song.displayKey, store.transpose, store.useFlats)}
            </span>
            . Todos os acordes da música serão reescritos permanentemente e a transposição volta para 0.
          </>
        }
        confirmLabel="Salvar tom"
        onConfirm={handleSaveAsKey}
        onCancel={() => setShowTransposeConfirm(false)}
      />

      {/* Clear calibration confirmation */}
      <ConfirmDialog
        open={showClearCalConfirm}
        title="Remover calibração desta música?"
        description="Os tempos gravados por seção serão removidos e o auto-scroll voltará ao ritmo automático. Uma cópia ficará salva no histórico de versões."
        confirmLabel="Remover calibração"
        danger
        onConfirm={handleClearCalibration}
        onCancel={() => setShowClearCalConfirm(false)}
      />

      {/* Edit raw ChordPro source modal with live split preview */}
      {exportMounted && (
        <div
          className={`${exportClosing ? 'gm3-backdrop-exit' : 'gm3-backdrop-enter'} fixed inset-0 bg-black/45 z-[70] flex items-center justify-center p-0 sm:p-4`}
          onClick={exportClosing ? undefined : closeExportModal}
          inert={exportClosing || undefined}
        >
          <div
            ref={choModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cho-modal-title"
            className={`${exportClosing ? 'gm3-dialog-exit' : 'gm3-dialog-enter'} bg-[var(--surface)] rounded-none sm:rounded-[28px] w-full max-w-6xl h-[100dvh] sm:h-[90vh] flex flex-col overflow-hidden`}
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-[var(--surface-high)] flex-shrink-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <h2 id="cho-modal-title" className="font-display text-base sm:text-lg font-bold text-[var(--ink)] truncate">
                  <span className="sm:hidden">Fonte ChordPro (.cho)</span>
                  <span className="hidden sm:inline">Editar fonte ChordPro (.cho)</span>
                </h2>
                <button
                  type="button"
                  onClick={closeExportModal}
                  className={`sm:hidden flex-shrink-0 ${
                    discardArmed
                      ? 'pill-btn pill-btn-rec px-3 h-10 text-xs'
                      : 'gm3-icon-btn w-10 h-10 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer'
                  }`}
                  aria-label={discardArmed ? 'Sair sem salvar' : 'Fechar editor ChordPro'}
                  title={discardArmed ? 'Sair sem salvar' : 'Fechar (Esc)'}
                >
                  {discardArmed ? 'Descartar?' : <CloseIcon size={18} />}
                </button>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2">
                {/* View mode M3 Expressive Connected Button Group */}
                <ConnectedGroup
                  value={choView}
                  ariaLabel="Modo do editor ChordPro"
                  subtle
                >
                  {(
                    [
                      { id: 'editor', label: 'Código' },
                      { id: 'split', label: 'Dividido', desktopOnly: true },
                      { id: 'preview', label: 'Prévia' },
                    ] as { id: ChoModalView; label: string; desktopOnly?: boolean }[]
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={choView === v.id}
                      onClick={() => runStateViewTransition(() => setChoView(v.id), 'morph')}
                      className={`${
                        v.desktopOnly
                          ? 'hidden lg:inline-flex items-center justify-center'
                          : 'inline-flex items-center justify-center'
                      } gm3-connected-btn px-3 h-10 lg:h-9 font-display text-xs font-medium cursor-pointer`}
                    >
                      {v.label}
                    </button>
                  ))}
                </ConnectedGroup>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(choDraft)
                        .then(() => flashStatus('Copiado'))
                        .catch(() => flashStatus('Não foi possível copiar'));
                    }}
                    className="pill-btn px-3 h-10 lg:h-9 text-xs"
                  >
                    Copiar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCho}
                    disabled={!choIsValid || !choIsDirty}
                    className="pill-btn pill-btn-primary px-3.5 sm:px-4 h-10 lg:h-9 text-xs"
                  >
                    {store.editMode ? (
                      <>
                        <span className="sm:hidden">Aplicar</span>
                        <span className="hidden sm:inline">Aplicar no rascunho</span>
                      </>
                    ) : (
                      'Salvar'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={closeExportModal}
                    className={`hidden sm:inline-flex pill-btn px-3 h-10 lg:h-9 text-xs ${discardArmed ? 'pill-btn-rec' : ''}`}
                  >
                    {discardArmed ? 'Sair sem salvar' : 'Fechar'}
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`flex-1 min-h-0 grid ${
                choView === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {choView !== 'preview' && (
                <div className="min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-[var(--line-subtle)]/40">
                  <ChordProEditor
                    value={choDraft}
                    onChange={(val) => {
                      setChoDraft(val);
                      if (discardArmed) setDiscardArmed(false);
                    }}
                    songChords={allChords}
                    onScrollRatioChange={(ratio) => {
                      if (choView !== 'split') return;
                      const previewEl = choPreviewScrollRef.current;
                      if (!previewEl) return;
                      const max = Math.max(0, previewEl.scrollHeight - previewEl.clientHeight);
                      previewEl.scrollTop = Math.round(ratio * max);
                    }}
                    ariaInvalid={!choIsValid}
                    ariaDescribedBy={!choIsValid ? 'cho-validation-error' : undefined}
                    className="flex-1 min-h-0"
                  />
                </div>
              )}

              {choView !== 'editor' && choPreviewSong && (
                <div className="min-h-0 flex flex-col bg-[var(--bg)]">
                  <div className="px-4 py-2 border-b border-[var(--line-subtle)]/40 flex items-center justify-between flex-shrink-0">
                    <span className="field-label">Prévia ao vivo</span>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {choPreviewSong.sections.length}{' '}
                      {choPreviewSong.sections.length === 1 ? 'seção' : 'seções'}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <ChordSheet
                      song={choPreviewSong}
                      onChordTap={() => {}}
                      scrollContainerRef={choPreviewScrollRef}
                      allowMultiColumn={false}
                      bottomPaddingClass="pb-8"
                    />
                  </div>
                </div>
              )}
            </div>

            {!choIsValid && (
              <div
                id="cho-validation-error"
                role="alert"
                className="px-4 sm:px-5 py-2 text-xs font-medium text-[var(--on-rec-container)] bg-[var(--rec-dim)] flex items-center justify-between gap-2 flex-shrink-0"
              >
                <span>Inclua a diretiva {'{title: ...}'} com um título válido antes de salvar.</span>
                <button
                  type="button"
                  onClick={() => {
                    const fallbackTitle = (song.title || 'Sem título').replace(/[{}]/g, '').trim() || 'Sem título';
                    const cleaned = choDraft.replace(/^[ \t]*\{title:[^}\r\n]*\}[ \t]*\r?\n?/im, '');
                    setChoDraft(`{title: ${fallbackTitle}}\n${cleaned}`);
                  }}
                  className="pill-btn bg-[var(--surface)] text-[var(--ink)] px-3 h-8 text-xs font-semibold flex-shrink-0"
                >
                  Inserir {'{title}'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <EnhanceModal
        open={showEnhance}
        songId={id}
        onClose={() => setShowEnhance(false)}
        onApplied={() => flashStatus('✓ Revisão aplicada')}
      />

      <VersionHistoryModal
        open={showHistory}
        songId={id}
        currentText={exportEntry(id) ?? ''}
        onClose={() => setShowHistory(false)}
        onRestored={() => flashStatus('✓ Versão restaurada')}
      />

      {displayCountIn && (
        <CountInOverlay
          open={Boolean(activeCountIn)}
          nonce={displayCountIn.nonce}
          bpm={displayCountIn.bpm}
          beats={displayCountIn.beats}
          leaderName={displayCountIn.leaderName}
          onComplete={closeCountIn}
          onCancel={closeCountIn}
        />
      )}

      {/* Floating GM3 Undo / Replace-All Snackbar & cross-viewport status toast (never overlaps overlays or docks) */}
      {(deletedToastMounted || replaceToastMounted || statusMounted) && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-[80] pointer-events-none px-4 w-full max-w-md flex justify-center ${
            showExport
              ? 'bottom-6'
              : overlaySelected || addTarget || pickStampOpen
              ? 'top-4'
              : store.editMode && editSubMode === 'chords'
              ? 'bottom-28 md:bottom-24'
              : 'bottom-5 md:bottom-6'
          }`}
        >
          {deletedToastMounted && displayDeletedToast ? (
            <div
              role="status"
              aria-live="polite"
              inert={deletedToastClosing || undefined}
              className={`gm3-undo-snackbar ${
                deletedToastClosing ? 'gm3-panel-exit' : ''
              } pointer-events-auto inline-flex items-center gap-3 pl-4 pr-2 py-1.5 text-xs font-medium`}
            >
              <span className="truncate max-w-[200px]">
                Seção &ldquo;{displayDeletedToast.label}&rdquo; removida
              </span>
              <button
                type="button"
                onClick={handleUndo}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-[40px] font-display font-semibold text-xs bg-[var(--primary-container)] text-[var(--on-primary-container)] hover:opacity-90 cursor-pointer flex-shrink-0"
              >
                <UndoIcon size={14} />
                Desfazer
              </button>
            </div>
          ) : replaceToastMounted && displayReplaceToast ? (
            <div
              role="status"
              aria-live="polite"
              inert={replaceToastClosing || undefined}
              className={`gm3-undo-snackbar ${
                replaceToastClosing ? 'gm3-panel-exit' : ''
              } pointer-events-auto inline-flex items-center gap-3 pl-4 pr-2 py-1.5 text-xs font-medium`}
            >
              <span className="font-mono font-semibold truncate max-w-[160px]">
                {displayReplaceToast.from} → {displayReplaceToast.to}
              </span>
              <button
                type="button"
                onClick={handleApplyReplaceAll}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-[40px] font-display font-semibold text-xs bg-[var(--primary-container)] text-[var(--on-primary-container)] hover:opacity-90 cursor-pointer flex-shrink-0"
              >
                Trocar outros {displayReplaceToast.remaining}
              </button>
            </div>
          ) : statusMounted && displayStatus ? (
            <div
              role="status"
              aria-live="polite"
              className={`gm3-undo-snackbar ${
                statusClosing ? 'gm3-panel-exit' : ''
              } pointer-events-none inline-flex items-center px-4 py-2.5 text-xs font-medium`}
            >
              {displayStatus}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

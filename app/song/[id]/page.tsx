'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { useLiveSession, type LiveScrollState } from '@/lib/stores/live-session-store';
import { extractChords, transposeChord, parseLine, transposeSong } from '@/lib/utils/music';
import {
  moveChordWithIndex,
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
import { hasUsableMarks } from '@/lib/utils/autoscroll';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { ChordPanel } from '@/components/chord-diagrams/ChordPanel';
import { EditChordOverlay } from '@/components/chord-sheet/EditChordOverlay';
import { VisualPulse } from '@/components/metronome/VisualPulse';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ChordProEditor } from '@/components/ui/ChordProEditor';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ShowModeView } from '@/components/show-mode/ShowModeView';
import { SetlistDrawer } from '@/components/show-mode/SetlistDrawer';
import { EnhanceModal } from '@/components/song/EnhanceModal';
import { VersionHistoryModal } from '@/components/song/VersionHistoryModal';
import { ChordsReference } from '@/components/chord-diagrams/ChordsReference';
import { SongHeader } from '@/components/song/SongHeader';
import { SongToolbar } from '@/components/song/SongToolbar';
import { SectionNav } from '@/components/song/SectionNav';
import { FocusDock } from '@/components/song/FocusDock';
import { SpotifySection } from '@/components/song/SpotifySection';
import { CalibrationBar } from '@/components/song/CalibrationBar';
import { StageNotesBar } from '@/components/song/StageNotesBar';
import { CountInOverlay } from '@/components/song/CountInOverlay';
import { useWakeLock } from '@/lib/hooks/use-wake-lock';
import type { SpotifyTrackResult } from '@/lib/spotify';

type SelectedCoord = { sectionIdx: number; lineIdx: number; segIdx: number };
type AddTarget = { sectionIdx: number; lineIdx: number; charPos: number };
type ChoModalView = 'split' | 'editor' | 'preview';

export default function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const entries = useSongStore((s) => s.entries);
  const { getSong, patchMeta, exportEntry, updateEntry } = useSongStore();
  const { setlists, addSongToSetlist } = useSetlistStore();
  const store = usePlayerStore();
  const {
    displayMode,
    setDisplayMode,
    chordsRefOpen,
    focusMode,
    setFocusMode,
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
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [editingNotes, setEditingNotes] = useState(false);
  const [localCountIn, setLocalCountIn] = useState<{
    nonce: number;
    bpm: number;
    beats: number;
    leaderName?: string | null;
  } | null>(null);

  // Visual edit mode draft + Undo/Redo stacks (single PUT on save!)
  const [editOriginText, setEditOriginText] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [editDiscardArmed, setEditDiscardArmed] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState<SelectedCoord | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);

  // Section timing calibration state ("Gravar rolagem")
  const [calibrating, setCalibrating] = useState(false);
  const [calStartMs, setCalStartMs] = useState<number>(0);
  const [calElapsedSec, setCalElapsedSec] = useState(0);
  const [calMarks, setCalMarks] = useState<(number | null)[]>([]);
  const [calNextIdx, setCalNextIdx] = useState(1);

  // Live session (cross-device sync with normalized scrollRatio)
  const setlistIdParam = searchParams.get('setlist');
  const showMode = searchParams.get('show') === '1';
  const activeSetlist = setlistIdParam
    ? setlists.find((sl) => sl.id === setlistIdParam) ?? null
    : null;
  const scrollStateRef = useRef<LiveScrollState>({ scrollTop: 0, scrollRatio: 0 });
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const live = useLiveSession(activeSetlist ? activeSetlist.id : null, id, scrollStateRef);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Keep screen awake during Show Mode, Focus Mode, Auto-scroll, or Metronome
  const wakeLock = useWakeLock(
    showMode || focusMode || store.isAutoScrolling || store.metronomeOn
  );

  const storedSong = useMemo(() => {
    void entries;
    return getSong(id);
  }, [entries, getSong, id]);

  // While visual edit mode is active, render from the local draft so edits
  // never spam Firestore/GCS and Undo/Redo is instant.
  const song = useMemo(() => {
    if (store.editMode && editDraftText !== null) {
      return parseChordPro(id, editDraftText);
    }
    return storedSong;
  }, [store.editMode, editDraftText, id, storedSong]);

  const choPreviewSong = useMemo(() => {
    if (!showExport) return null;
    return parseChordPro(id, choDraft);
  }, [showExport, id, choDraft]);

  const [titleInput, setTitleInput] = useState(song?.title || '');
  const [artistInput, setArtistInput] = useState(song?.artist || '');

  const flashStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 2400);
  }, []);

  useEffect(() => {
    if (storedSong) {
      setTitleInput(storedSong.title);
      setArtistInput(storedSong.artist);
    }
  }, [storedSong]);

  // Reset transient player state cleanly when switching songs
  const songIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!storedSong) return;
    if (songIdRef.current !== storedSong.id) {
      songIdRef.current = storedSong.id;
      store.resetForSong(storedSong.tempo, storedSong.capo, storedSong.scrollSpeed);
      setActiveSectionIdx(0);
      setSelectedCoord(null);
      setAddTarget(null);
      setEditOriginText(null);
      setEditDraftText(null);
      setUndoStack([]);
      setRedoStack([]);
      setCalibrating(false);
      setShowSpotifyPreview(false);
      setSpotifySuggestionDismissed(false);
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

  // Follow live session leader, preserving &show=1 in Show Mode
  useEffect(() => {
    if (!activeSetlist) return;
    if (live.isFollowing && live.session.currentSongId && live.session.currentSongId !== id) {
      const showSuffix = showMode ? '&show=1' : '';
      router.push(`/song/${live.session.currentSongId}?setlist=${activeSetlist.id}${showSuffix}`);
    }
  }, [activeSetlist, live.isFollowing, live.session.currentSongId, id, showMode, router]);

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

  const handleJumpToSection = useCallback((sectionIdx: number) => {
    setActiveSectionIdx(sectionIdx);
    const container = sheetScrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`#section-${sectionIdx}`);
    if (target) {
      container.scrollTo({
        top: Math.max(0, target.offsetTop - 16),
        behavior: 'smooth',
      });
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

  // Undo / Redo actions in visual edit mode
  const handleUndo = useCallback(() => {
    if (!undoStack.length || editDraftText === null) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, editDraftText]);
    setEditDraftText(previous);
    setSelectedCoord(null);
    setAddTarget(null);
  }, [undoStack, editDraftText]);

  const handleRedo = useCallback(() => {
    if (!redoStack.length || editDraftText === null) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, editDraftText]);
    setEditDraftText(next);
    setSelectedCoord(null);
    setAddTarget(null);
  }, [redoStack, editDraftText]);

  // Global keyboard shortcuts on song page
  useEffect(() => {
    if (showMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Ctrl/Cmd+Z & Ctrl/Cmd+Y inside visual edit mode (when not typing inside text input)
      if (store.editMode && (e.metaKey || e.ctrlKey) && !inInput) {
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

      if (calibrating) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (song && calNextIdx < song.sections.length) {
            markCalibrationSection(calNextIdx);
          }
        } else if (e.key === 'Escape') {
          setCalibrating(false);
        }
        return;
      }

      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      } else if (
        e.key === ' ' &&
        !store.editMode &&
        !live.isFollowing &&
        !showExport &&
        !showEnhance &&
        !showHistory
      ) {
        e.preventDefault();
        store.toggleAutoScroll();
      } else if (
        e.key.toLowerCase() === 'c' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !store.editMode &&
        !live.isFollowing &&
        !showExport &&
        !showEnhance &&
        !showHistory &&
        song
      ) {
        e.preventDefault();
        const bpb = parseInt(song.timeSignature, 10) || 4;
        setLocalCountIn({
          nonce: Date.now(),
          bpm: store.bpm,
          beats: bpb,
          leaderName: live.isLeading ? live.deviceName : null,
        });
        if (live.isLeading) live.triggerCountIn(store.bpm, bpb);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showMode,
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
    return (
      <div className="flex-1 flex flex-col">
        <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Não encontrada' }]} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-[var(--muted)]">Essa música não foi encontrada no repertório.</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="pill-btn px-4 py-2 text-xs"
          >
            Voltar para Músicas
          </button>
        </div>
      </div>
    );
  }

  const allChords = extractChords(song.sections);
  const totalShift = store.transpose + store.capo;
  const beatsPerBar = parseInt(song.timeSignature, 10) || 4;
  const displayedKey = totalShift
    ? transposeChord(song.displayKey, totalShift, store.useFlats)
    : song.displayKey;
  const pitchTarget =
    displayedKey ||
    (allChords[0] ? transposeChord(allChords[0], totalShift, store.useFlats) : '');

  const activeCountIn =
    localCountIn ??
    (live.incomingCountIn
      ? { ...live.incomingCountIn, leaderName: live.session.leaderName }
      : null);

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

  const existingSetlistSongIds = activeSetlist
    ? activeSetlist.songIds.filter((sid) => getSong(sid) !== null)
    : [];
  const setlistSongIdx = existingSetlistSongIds.indexOf(id);
  const prevSongId = setlistSongIdx > 0 ? existingSetlistSongIds[setlistSongIdx - 1] : null;
  const nextSongId =
    setlistSongIdx >= 0 && setlistSongIdx < existingSetlistSongIds.length - 1
      ? existingSetlistSongIds[setlistSongIdx + 1]
      : null;
  const nextSongObj = nextSongId ? getSong(nextSongId) : null;

  if (activeSetlist && showMode) {
    return (
      <>
        <ShowModeView
          song={song}
          activeSetlist={activeSetlist}
          setlistSongIdx={setlistSongIdx}
          totalSongs={existingSetlistSongIds.length}
          prevSongId={prevSongId}
          nextSongId={nextSongId}
          nextSongMeta={
            nextSongObj ? { title: nextSongObj.title, displayKey: nextSongObj.displayKey } : null
          }
          beatsPerBar={beatsPerBar}
          pitchTarget={pitchTarget}
          wakeLockActive={wakeLock.active}
          live={live}
          onNavigate={(songId) => router.push(`/song/${songId}?setlist=${activeSetlist.id}&show=1`)}
          onExit={() => router.replace(`/song/${id}?setlist=${activeSetlist.id}`)}
          onChordTap={(chord) => store.setActiveChord(chord)}
          onScrollStateChange={(st) => {
            scrollStateRef.current = st;
          }}
          onTriggerCountIn={handleTriggerCountIn}
          handleGoLive={handleGoLive}
          confirmGoLive={confirmGoLive}
          showNamePrompt={showNamePrompt}
          nameInput={nameInput}
          setNameInput={setNameInput}
          setShowNamePrompt={setShowNamePrompt}
        />
        {activeCountIn && (
          <CountInOverlay
            key={activeCountIn.nonce}
            bpm={activeCountIn.bpm}
            beats={activeCountIn.beats}
            leaderName={activeCountIn.leaderName}
            onComplete={closeCountIn}
            onCancel={closeCountIn}
          />
        )}
      </>
    );
  }

  // ── Visual edit session lifecycle & draft helpers ───────────────────────────
  const currentSong = song;
  const editDirty =
    store.editMode && editOriginText !== null && editDraftText !== null && editDraftText !== editOriginText;

  const enterVisualEdit = () => {
    const raw = exportEntry(id) ?? songToChordPro(currentSong);
    setCalibrating(false);
    setEditOriginText(raw);
    setEditDraftText(raw);
    setUndoStack([]);
    setRedoStack([]);
    setEditDiscardArmed(false);
    store.setEditMode(true);
  };

  const commitDraftText = (nextText: string) => {
    if (editDraftText !== null && nextText === editDraftText) return;
    if (editDraftText !== null) {
      setUndoStack((s) => [...s.slice(-49), editDraftText]);
    }
    setRedoStack([]);
    setEditDraftText(nextText);
    setEditDiscardArmed(false);
  };

  const handleSaveVisualEdit = () => {
    if (editDraftText !== null && editOriginText !== null && editDraftText !== editOriginText) {
      // Snapshot the pre-edit version in the background so visual edits are undoable in History
      fetch(`/api/songs/${id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editOriginText }),
      }).catch(() => {});
      updateEntry(id, editDraftText);
      flashStatus('✓ Alterações salvas');
    }
    store.setEditMode(false);
    setEditOriginText(null);
    setEditDraftText(null);
    setUndoStack([]);
    setRedoStack([]);
    setEditDiscardArmed(false);
    closeOverlay();
  };

  const handleCancelVisualEdit = () => {
    if (editDirty && !editDiscardArmed) {
      setEditDiscardArmed(true);
      setTimeout(() => setEditDiscardArmed(false), 6000);
      return;
    }
    store.setEditMode(false);
    setEditOriginText(null);
    setEditDraftText(null);
    setUndoStack([]);
    setRedoStack([]);
    setEditDiscardArmed(false);
    closeOverlay();
  };

  function applyLineEdit(sectionIdx: number, lineIdx: number, newLine: string) {
    const updatedSections = currentSong.sections.map((sec, si) => {
      if (si !== sectionIdx) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l, li) => (li === lineIdx ? newLine : l)),
      };
    });
    commitDraftText(songToChordPro({ ...currentSong, sections: updatedSections }));
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
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: renameSongSection(currentSong.sections, sectionIdx, label),
      })
    );
  }

  function handleDuplicateSection(sectionIdx: number) {
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: duplicateSongSection(currentSong.sections, sectionIdx),
      })
    );
    closeOverlay();
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
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: removeSongSection(currentSong.sections, sectionIdx),
      })
    );
    closeOverlay();
  }

  function handleAddSection(label: string) {
    commitDraftText(
      songToChordPro({
        ...currentSong,
        sections: addSongSection(currentSong.sections, label),
      })
    );
  }

  function handleChordSelect(sectionIdx: number, lineIdx: number, segIdx: number) {
    if (
      selectedCoord?.sectionIdx === sectionIdx &&
      selectedCoord?.lineIdx === lineIdx &&
      selectedCoord?.segIdx === segIdx
    ) {
      setSelectedCoord(null);
      setAddTarget(null);
    } else {
      setSelectedCoord({ sectionIdx, lineIdx, segIdx });
      setAddTarget(null);
    }
  }

  function handleAddChord(sectionIdx: number, lineIdx: number, charPos: number) {
    setSelectedCoord(null);
    setAddTarget({ sectionIdx, lineIdx, charPos });
  }

  function handleMove(sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    const { line: nextLine, nextSegIdx } = moveChordWithIndex(line, segIdx, dir);
    applyLineEdit(sectionIdx, lineIdx, nextLine);
    setSelectedCoord({ sectionIdx, lineIdx, segIdx: nextSegIdx });
  }

  function handleRename(sectionIdx: number, lineIdx: number, segIdx: number, newChord: string) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    applyLineEdit(sectionIdx, lineIdx, renameChord(line, segIdx, newChord));
  }

  function handleDelete(sectionIdx: number, lineIdx: number, segIdx: number) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    applyLineEdit(sectionIdx, lineIdx, deleteChord(line, segIdx));
  }

  function handleInsert(sectionIdx: number, lineIdx: number, charPos: number, chord: string) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    applyLineEdit(sectionIdx, lineIdx, insertChord(line, charPos, chord));
  }

  function closeOverlay() {
    setSelectedCoord(null);
    setAddTarget(null);
  }

  const overlayChordName = selectedCoord
    ? parseLine(currentSong.sections[selectedCoord.sectionIdx]?.lines[selectedCoord.lineIdx] ?? '')[
        selectedCoord.segIdx
      ]?.chord ?? ''
    : '';

  const overlaySelected =
    selectedCoord && overlayChordName ? { ...selectedCoord, chord: overlayChordName } : null;

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
    updateEntry(id, removeChordProMeta(rawText, 'marks'));
    flashStatus('Calibração removida');
  };

  // ── Song metadata & actions ─────────────────────────────────────────────────
  const saveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== song.title) patchMeta(id, 'title', trimmed);
  };

  const saveArtist = () => {
    const trimmed = artistInput.trim();
    if (trimmed !== song.artist) patchMeta(id, 'artist', trimmed);
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
    const transposed = transposeSong(song, store.transpose, store.useFlats);
    updateEntry(id, songToChordPro(transposed));
    store.setTranspose(0);
    setShowTransposeConfirm(false);
    flashStatus('✓ Salvo no novo tom');
  };

  const choIsDirty = choDraft !== (exportEntry(id) ?? '');
  const choIsValid = /^\{title:/im.test(choDraft.trim());

  const closeExportModal = () => {
    if (choIsDirty && !discardArmed) {
      setDiscardArmed(true);
      setTimeout(() => setDiscardArmed(false), 6000);
      return;
    }
    setDiscardArmed(false);
    setShowExport(false);
  };

  const handleSaveCho = () => {
    if (!choIsValid) return;
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

  const navigateInSetlist = (songId: string) => {
    if (!activeSetlist) return;
    router.push(`/song/${songId}?setlist=${activeSetlist.id}`);
  };

  const songHasCalibration = hasUsableMarks(song.sectionMarks, song.sections.length);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <VisualPulse />

      {focusMode ? (
        <FocusDock
          songTitle={song.title}
          displayedKey={displayedKey}
          pitchTarget={pitchTarget}
          stageNotes={song.notes}
          wakeLockActive={wakeLock.active}
          isFollowing={live.isFollowing}
          hasSetlist={!!activeSetlist}
          prevSongId={prevSongId}
          nextSongId={nextSongId}
          onNavigateSong={navigateInSetlist}
          onOpenSetlistDrawer={() => setShowSetlistDrawer(true)}
          onTriggerCountIn={handleTriggerCountIn}
          onExit={() => setFocusMode(false)}
        />
      ) : (
        <>
          <Breadcrumb
            items={
              activeSetlist
                ? [
                    { label: 'Início', href: '/' },
                    { label: 'Setlists', href: '/?tab=setlists' },
                    { label: activeSetlist.name, href: `/setlists/${activeSetlist.id}` },
                    { label: song.title },
                  ]
                : [{ label: 'Início', href: '/' }, { label: song.title }]
            }
          />

          <SongHeader
            song={song}
            displayedKey={displayedKey}
            pitchTarget={pitchTarget}
            titleInput={titleInput}
            artistInput={artistInput}
            onTitleChange={setTitleInput}
            onArtistChange={setArtistInput}
            onSaveTitle={saveTitle}
            onSaveArtist={saveArtist}
            onPatchMeta={(key, val) => patchMeta(id, key, val)}
            displayMode={displayMode}
            onSetDisplayMode={setDisplayMode}
            editMode={store.editMode}
            onEnterFocusMode={() => setFocusMode(true)}
            activeSetlist={activeSetlist}
            setlistSongIdx={setlistSongIdx}
            totalSetlistSongs={existingSetlistSongIds.length}
            prevSongId={prevSongId}
            nextSongId={nextSongId}
            onNavigateSong={navigateInSetlist}
            onOpenSetlistDrawer={() => setShowSetlistDrawer(true)}
            onEnterShowMode={() =>
              activeSetlist && router.push(`/song/${id}?setlist=${activeSetlist.id}&show=1`)
            }
            live={live}
            handleGoLive={handleGoLive}
            confirmGoLive={confirmGoLive}
            showNamePrompt={showNamePrompt}
            nameInput={nameInput}
            setNameInput={setNameInput}
            setShowNamePrompt={setShowNamePrompt}
            setlists={setlists}
            onAddToSetlist={handleAddToSetlist}
            onGoToCreateSetlist={() => router.push('/?tab=setlists')}
            showSpotifyPreview={showSpotifyPreview}
            onToggleSpotifyPreview={() => setShowSpotifyPreview((v) => !v)}
            onOpenSpotifyPicker={openSpotifyPicker}
            onOpenEnhance={() => setShowEnhance(true)}
            onOpenHistory={() => setShowHistory(true)}
            onOpenChordPro={() => {
              setChoDraft(exportEntry(id) ?? '');
              setDiscardArmed(false);
              setShowExport(true);
            }}
            onEditNotes={() => setEditingNotes(true)}
            statusMsg={statusMsg}
          />

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

          <SongToolbar
            beatsPerBar={beatsPerBar}
            chordCount={allChords.length}
            isFollowing={live.isFollowing}
            savedScrollSpeed={song.scrollSpeed}
            hasCalibration={songHasCalibration}
            calibrating={calibrating}
            canCalibrate={song.sections.length >= 2}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            editDirty={editDirty}
            editDiscardArmed={editDiscardArmed}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onSaveEdit={handleSaveVisualEdit}
            onCancelEdit={handleCancelVisualEdit}
            onEnterEdit={enterVisualEdit}
            hasNotes={Boolean(song.notes)}
            onSaveScrollSpeed={handleSaveScrollSpeed}
            onStartCalibration={handleStartCalibration}
            onClearCalibration={handleClearCalibration}
            onRequestSaveTranspose={() => setShowTransposeConfirm(true)}
            onTriggerCountIn={handleTriggerCountIn}
            onToggleEditNotes={() => setEditingNotes((v) => !v)}
          />

          {!store.editMode && (
            <StageNotesBar
              notes={song.notes}
              editing={editingNotes}
              onStartEdit={() => setEditingNotes(true)}
              onSave={handleSaveNotes}
              onCancel={() => setEditingNotes(false)}
            />
          )}

          {calibrating && (
            <CalibrationBar
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
          )}

          {/* Collapsible Chords Reference Strip */}
          {!store.editMode && !calibrating && displayMode !== 'lyrics-only' && chordsRefOpen && (
            <ChordsReference
              chords={allChords.map((c) => transposeChord(c, totalShift, store.useFlats))}
            />
          )}

          {/* Edit mode guidance banner */}
          {store.editMode && (
            <div className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2">
              <p className="w-full rounded-2xl bg-[var(--primary-container)] text-[var(--on-primary-container)] px-4 py-2 text-xs text-center font-medium">
                {totalShift !== 0 && (
                  <span className="font-mono font-bold mr-2">
                    [Editando no tom original {song.originalKey || ''}]
                  </span>
                )}
                Digite direto nas letras · toque num acorde para mover/trocar/apagar · use o <b>+</b> no cursor para inserir · gerencie seções no topo de cada bloco · salve tudo em <b>✓ Salvar e sair</b>
              </p>
            </div>
          )}
        </>
      )}

      {/* Section jump navigation bar */}
      {!store.editMode && (
        <SectionNav
          sections={song.sections}
          activeIdx={activeSectionIdx}
          onJump={(idx) => {
            if (calibrating) markCalibrationSection(idx);
            else handleJumpToSection(idx);
          }}
        />
      )}

      {/* Main chord / lyric sheet */}
      <div className="flex flex-1 relative min-h-0">
        <ChordSheet
          song={song}
          onChordTap={(chord) => store.setActiveChord(chord)}
          displayMode={displayMode}
          editMode={store.editMode}
          selectedCoord={selectedCoord}
          onChordSelect={handleChordSelect}
          onAddChord={handleAddChord}
          onLinesChange={applySectionEdit}
          onRenameSection={handleRenameSection}
          onDuplicateSection={handleDuplicateSection}
          onMoveSection={handleMoveSection}
          onDeleteSection={handleDeleteSection}
          onAddSection={handleAddSection}
          calibrating={calibrating}
          calibrationMarks={calMarks}
          calibrationTargetIdx={calNextIdx}
          onCalibrationTap={markCalibrationSection}
          onScrollStateChange={(st) => {
            scrollStateRef.current = st;
          }}
          syncCorrection={live.syncCorrection}
          scrollContainerRef={sheetScrollRef}
          onActiveSectionChange={setActiveSectionIdx}
          bottomPaddingClass={focusMode ? 'pb-28' : 'pb-20'}
        />

        {!store.editMode && !calibrating && (
          <ChordPanel
            chord={store.activeChord}
            onClose={() => store.setActiveChord(null)}
          />
        )}
      </div>

      {/* Setlist Drawer */}
      {activeSetlist && showSetlistDrawer && (
        <SetlistDrawer
          setlist={activeSetlist}
          currentSongId={song.id}
          canReorder={!live.isFollowing}
          onNavigate={navigateInSetlist}
          onClose={() => setShowSetlistDrawer(false)}
        />
      )}

      {/* Visual chord editing overlay */}
      {store.editMode && (overlaySelected || addTarget) && (
        <EditChordOverlay
          selected={overlaySelected}
          addTarget={addTarget}
          songChords={allChords}
          onMove={handleMove}
          onRename={handleRename}
          onDelete={handleDelete}
          onInsert={handleInsert}
          onClose={closeOverlay}
        />
      )}

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

      {/* Edit raw ChordPro source modal with live split preview */}
      {showExport && (
        <div
          className="fixed inset-0 bg-black/45 z-[70] flex items-center justify-center p-3 sm:p-4"
          onClick={closeExportModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[var(--surface)] rounded-[28px] w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden"
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 bg-[var(--surface-high)] flex-shrink-0">
              <h3 className="font-display text-lg text-[var(--ink)]">Editar fonte ChordPro (.cho)</h3>

              <div className="flex items-center gap-2 flex-wrap">
                {/* View mode switch */}
                <div className="inline-flex p-1 rounded-full bg-[var(--bg)] gap-0.5">
                  {(
                    [
                      { id: 'editor', label: 'Código' },
                      { id: 'split', label: 'Dividido' },
                      { id: 'preview', label: 'Prévia' },
                    ] as { id: ChoModalView; label: string }[]
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setChoView(v.id)}
                      className={`px-3 py-1 rounded-full font-display text-xs font-medium transition-colors cursor-pointer ${
                        choView === v.id
                          ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                          : 'text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(choDraft);
                    flashStatus('Copiado');
                  }}
                  className="pill-btn px-3 py-1.5 text-xs"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={handleSaveCho}
                  disabled={!choIsValid || !choIsDirty}
                  className="pill-btn pill-btn-primary px-4 py-1.5 text-xs"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={closeExportModal}
                  className={`pill-btn px-3 py-1.5 text-xs ${discardArmed ? 'pill-btn-rec' : ''}`}
                >
                  {discardArmed ? 'Sair sem salvar' : 'Fechar'}
                </button>
              </div>
            </div>

            <div
              className={`flex-1 min-h-0 grid ${
                choView === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {choView !== 'preview' && (
                <div className="min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-[var(--line)]">
                  <ChordProEditor
                    value={choDraft}
                    onChange={(val) => {
                      setChoDraft(val);
                      if (discardArmed) setDiscardArmed(false);
                    }}
                    className="flex-1 min-h-0"
                  />
                </div>
              )}

              {choView !== 'editor' && choPreviewSong && (
                <div className="min-h-0 flex flex-col bg-[var(--bg)]/50">
                  <div className="px-4 py-2 border-b border-[var(--line)] flex items-center justify-between flex-shrink-0">
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
                      bottomPaddingClass="pb-8"
                    />
                  </div>
                </div>
              )}
            </div>

            {!choIsValid && (
              <div className="px-5 py-2 text-xs text-[var(--rec)] border-t border-[var(--line)] flex-shrink-0">
                Inclua a diretiva {'{title: ...}'} antes de salvar.
              </div>
            )}
          </div>
        </div>
      )}

      {showEnhance && (
        <EnhanceModal
          songId={id}
          onClose={() => setShowEnhance(false)}
          onApplied={() => flashStatus('✓ Revisão aplicada')}
        />
      )}

      {showHistory && (
        <VersionHistoryModal
          songId={id}
          currentText={exportEntry(id) ?? ''}
          onClose={() => setShowHistory(false)}
          onRestored={() => flashStatus('✓ Versão restaurada')}
        />
      )}

      {activeCountIn && (
        <CountInOverlay
          key={activeCountIn.nonce}
          bpm={activeCountIn.bpm}
          beats={activeCountIn.beats}
          leaderName={activeCountIn.leaderName}
          onComplete={closeCountIn}
          onCancel={closeCountIn}
        />
      )}
    </div>
  );
}

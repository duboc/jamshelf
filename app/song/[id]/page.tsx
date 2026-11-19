'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { useLiveSession } from '@/lib/stores/live-session-store';
import { extractChords, transposeChord, parseLine, transposeSong } from '@/lib/utils/music';
import { moveChord, renameChord, deleteChord, insertChord } from '@/lib/utils/edit-chordpro';
import { songToChordPro, removeChordProMeta } from '@/lib/utils/chordpro-parser';
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
import type { SpotifyTrackResult } from '@/lib/spotify';

type SelectedCoord = { sectionIdx: number; lineIdx: number; segIdx: number };
type AddTarget = { sectionIdx: number; lineIdx: number; charPos: number };

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

  const [showExport, setShowExport] = useState(false);
  const [choDraft, setChoDraft] = useState('');
  const [discardArmed, setDiscardArmed] = useState(false);
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

  // Edit mode state
  const [selectedCoord, setSelectedCoord] = useState<SelectedCoord | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);

  // Live session (cross-device sync while playing a setlist)
  const setlistIdParam = searchParams.get('setlist');
  const showMode = searchParams.get('show') === '1';
  const activeSetlist = setlistIdParam
    ? setlists.find((sl) => sl.id === setlistIdParam) ?? null
    : null;
  const scrollTopRef = useRef(0);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const live = useLiveSession(activeSetlist ? activeSetlist.id : null, id, scrollTopRef);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const song = useMemo(() => {
    void entries;
    return getSong(id);
  }, [entries, getSong, id]);

  const [titleInput, setTitleInput] = useState(song?.title || '');
  const [artistInput, setArtistInput] = useState(song?.artist || '');

  const flashStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 2200);
  }, []);

  useEffect(() => {
    if (song) {
      setTitleInput(song.title);
      setArtistInput(song.artist);
    }
  }, [song]);

  // Reset transient player state cleanly when switching to a different song
  const songIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!song) return;
    if (songIdRef.current !== song.id) {
      songIdRef.current = song.id;
      store.resetForSong(song.tempo, song.capo);
      setActiveSectionIdx(0);
      setSelectedCoord(null);
      setAddTarget(null);
      setShowSpotifyPreview(false);
      setSpotifySuggestionDismissed(false);
    }
  }, [song, store]);

  // Keep BPM and Capo synced if edited in place on the current song
  useEffect(() => {
    if (song) store.setBpm(song.tempo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.tempo]);

  useEffect(() => {
    if (song) store.setCapo(song.capo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.capo]);

  // Follow the leader to whatever song they're on, preserving &show=1 if in Show Mode!
  useEffect(() => {
    if (!activeSetlist) return;
    if (live.isFollowing && live.session.currentSongId && live.session.currentSongId !== id) {
      const showSuffix = showMode ? '&show=1' : '';
      router.push(`/song/${live.session.currentSongId}?setlist=${activeSetlist.id}${showSuffix}`);
    }
  }, [activeSetlist, live.isFollowing, live.session.currentSongId, id, showMode, router]);

  // Auto-search Spotify for unmatched songs
  const spotifySongId = song?.spotifyTrackId ?? null;
  const spotifySongTitle = song?.title ?? '';
  const spotifySongArtist = song?.artist ?? '';
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

  // Keyboard shortcuts outside Show Mode (Space = auto-scroll, Esc = exit focus mode)
  useEffect(() => {
    if (showMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      } else if (e.key === ' ' && !store.editMode && !live.isFollowing && !showExport && !showEnhance && !showHistory) {
        e.preventDefault();
        store.toggleAutoScroll();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showMode, focusMode, setFocusMode, store, live.isFollowing, showExport, showEnhance, showHistory]);

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
        live={live}
        onNavigate={(songId) => router.push(`/song/${songId}?setlist=${activeSetlist.id}&show=1`)}
        onExit={() => router.replace(`/song/${id}?setlist=${activeSetlist.id}`)}
        onChordTap={(chord) => store.setActiveChord(chord)}
        onScrollTopChange={(v) => {
          scrollTopRef.current = v;
        }}
        handleGoLive={handleGoLive}
        confirmGoLive={confirmGoLive}
        showNamePrompt={showNamePrompt}
        nameInput={nameInput}
        setNameInput={setNameInput}
        setShowNamePrompt={setShowNamePrompt}
      />
    );
  }

  // ── Edit helpers ────────────────────────────────────────────────────────────
  const currentSong = song;

  function applyLineEdit(sectionIdx: number, lineIdx: number, newLine: string) {
    const updatedSections = currentSong.sections.map((sec, si) => {
      if (si !== sectionIdx) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l, li) => (li === lineIdx ? newLine : l)),
      };
    });
    updateEntry(id, songToChordPro({ ...currentSong, sections: updatedSections }));
  }

  function applySectionEdit(sectionIdx: number, lines: string[]) {
    const updatedSections = currentSong.sections.map((sec, si) =>
      si === sectionIdx ? { ...sec, lines } : sec
    );
    updateEntry(id, songToChordPro({ ...currentSong, sections: updatedSections }));
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
    applyLineEdit(sectionIdx, lineIdx, moveChord(line, segIdx, dir));
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
    ? parseLine(currentSong.sections[selectedCoord.sectionIdx].lines[selectedCoord.lineIdx])[
        selectedCoord.segIdx
      ]?.chord ?? ''
    : '';

  const overlaySelected =
    selectedCoord && overlayChordName ? { ...selectedCoord, chord: overlayChordName } : null;

  // ── Song metadata & actions ─────────────────────────────────────────────────
  const saveTitle = () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== song.title) patchMeta(id, 'title', trimmed);
  };

  const saveArtist = () => {
    const trimmed = artistInput.trim();
    if (trimmed !== song.artist) patchMeta(id, 'artist', trimmed);
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
    patchMeta(id, 'spotify', trackId);
    setShowSpotifyPicker(false);
    setShowMoreSuggestions(false);
    flashStatus('Spotify vinculado');
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
    updateEntry(id, choDraft);
    setDiscardArmed(false);
    setShowExport(false);
    flashStatus('✓ Salvo');
  };

  const handleJumpToSection = (sectionIdx: number) => {
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
  };

  const navigateInSetlist = (songId: string) => {
    if (!activeSetlist) return;
    router.push(`/song/${songId}?setlist=${activeSetlist.id}`);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <VisualPulse />

      {focusMode ? (
        <FocusDock
          songTitle={song.title}
          displayedKey={displayedKey}
          isFollowing={live.isFollowing}
          hasSetlist={!!activeSetlist}
          prevSongId={prevSongId}
          nextSongId={nextSongId}
          onNavigateSong={navigateInSetlist}
          onOpenSetlistDrawer={() => setShowSetlistDrawer(true)}
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
            onRequestSaveTranspose={() => setShowTransposeConfirm(true)}
            onToggleEditMode={() => {
              if (store.editMode) flashStatus('✓ Alterações salvas');
              store.toggleEditMode();
              closeOverlay();
            }}
          />

          {/* Collapsible Chords Reference Strip */}
          {!store.editMode && displayMode !== 'lyrics-only' && chordsRefOpen && (
            <ChordsReference
              chords={allChords.map((c) => transposeChord(c, totalShift, store.useFlats))}
            />
          )}

          {/* Edit mode banner */}
          {store.editMode && (
            <div className="flex-shrink-0 border-b border-[var(--accent)]/40 bg-[var(--accent-dim)] px-4 py-2">
              <p className="max-w-5xl mx-auto text-xs text-[var(--accent-ink)] text-center font-medium">
                Toque na letra para digitar · toque em um acorde para mover, trocar ou remover · use o <b>+</b> no cursor para inserir acorde · toque em <b>✓ Concluir</b> ao terminar
              </p>
            </div>
          )}
        </>
      )}

      {/* Section jump navigation bar (available in both normal and focus mode!) */}
      {!store.editMode && (
        <SectionNav
          sections={song.sections}
          activeIdx={activeSectionIdx}
          onJump={handleJumpToSection}
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
          onScrollTopChange={(v) => {
            scrollTopRef.current = v;
          }}
          syncCorrection={live.syncCorrection}
          scrollContainerRef={sheetScrollRef}
          onActiveSectionChange={setActiveSectionIdx}
          bottomPaddingClass={focusMode ? 'pb-28' : 'pb-16'}
        />

        {!store.editMode && (
          <ChordPanel
            chord={store.activeChord}
            onClose={() => store.setActiveChord(null)}
          />
        )}
      </div>

      {/* Setlist Drawer — now available in normal rehearsal mode AND focus mode */}
      {activeSetlist && showSetlistDrawer && (
        <SetlistDrawer
          setlist={activeSetlist}
          currentSongId={song.id}
          canReorder={!live.isFollowing}
          onNavigate={navigateInSetlist}
          onClose={() => setShowSetlistDrawer(false)}
        />
      )}

      {/* Edit chord overlay */}
      {store.editMode && (overlaySelected || addTarget) && (
        <EditChordOverlay
          selected={overlaySelected}
          addTarget={addTarget}
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

      {/* Edit raw ChordPro source modal */}
      {showExport && (
        <div
          className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={closeExportModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden"
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-[var(--line)] flex-shrink-0">
              <div>
                <div className="eyebrow">ChordPro (.cho)</div>
                <h3 className="font-display text-xl text-[var(--ink)]">Editar fonte da música</h3>
              </div>
              <div className="flex items-center gap-2">
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
                  className={`pill-btn px-3 py-1.5 text-xs ${
                    discardArmed ? 'pill-btn-rec' : ''
                  }`}
                >
                  {discardArmed ? 'Sair sem salvar' : 'Fechar'}
                </button>
              </div>
            </div>
            <ChordProEditor
              value={choDraft}
              onChange={(val) => {
                setChoDraft(val);
                if (discardArmed) setDiscardArmed(false);
              }}
              className="flex-1 min-h-0"
            />
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
    </div>
  );
}

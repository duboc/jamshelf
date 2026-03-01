'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { extractChords, transposeChord, parseLine } from '@/lib/utils/music';
import { moveChord, renameChord, deleteChord, insertChord } from '@/lib/utils/edit-chordpro';
import { songToChordPro } from '@/lib/utils/chordpro-parser';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { ChordPanel } from '@/components/chord-diagrams/ChordPanel';
import { Metronome } from '@/components/metronome/Metronome';
import { EditChordOverlay } from '@/components/chord-sheet/EditChordOverlay';

type SelectedCoord = { sectionIdx: number; lineIdx: number; segIdx: number };
type AddTarget = { sectionIdx: number; lineIdx: number; charPos: number };

export default function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getSong, patchMeta, exportEntry, updateEntry } = useSongStore();
  const { setlists, addSongToSetlist } = useSetlistStore();
  const store = usePlayerStore();
  const [showExport, setShowExport] = useState(false);
  const [showSetlistMenu, setShowSetlistMenu] = useState(false);
  const [setlistMsg, setSetlistMsg] = useState('');

  // Edit mode state
  const [selectedCoord, setSelectedCoord] = useState<SelectedCoord | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);

  const song = getSong(id);

  useEffect(() => {
    if (song) store.setBpm(song.tempo);
  }, [song?.tempo]);

  useEffect(() => {
    if (song) store.setCapo(song.capo);
  }, [song?.capo]);

  // Clear selection when leaving edit mode
  useEffect(() => {
    if (!store.editMode) {
      setSelectedCoord(null);
      setAddTarget(null);
    }
  }, [store.editMode]);

  if (!song) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Song not found.{' '}
        <button onClick={() => router.push('/')} className="text-violet-400 underline ml-2">
          Go back
        </button>
      </div>
    );
  }

  const allChords = extractChords(song.sections);
  const totalShift = store.transpose + store.capo;
  const displayedKey = totalShift
    ? transposeChord(song.displayKey, totalShift, store.useFlats)
    : song.displayKey;

  // ── Edit helpers ────────────────────────────────────────────────────────────
  // Capture the narrowed song in a const so nested functions can access it
  const currentSong = song;

  function applyLineEdit(sectionIdx: number, lineIdx: number, newLine: string) {
    const updatedSections = currentSong.sections.map((sec, si) => {
      if (si !== sectionIdx) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l, li) => (li === lineIdx ? newLine : l)),
      };
    });
    const updatedSong = { ...currentSong, sections: updatedSections };
    updateEntry(id, songToChordPro(updatedSong));
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
    const newLine = moveChord(line, segIdx, dir);
    applyLineEdit(sectionIdx, lineIdx, newLine);
  }

  function handleRename(sectionIdx: number, lineIdx: number, segIdx: number, newChord: string) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    const newLine = renameChord(line, segIdx, newChord);
    applyLineEdit(sectionIdx, lineIdx, newLine);
  }

  function handleDelete(sectionIdx: number, lineIdx: number, segIdx: number) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    const newLine = deleteChord(line, segIdx);
    applyLineEdit(sectionIdx, lineIdx, newLine);
  }

  function handleInsert(sectionIdx: number, lineIdx: number, charPos: number, chord: string) {
    const line = currentSong.sections[sectionIdx].lines[lineIdx];
    const newLine = insertChord(line, charPos, chord);
    applyLineEdit(sectionIdx, lineIdx, newLine);
  }

  function closeOverlay() {
    setSelectedCoord(null);
    setAddTarget(null);
  }

  const overlayChordName = selectedCoord
    ? parseLine(currentSong.sections[selectedCoord.sectionIdx].lines[selectedCoord.lineIdx])[selectedCoord.segIdx]?.chord ?? ''
    : '';

  const overlaySelected = selectedCoord && overlayChordName
    ? { ...selectedCoord, chord: overlayChordName }
    : null;

  // ── Rating / Favorite / Setlist ────────────────────────────────────────────

  const handleStar = (star: number) => {
    patchMeta(id, 'rating', song.rating === star ? 0 : star);
  };

  const handleFavorite = () => {
    patchMeta(id, 'favorite', song.favorite ? 'false' : 'true');
  };

  const handleAddToSetlist = (setlistId: string, setlistName: string) => {
    addSongToSetlist(setlistId, id);
    setSetlistMsg(`Added to "${setlistName}"`);
    setShowSetlistMenu(false);
    setTimeout(() => setSetlistMsg(''), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="text-zinc-400 hover:text-white transition-colors text-sm"
            >
              &larr; Back
            </button>
            <div>
              <h1 className="text-lg font-bold font-display text-zinc-100">{song.title}</h1>
              <div className="text-xs text-zinc-400">{song.artist}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Star rating */}
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleStar(star)}
                  className={`text-lg transition-colors ${
                    star <= song.rating ? 'text-amber-400' : 'text-zinc-700 hover:text-amber-400/60'
                  }`}
                >★</button>
              ))}
            </div>

            {/* Favorite */}
            <button
              onClick={handleFavorite}
              className={`text-xl transition-colors ${
                song.favorite ? 'text-red-400' : 'text-zinc-600 hover:text-red-400/60'
              }`}
            >
              {song.favorite ? '♥' : '♡'}
            </button>

            {/* Add to setlist */}
            <div className="relative">
              <button
                onClick={() => setShowSetlistMenu(!showSetlistMenu)}
                className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
              >
                + Setlist
              </button>
              {showSetlistMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
                  {setlists.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-zinc-500">
                      No setlists yet.{' '}
                      <button
                        onClick={() => { setShowSetlistMenu(false); router.push('/'); }}
                        className="text-violet-400 underline"
                      >
                        Create one
                      </button>
                    </div>
                  ) : (
                    setlists.map((sl) => {
                      const already = sl.songIds.includes(id);
                      return (
                        <button
                          key={sl.id}
                          onClick={() => !already && handleAddToSetlist(sl.id, sl.name)}
                          disabled={already}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                            already ? 'text-zinc-600 cursor-default' : 'text-zinc-200 hover:bg-zinc-800'
                          }`}
                        >
                          {sl.name}
                          {already && <span className="ml-2 text-xs text-zinc-600">✓</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {setlistMsg && (
              <span className="text-xs text-green-400 font-medium">{setlistMsg}</span>
            )}

            {/* Key */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Key:</span>
              <span className="text-sm font-mono font-bold text-violet-400">{displayedKey}</span>
            </div>

            {/* Capo */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Capo:</span>
              <button onClick={() => patchMeta(id, 'capo', Math.max(0, song.capo - 1))} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors">-</button>
              <span className="text-sm font-mono text-amber-400 w-4 text-center">{song.capo}</span>
              <button onClick={() => patchMeta(id, 'capo', Math.min(12, song.capo + 1))} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors">+</button>
            </div>

            {/* BPM */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">BPM:</span>
              <button onClick={() => patchMeta(id, 'tempo', Math.max(20, song.tempo - 5))} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors">-</button>
              <input
                type="number"
                value={song.tempo}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 20 && v <= 300) patchMeta(id, 'tempo', v);
                }}
                className="w-10 text-center text-sm font-mono text-zinc-300 bg-transparent border-b border-zinc-700 outline-none focus:border-violet-500"
              />
              <button onClick={() => patchMeta(id, 'tempo', Math.min(300, song.tempo + 5))} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors">+</button>
            </div>

            {/* Time Signature */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Time:</span>
              <select
                value={song.timeSignature}
                onChange={(e) => patchMeta(id, 'time', e.target.value)}
                className="text-sm font-mono text-zinc-300 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 outline-none focus:border-violet-500"
              >
                <option value="4/4">4/4</option>
                <option value="3/4">3/4</option>
                <option value="6/8">6/8</option>
                <option value="2/4">2/4</option>
                <option value="5/4">5/4</option>
                <option value="7/8">7/8</option>
              </select>
            </div>

            {/* Export .cho */}
            <button
              onClick={() => setShowExport(!showExport)}
              className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
            >
              .cho
            </button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center justify-between max-w-5xl mx-auto flex-wrap gap-2">
          {/* Transpose */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Transpose:</span>
            <button onClick={store.transposeDown} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-colors">-</button>
            <span className="text-xs font-mono text-zinc-300 w-6 text-center">
              {store.transpose > 0 ? `+${store.transpose}` : store.transpose || '0'}
            </span>
            <button onClick={store.transposeUp} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-colors">+</button>
            <button
              onClick={store.toggleFlats}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                store.useFlats ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {store.useFlats ? 'b' : '#'}
            </button>
          </div>

          {/* Font size */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Size:</span>
            <button onClick={() => store.setFontSize(store.fontSize - 10)} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs transition-colors">A-</button>
            <button onClick={() => store.setFontSize(store.fontSize + 10)} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs transition-colors">A+</button>
          </div>

          {/* Auto scroll */}
          <div className="flex items-center gap-2">
            <button
              onClick={store.toggleAutoScroll}
              disabled={store.editMode}
              className={`text-xs px-3 py-1.5 rounded font-bold transition-colors ${
                store.isAutoScrolling
                  ? 'bg-green-600 text-white'
                  : store.editMode
                  ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {store.isAutoScrolling ? 'Scrolling...' : 'Auto Scroll'}
            </button>
            {store.isAutoScrolling && (
              <input
                type="range" min={0.2} max={3} step={0.1}
                value={store.autoScrollSpeed}
                onChange={(e) => store.setAutoScrollSpeed(Number(e.target.value))}
                className="w-20 accent-violet-500"
              />
            )}
          </div>

          {/* Metronome */}
          <Metronome />

          {/* Edit toggle */}
          <button
            onClick={() => { store.toggleEditMode(); closeOverlay(); }}
            className={`text-xs px-3 py-1.5 rounded font-bold transition-colors ${
              store.editMode
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {store.editMode ? '✓ Done' : '✎ Edit'}
          </button>
        </div>
      </div>

      {/* Chord buttons bar — hidden in edit mode */}
      {!store.editMode && (
        <div className="border-b border-zinc-800 px-4 py-2 overflow-x-auto">
          <div className="max-w-5xl mx-auto flex gap-1.5 flex-wrap">
            {allChords.map((chord) => {
              const displayed = transposeChord(chord, totalShift, store.useFlats);
              return (
                <button
                  key={chord}
                  onClick={() => store.setActiveChord(displayed)}
                  className={`text-xs px-2 py-1 rounded font-mono font-bold transition-colors ${
                    store.activeChord === displayed
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-violet-400 hover:bg-zinc-700'
                  }`}
                >
                  {displayed}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit mode hint */}
      {store.editMode && (
        <div className="border-b border-violet-900/40 bg-violet-950/20 px-4 py-2">
          <p className="max-w-5xl mx-auto text-xs text-violet-400 text-center">
            Tap a chord chip to select · <span className="font-bold">◀ ▶</span> to move · <span className="font-bold">+</span> to add · tap <span className="font-bold">✓ Done</span> to exit
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 relative">
        <ChordSheet
          song={song}
          onChordTap={(chord) => store.setActiveChord(chord)}
          editMode={store.editMode}
          selectedCoord={selectedCoord}
          onChordSelect={handleChordSelect}
          onAddChord={handleAddChord}
        />
        {!store.editMode && (
          <ChordPanel
            chord={store.activeChord}
            onClose={() => store.setActiveChord(null)}
          />
        )}
      </div>

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

      {/* Setlist dropdown backdrop */}
      {showSetlistMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSetlistMenu(false)} />
      )}

      {/* Export .cho modal */}
      {showExport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="font-bold text-zinc-100">ChordPro Source</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => { const cho = exportEntry(id); if (cho) navigator.clipboard.writeText(cho); }}
                  className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setShowExport(false)}
                  className="text-zinc-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 transition-colors"
                >
                  &times;
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-zinc-300 whitespace-pre-wrap">
              {exportEntry(id)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

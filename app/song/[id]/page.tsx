'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { usePlayerStore } from '@/lib/stores/player-store';
import { extractChords, transposeChord } from '@/lib/utils/music';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { ChordPanel } from '@/components/chord-diagrams/ChordPanel';
import { Metronome } from '@/components/metronome/Metronome';

export default function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getSong, patchMeta, exportEntry } = useSongStore();
  const store = usePlayerStore();
  const [showExport, setShowExport] = useState(false);

  const song = getSong(id);

  // Sync song tempo to metronome BPM whenever it changes
  useEffect(() => {
    if (song) store.setBpm(song.tempo);
  }, [song?.tempo]);

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
  const displayedKey = store.transpose
    ? transposeChord(song.displayKey, store.transpose, store.useFlats)
    : song.displayKey;

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

          <div className="flex items-center gap-4 flex-wrap">
            {/* Key */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Key:</span>
              <span className="text-sm font-mono font-bold text-violet-400">{displayedKey}</span>
            </div>

            {/* Editable Capo */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Capo:</span>
              <button
                onClick={() => patchMeta(id, 'capo', Math.max(0, song.capo - 1))}
                className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors"
              >
                -
              </button>
              <span className="text-sm font-mono text-amber-400 w-4 text-center">{song.capo}</span>
              <button
                onClick={() => patchMeta(id, 'capo', Math.min(12, song.capo + 1))}
                className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors"
              >
                +
              </button>
            </div>

            {/* Editable BPM */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">BPM:</span>
              <button
                onClick={() => patchMeta(id, 'tempo', Math.max(20, song.tempo - 5))}
                className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors"
              >
                -
              </button>
              <input
                type="number"
                value={song.tempo}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 20 && v <= 300) patchMeta(id, 'tempo', v);
                }}
                className="w-10 text-center text-sm font-mono text-zinc-300 bg-transparent border-b border-zinc-700 outline-none focus:border-violet-500"
              />
              <button
                onClick={() => patchMeta(id, 'tempo', Math.min(300, song.tempo + 5))}
                className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-[10px] transition-colors"
              >
                +
              </button>
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
              title="Export as ChordPro (.cho)"
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
            <button
              onClick={store.transposeDown}
              className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-colors"
            >
              -
            </button>
            <span className="text-xs font-mono text-zinc-300 w-6 text-center">
              {store.transpose > 0 ? `+${store.transpose}` : store.transpose || '0'}
            </span>
            <button
              onClick={store.transposeUp}
              className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-colors"
            >
              +
            </button>
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
            <button
              onClick={() => store.setFontSize(store.fontSize - 10)}
              className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs transition-colors"
            >
              A-
            </button>
            <button
              onClick={() => store.setFontSize(store.fontSize + 10)}
              className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs transition-colors"
            >
              A+
            </button>
          </div>

          {/* Auto scroll */}
          <div className="flex items-center gap-2">
            <button
              onClick={store.toggleAutoScroll}
              className={`text-xs px-3 py-1.5 rounded font-bold transition-colors ${
                store.isAutoScrolling ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {store.isAutoScrolling ? 'Scrolling...' : 'Auto Scroll'}
            </button>
            {store.isAutoScrolling && (
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={store.autoScrollSpeed}
                onChange={(e) => store.setAutoScrollSpeed(Number(e.target.value))}
                className="w-20 accent-violet-500"
              />
            )}
          </div>

          {/* Metronome */}
          <Metronome />
        </div>
      </div>

      {/* Chord buttons bar */}
      <div className="border-b border-zinc-800 px-4 py-2 overflow-x-auto">
        <div className="max-w-5xl mx-auto flex gap-1.5 flex-wrap">
          {allChords.map((chord) => {
            const displayed = transposeChord(chord, store.transpose, store.useFlats);
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

      {/* Main content */}
      <div className="flex flex-1 relative">
        <ChordSheet
          song={song}
          onChordTap={(chord) => store.setActiveChord(chord)}
        />
        <ChordPanel
          chord={store.activeChord}
          onClose={() => store.setActiveChord(null)}
        />
      </div>

      {/* Export .cho modal */}
      {showExport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="font-bold text-zinc-100">ChordPro Source</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const cho = exportEntry(id);
                    if (cho) navigator.clipboard.writeText(cho);
                  }}
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

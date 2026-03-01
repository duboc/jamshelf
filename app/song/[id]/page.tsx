'use client';

import { use } from 'react';
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
  const { songs } = useSongStore();
  const store = usePlayerStore();

  const song = songs.find((s) => s.id === id);

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

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Key:</span>
              <span className="text-sm font-mono font-bold text-violet-400">{displayedKey}</span>
            </div>
            {song.capo > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-500">Capo:</span>
                <span className="text-sm font-mono text-amber-400">{song.capo}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">BPM:</span>
              <span className="text-sm font-mono text-zinc-300">{song.tempo}</span>
            </div>
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
    </div>
  );
}

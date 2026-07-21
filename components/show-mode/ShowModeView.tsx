'use client';

import { useRef } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { Metronome } from '@/components/metronome/Metronome';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import type { Song, Setlist } from '@/lib/types/song';

const SWIPE_MIN_DX = 60;
const SWIPE_MAX_DT = 600;
const SWIPE_DX_DY_RATIO = 1.5;
const EDGE_GUARD_PX = 24;

interface ShowModeViewProps {
  song: Song;
  activeSetlist: Setlist;
  setlistSongIdx: number;
  totalSongs: number;
  prevSongId: string | null;
  nextSongId: string | null;
  beatsPerBar: number;
  live: ReturnType<typeof useLiveSession>;
  onNavigate: (songId: string) => void;
  onExit: () => void;
  onChordTap: (chord: string) => void;
  onScrollTopChange: (v: number) => void;
  handleGoLive: () => void;
  confirmGoLive: () => void;
  showNamePrompt: boolean;
  nameInput: string;
  setNameInput: (v: string) => void;
  setShowNamePrompt: (v: boolean) => void;
}

export function ShowModeView({
  song,
  activeSetlist,
  setlistSongIdx,
  totalSongs,
  prevSongId,
  nextSongId,
  beatsPerBar,
  live,
  onNavigate,
  onExit,
  onChordTap,
  onScrollTopChange,
  handleGoLive,
  confirmGoLive,
  showNamePrompt,
  nameInput,
  setNameInput,
  setShowNamePrompt,
}: ShowModeViewProps) {
  const store = usePlayerStore();
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Followers mirror the leader's state — they get no navigation control at
  // all here, matching how Metronome/Auto Scroll already degrade for them
  // elsewhere in the app (a status label, not a disabled button).
  const canNavigate = !live.isFollowing;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!canNavigate) return;
    const t = e.touches[0];
    if (t.clientX < EDGE_GUARD_PX || t.clientX > window.innerWidth - EDGE_GUARD_PX) {
      touchRef.current = null; // avoid fighting the OS edge-swipe-back gesture
      return;
    }
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!canNavigate || !touchRef.current) return;
    const start = touchRef.current;
    touchRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) < Math.abs(dy) * SWIPE_DX_DY_RATIO || dt > SWIPE_MAX_DT) {
      return;
    }
    if (dx < 0 && nextSongId) onNavigate(nextSongId);
    else if (dx > 0 && prevSongId) onNavigate(prevSongId);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-black">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-y-2">
          <div className="min-w-0">
            <div className="text-xs text-zinc-500">
              {activeSetlist.name} &middot; Song {setlistSongIdx + 1} of {totalSongs}
            </div>
            <h1 className="text-lg font-bold font-display text-zinc-100 truncate">{song.title}</h1>
            <div className="text-xs text-zinc-400 truncate">
              {song.artist} &middot; <span className="font-mono text-violet-400">{song.displayKey}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex items-center gap-1.5">
              {live.isLeading ? (
                <>
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-600/20 text-red-400 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Leading
                  </span>
                  <button
                    onClick={live.stopLeading}
                    className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
                  >
                    Stop
                  </button>
                </>
              ) : live.isFollowing ? (
                <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-violet-400 font-semibold">
                  &#128279;{' '}
                  {live.isLeaderStale
                    ? `${live.session.leaderName} inactive`
                    : `Following ${live.session.leaderName}`}
                </span>
              ) : (
                <button
                  onClick={handleGoLive}
                  className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors"
                >
                  &#128308; Start the Show
                </button>
              )}
              {showNamePrompt && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 p-3 space-y-2">
                  <div className="text-xs text-zinc-400">Your name, so the band knows who&rsquo;s leading:</div>
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmGoLive();
                      if (e.key === 'Escape') setShowNamePrompt(false);
                    }}
                    placeholder="e.g. Alex - Guitar"
                    className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 outline-none focus:border-violet-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowNamePrompt(false)} className="text-xs text-zinc-500 hover:text-zinc-300">
                      Cancel
                    </button>
                    <button
                      onClick={confirmGoLive}
                      className="text-xs px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold"
                    >
                      Go Live
                    </button>
                  </div>
                </div>
              )}
            </div>

            {canNavigate && (
              <button
                onClick={store.toggleAutoScroll}
                className={`text-xs px-3 py-1.5 rounded font-bold transition-colors ${
                  store.isAutoScrolling
                    ? 'bg-green-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {store.isAutoScrolling ? 'Scrolling...' : 'Auto Scroll'}
              </button>
            )}

            <Metronome readOnly={!canNavigate} beatsPerBar={beatsPerBar} />

            <button
              onClick={onExit}
              className="text-xs px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Exit Show Mode
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative min-h-0" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <ChordSheet
          song={song}
          onChordTap={onChordTap}
          onScrollTopChange={onScrollTopChange}
          syncCorrection={live.syncCorrection}
        />

        {canNavigate && (
          <>
            <button
              onClick={() => prevSongId && onNavigate(prevSongId)}
              disabled={!prevSongId}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-zinc-900/70 backdrop-blur text-zinc-300 disabled:text-zinc-700 disabled:cursor-not-allowed hover:bg-zinc-800 flex items-center justify-center text-2xl transition-colors z-10"
              title="Previous song"
            >
              &#8249;
            </button>
            <button
              onClick={() => nextSongId && onNavigate(nextSongId)}
              disabled={!nextSongId}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-zinc-900/70 backdrop-blur text-zinc-300 disabled:text-zinc-700 disabled:cursor-not-allowed hover:bg-zinc-800 flex items-center justify-center text-2xl transition-colors z-10"
              title="Next song"
            >
              &#8250;
            </button>
          </>
        )}
      </div>
    </div>
  );
}

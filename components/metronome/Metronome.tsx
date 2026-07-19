'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';

export function Metronome({
  readOnly = false,
  beatsPerBar = 4,
}: {
  readOnly?: boolean;
  beatsPerBar?: number;
}) {
  const { bpm, metronomeOn, beat, setBeat, setMetronomeOn } = usePlayerStore();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beatRef = useRef(0);

  const playClick = useCallback((isDownbeat: boolean) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = isDownbeat ? 1000 : 800;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  }, []);

  useEffect(() => {
    if (metronomeOn) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      beatRef.current = 0;
      setBeat(0);
      const ms = (60 / bpm) * 1000;
      playClick(true);
      intervalRef.current = setInterval(() => {
        beatRef.current = (beatRef.current + 1) % beatsPerBar;
        setBeat(beatRef.current);
        playClick(beatRef.current === 0);
      }, ms);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [metronomeOn, bpm, beatsPerBar, playClick, setBeat]);

  const beatIndicator = metronomeOn && (
    <div className="flex items-center gap-2">
      <div className="flex gap-1.5">
        {Array.from({ length: beatsPerBar }, (_, b) => (
          <div
            key={b}
            className={`w-3.5 h-3.5 rounded-full transition-colors ${
              b === 0 ? 'ring-2 ring-amber-400/70' : ''
            } ${beat === b ? 'bg-violet-400 scale-125' : 'bg-zinc-700'}`}
          />
        ))}
      </div>
      <span className="text-base font-bold font-mono text-violet-300 tabular-nums w-5 text-center">
        {beat + 1}
      </span>
    </div>
  );

  if (readOnly) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-500 font-mono">
          {metronomeOn ? `${bpm} BPM · synced` : 'Metronome synced'}
        </span>
        {beatIndicator}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setMetronomeOn(!metronomeOn)}
        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
          metronomeOn
            ? 'bg-violet-600 text-white'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
        }`}
      >
        {metronomeOn ? 'Stop' : 'Metronome'}
      </button>
      {beatIndicator}
    </div>
  );
}

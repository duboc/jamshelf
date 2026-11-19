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
      <div className="flex gap-1">
        {Array.from({ length: beatsPerBar }, (_, b) => (
          <div
            key={b}
            className={`w-3 h-3 rounded-full transition-all ${
              b === 0 ? 'ring-2 ring-[var(--accent)]/70' : ''
            } ${beat === b ? 'bg-[var(--tune)] scale-125' : 'bg-[var(--surface2)]'}`}
          />
        ))}
      </div>
      <span className="text-xs font-bold font-mono text-[var(--tune)] tabular-nums w-4 text-center">
        {beat + 1}
      </span>
    </div>
  );

  if (readOnly) {
    return (
      <div className="flex items-center gap-2">
        <span className="studio-chip text-[var(--muted)]">
          {metronomeOn ? `${bpm} BPM · sinc.` : 'Metrônomo sinc.'}
        </span>
        {beatIndicator}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => setMetronomeOn(!metronomeOn)}
        className={`pill-btn px-3 py-1.5 text-xs ${
          metronomeOn ? 'pill-btn-primary' : ''
        }`}
      >
        {metronomeOn ? `Parar (${bpm})` : 'Metrônomo'}
      </button>
      {beatIndicator}
    </div>
  );
}

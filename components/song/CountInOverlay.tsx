'use client';

import { useEffect, useRef, useState } from 'react';
import { playCountInClick } from '@/lib/utils/pitch-audio';

interface CountInOverlayProps {
  bpm: number;
  beats: number;
  leaderName?: string | null;
  onComplete: () => void;
  onCancel: () => void;
}

export function CountInOverlay({
  bpm,
  beats,
  leaderName,
  onComplete,
  onCancel,
}: CountInOverlayProps) {
  const safeBpm = Math.max(40, Math.min(240, bpm || 120));
  const safeBeats = Math.max(2, Math.min(8, beats || 4));

  const [currentBeat, setCurrentBeat] = useState(1);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onCancelRef.current = onCancel;
  }, [onComplete, onCancel]);

  useEffect(() => {
    const msPerBeat = (60 / safeBpm) * 1000;
    if (!mutedRef.current) playCountInClick(true);

    let step = 1;
    const interval = setInterval(() => {
      step += 1;
      if (step > safeBeats) {
        clearInterval(interval);
        onCompleteRef.current();
        return;
      }
      setCurrentBeat(step);
      if (!mutedRef.current) playCountInClick(false);
    }, msPerBeat);

    return () => clearInterval(interval);
  }, [safeBpm, safeBeats]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      role="status"
      aria-live="assertive"
      onClick={onCancel}
      className="fixed inset-0 z-[75] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-[28px] bg-[var(--surface)] px-7 py-8 text-center space-y-6"
        style={{ boxShadow: 'var(--shadow-md)' }}
      >
        <div className="space-y-1">
          <div className="field-label">
            {leaderName ? `Contagem ao vivo · ${leaderName}` : 'Contagem de entrada'}
          </div>
          <div className="font-mono text-xs text-[var(--muted)] tabular-nums">
            {safeBpm} BPM · {safeBeats} tempos
          </div>
        </div>

        <div
          key={currentBeat}
          className={`font-expressive text-[104px] leading-none select-none transition-transform ${
            currentBeat === 1 ? 'text-[var(--accent)]' : 'text-[var(--ink)]'
          }`}
        >
          {currentBeat}
        </div>

        <div className="flex items-center justify-center gap-3">
          {Array.from({ length: safeBeats }, (_, idx) => {
            const beatNum = idx + 1;
            const passed = beatNum < currentBeat;
            const isNow = beatNum === currentBeat;
            return (
              <span
                key={beatNum}
                className={`rounded-full transition-all ${
                  isNow
                    ? 'w-4 h-4 bg-[var(--accent)] scale-115'
                    : passed
                    ? 'w-3.5 h-3.5 bg-[var(--tune-dot)]'
                    : 'w-3 h-3 bg-[var(--line-subtle)]'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="pill-btn bg-[var(--bg)] px-4 py-2 text-xs"
          >
            {muted ? 'Som desligado' : 'Som ligado'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="pill-btn bg-[var(--bg)] px-4 py-2 text-xs"
          >
            Cancelar (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}

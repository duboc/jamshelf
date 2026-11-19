'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { playCountInClick } from '@/lib/utils/pitch-audio';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { VolumeIcon } from '@/components/ui/Icons';

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
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [currentBeat, setCurrentBeat] = useState(1);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);

  useDialogA11y(true, () => onCancelRef.current(), dialogRef);

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

  return (
    <div
      onClick={onCancel}
      className="gm3-backdrop-enter fixed inset-0 z-[75] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="gm3-card gm3-dialog-enter w-full max-w-xs rounded-[28px] bg-[var(--surface)] px-7 py-8 text-center space-y-6"
        style={{ boxShadow: 'var(--shadow-md)' }}
      >
        <div className="space-y-1">
          <h2 id={titleId} className="field-label">
            {leaderName ? `Contagem ao vivo · ${leaderName}` : 'Contagem de entrada'}
          </h2>
          <div className="font-mono text-xs text-[var(--muted)] tabular-nums">
            {safeBpm} BPM · {safeBeats} tempos
          </div>
        </div>

        <div
          key={currentBeat}
          aria-live="assertive"
          aria-atomic="true"
          className={`gm3-beat-pop font-expressive text-[104px] leading-none select-none ${
            currentBeat === 1 ? 'text-[var(--accent)]' : 'text-[var(--ink)]'
          }`}
        >
          {currentBeat}
        </div>

        <div className="flex items-center justify-center gap-3" aria-hidden="true">
          {Array.from({ length: safeBeats }, (_, idx) => {
            const beatNum = idx + 1;
            const passed = beatNum < currentBeat;
            const isNow = beatNum === currentBeat;
            return (
              <span
                key={beatNum}
                className={`w-4 h-4 gm3-beat-dot ${
                  isNow
                    ? 'bg-[var(--accent)] scale-115'
                    : passed
                    ? 'bg-[var(--tune-dot)] scale-90'
                    : 'bg-[var(--line)] scale-75'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={!muted}
            className="pill-btn bg-[var(--bg)] h-10 px-4 text-xs"
          >
            <VolumeIcon size={15} muted={muted} />
            {muted ? 'Som desligado' : 'Som ligado'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="pill-btn bg-[var(--bg)] h-10 px-4 text-xs"
          >
            Cancelar (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}

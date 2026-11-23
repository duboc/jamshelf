'use client';

import { useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { ensureMetronomeAudioContext } from '@/lib/hooks/use-metronome-engine';
import { VolumeIcon } from '@/components/ui/Icons';

const TAP_RESET_MS = 2200;
const MAX_TAP_SAMPLES = 6;

interface MetronomeProps {
  readOnly?: boolean;
  beatsPerBar?: number;
  savedTempo?: number;
  tempoConfirmed?: boolean;
  onSaveBpm?: (bpm: number) => void;
  audioBlocked?: boolean;
  onUnlockAudio?: () => void;
  buttonClass?: string;
  heightClass?: string;
}

/**
 * Pure GM3 metronome controls + Tap Tempo UI.
 * Audio scheduling lives in page-level `useMetronomeEngine` so closing popovers
 * never interrupts clicks.
 */
export function Metronome({
  readOnly = false,
  beatsPerBar = 4,
  savedTempo,
  tempoConfirmed = true,
  onSaveBpm,
  audioBlocked = false,
  onUnlockAudio,
  buttonClass = '',
  heightClass = 'h-9',
}: MetronomeProps) {
  const { bpm, metronomeOn, beat, setBpm, setMetronomeOn } = usePlayerStore();

  const tapTimesRef = useRef<number[]>([]);
  const [tapActive, setTapActive] = useState(false);
  const [tapPulse, setTapPulse] = useState(0);
  const tapClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTapTempo = () => {
    const now = performance.now();
    const prev = tapTimesRef.current;
    if (prev.length > 0 && now - prev[prev.length - 1] > TAP_RESET_MS) {
      tapTimesRef.current = [now];
    } else {
      tapTimesRef.current = [...prev.slice(-MAX_TAP_SAMPLES), now];
    }

    setTapActive(true);
    setTapPulse((n) => n + 1);
    if (tapClearRef.current) clearTimeout(tapClearRef.current);
    tapClearRef.current = setTimeout(() => setTapActive(false), 900);

    const taps = tapTimesRef.current;
    if (taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) {
        const dt = taps[i] - taps[i - 1];
        if (dt >= 220 && dt <= 2000) intervals.push(dt);
      }
      if (intervals.length > 0) {
        const sorted = [...intervals].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const medianMs =
          sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        const nextBpm = Math.max(40, Math.min(240, Math.round(60000 / medianMs)));
        setBpm(nextBpm);
      }
    }
  };

  const bpmDirty =
    !readOnly &&
    onSaveBpm !== undefined &&
    savedTempo !== undefined &&
    (bpm !== savedTempo || !tempoConfirmed);

  const beatIndicator = metronomeOn ? (
    <div className="flex items-center gap-2">
      {audioBlocked ? (
        <button
          type="button"
          onClick={onUnlockAudio}
          className="pill-btn pill-btn-tonal px-2.5 h-8 text-xs"
          title="O navegador pausou o áudio automático; toque para liberar o som do metrônomo"
        >
          <VolumeIcon size={14} muted />
          Ativar áudio
        </button>
      ) : (
        <>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: Math.max(2, Math.min(12, beatsPerBar || 4)) }, (_, b) => (
              <div
                key={b}
                className={`gm3-beat-dot w-2.5 h-2.5 ${
                  beat === b
                    ? b === 0
                      ? 'bg-[var(--accent)] scale-125'
                      : 'bg-[var(--tune-dot)] scale-115'
                    : 'bg-[var(--line)] scale-100'
                }`}
              />
            ))}
          </div>
          <span
            key={beat}
            className="gm3-beat-pop font-expressive text-xs text-[var(--accent)] w-3.5 text-center tabular-nums"
          >
            {beat + 1}
          </span>
        </>
      )}
    </div>
  ) : null;

  if (readOnly) {
    return (
      <div data-motion-scheme="standard" className="inline-flex items-center gap-2 flex-wrap">
        <span className="studio-chip text-[var(--muted)]">
          {metronomeOn ? `${bpm} BPM · sinc.` : 'Metrônomo sinc.'}
        </span>
        {beatIndicator}
      </div>
    );
  }

  return (
    <div data-motion-scheme="standard" className="flex flex-wrap items-center gap-1.5">
      <div className="gm3-btn-group flex-shrink-0">
        <button
          type="button"
          aria-pressed={metronomeOn}
          onClick={() => {
            if (!metronomeOn) ensureMetronomeAudioContext();
            setMetronomeOn(!metronomeOn);
          }}
          className={`pill-btn px-3 ${heightClass} text-xs ${
            metronomeOn ? 'pill-btn-primary' : buttonClass
          }`}
          title="Ligar ou desligar metrônomo (atalho: M)"
        >
          {metronomeOn ? `Parar (${bpm})` : `Metrônomo · ${!tempoConfirmed ? '~' : ''}${bpm}`}
        </button>

        <button
          type="button"
          data-active={tapActive || undefined}
          onClick={handleTapTempo}
          className={`pill-btn px-2.5 ${heightClass} text-xs font-mono ${
            tapActive ? 'pill-btn-tonal' : buttonClass
          }`}
          title="Bata no ritmo 2 ou mais vezes para detectar o BPM"
        >
          <span key={tapPulse} className={tapPulse > 0 ? 'gm3-beat-pop inline-block' : 'inline-block'}>
            Tap
          </span>
        </button>
      </div>

      {metronomeOn && (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setBpm(bpm - 2)}
            className={`pill-btn w-8 ${heightClass} font-mono text-xs ${buttonClass}`}
            aria-label="Diminuir BPM"
            title="-2 BPM"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setBpm(bpm + 2)}
            className={`pill-btn w-8 ${heightClass} font-mono text-xs ${buttonClass}`}
            aria-label="Aumentar BPM"
            title="+2 BPM"
          >
            +
          </button>
        </div>
      )}

      {bpmDirty && (
        <button
          type="button"
          onClick={() => onSaveBpm?.(bpm)}
          className={`pill-btn pill-btn-tonal px-2.5 ${heightClass} text-xs`}
          title={`Salvar ${bpm} BPM nesta música`}
        >
          Salvar {bpm}
        </button>
      )}

      {beatIndicator}
    </div>
  );
}

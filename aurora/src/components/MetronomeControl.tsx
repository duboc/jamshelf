import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { ensureMetronomeAudioContext } from '@/lib/hooks/use-metronome-engine';
import { usePrefersReducedMotion } from '../aurora/energy';
import { AuroraButton, UiIcon } from '../aurora/primitives';

const TAP_RESET_MS = 2200;
const MAX_TAPS = 6;

/**
 * Controls the page-level headless Web Audio metronome (`useMetronomeEngine`).
 * Closing a popover that hosts this control never interrupts clicks.
 */
export function MetronomeControl({
  beatsPerBar = 4,
  savedTempo,
  tempoConfirmed = true,
  readOnly = false,
  audioBlocked = false,
  onUnlockAudio,
  onSaveBpm,
  onCountIn,
  compactCountIn = false,
  fullWidth = false,
}: {
  beatsPerBar?: number;
  savedTempo?: number;
  tempoConfirmed?: boolean;
  readOnly?: boolean;
  audioBlocked?: boolean;
  onUnlockAudio?: () => void;
  onSaveBpm?: (bpm: number) => void;
  onCountIn?: () => void;
  compactCountIn?: boolean;
  fullWidth?: boolean;
}) {
  const { bpm, metronomeOn, beat, setBpm, setMetronomeOn } = usePlayerStore();
  const reduced = usePrefersReducedMotion();
  const tapTimesRef = useRef<number[]>([]);
  const [tapActive, setTapActive] = useState(false);

  const safeBeats = Math.max(2, Math.min(12, beatsPerBar || 4));

  const handleToggle = () => {
    if (!metronomeOn) {
      ensureMetronomeAudioContext();
    }
    setMetronomeOn(!metronomeOn);
  };

  const handleTap = () => {
    const now = performance.now();
    const list = tapTimesRef.current;
    if (list.length > 0 && now - list[list.length - 1] > TAP_RESET_MS) {
      tapTimesRef.current = [now];
    } else {
      list.push(now);
      if (list.length > MAX_TAPS) list.shift();
      if (list.length >= 2) {
        let sum = 0;
        for (let i = 1; i < list.length; i++) sum += list[i] - list[i - 1];
        const avg = sum / (list.length - 1);
        const nextBpm = Math.round(60000 / avg);
        if (nextBpm >= 40 && nextBpm <= 240) {
          setBpm(nextBpm);
        }
      }
    }
    setTapActive(true);
    window.setTimeout(() => setTapActive(false), 320);
  };

  const bpmDirty =
    Boolean(onSaveBpm) &&
    !readOnly &&
    (!tempoConfirmed || (savedTempo !== undefined && Math.abs(bpm - savedTempo) >= 1));

  // WCAG 2.3.1: cap visual pulse to downbeat only above 150 BPM or under reduced motion
  const downbeatOnly = reduced || bpm > 150;

  return (
    <div data-motion-scheme="standard" className={fullWidth ? 'space-y-2 w-full' : 'inline-flex items-center'}>
      <div
        className={`flex items-center flex-wrap gap-1 rounded-2xl bg-surface-container px-1.5 py-1 ${
          fullWidth ? 'w-full justify-between' : 'rounded-full bg-surface-container-high px-0.5 py-0 flex-nowrap'
        }`}
      >
        <AuroraButton
          color={metronomeOn ? 'primary-tonal' : 'text'}
          icon={metronomeOn ? 'graphic_eq' : 'play_arrow'}
          disabled={readOnly}
          onClick={handleToggle}
          aria-pressed={metronomeOn}
          aria-label={`Metrônomo ${bpm} BPM`}
          title={metronomeOn ? 'Pausar metrônomo (M)' : 'Iniciar metrônomo audível (M)'}
          className="text-on-surface"
        >
          <span className="tabular-nums font-mono">{bpm} BPM</span>
        </AuroraButton>

        {!readOnly && (
          <div className="inline-flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Diminuir BPM em 2"
              title="Diminuir BPM em 2"
              onClick={() => setBpm(bpm - 2)}
              className="dock-stepper-btn"
            >
              <UiIcon name="remove" size={20} />
            </button>
            <button
              type="button"
              aria-label="Aumentar BPM em 2"
              title="Aumentar BPM em 2"
              onClick={() => setBpm(bpm + 2)}
              className="dock-stepper-btn"
            >
              <UiIcon name="add" size={20} />
            </button>
            <AuroraButton
              color={tapActive ? 'tonal' : 'text'}
              onClick={handleTap}
              className="text-on-surface px-3"
              title="Marcar tempo com toques"
            >
              Tap
            </AuroraButton>
          </div>
        )}

        {onCountIn && (
          <AuroraButton
            color="text"
            icon="looks_4"
            onClick={onCountIn}
            aria-label={`Contagem visual de ${safeBeats} tempos (atalho C)`}
            title={`Contagem visual 1-${safeBeats} (atalho C)`}
            className="text-on-surface"
          >
            <span className={compactCountIn ? 'hidden 2xl:inline' : 'hidden xl:inline'}>
              Contagem
            </span>
          </AuroraButton>
        )}

        {metronomeOn && !downbeatOnly && (
          <div className="flex items-center gap-1 px-1.5" aria-hidden="true">
            {Array.from({ length: Math.min(safeBeats, 6) }).map((_, i) => (
              <span
                key={i}
                data-active={beat === i ? (i === 0 ? 'downbeat' : 'beat') : undefined}
                className={`beat-dot ${
                  beat === i ? (i === 0 ? 'bg-primary' : 'bg-tertiary') : 'bg-outline'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {metronomeOn && audioBlocked && onUnlockAudio && (
        <AuroraButton
          color="tonal"
          icon="volume_up"
          onClick={onUnlockAudio}
          className="w-full justify-center"
        >
          Toque para ativar som do metrônomo
        </AuroraButton>
      )}

      {bpmDirty && onSaveBpm && (
        <AuroraButton
          color="primary-tonal"
          icon="check"
          onClick={() => onSaveBpm(bpm)}
          className={fullWidth ? 'w-full justify-center' : 'px-3'}
        >
          Salvar {bpm} BPM na música
        </AuroraButton>
      )}
    </div>
  );
}

/**
 * WCAG 2.3.1-safe top viewport rhythmic beat ribbon.
 * Disabled under prefers-reduced-motion; pulses downbeat-only above 150 BPM (<= 2.5 Hz).
 * Driven via Web Animations API without CSS keyframe rules.
 */
export function VisualPulseRibbon() {
  const { beat, metronomeOn, bpm } = usePlayerStore();
  const { visualPulseEnabled } = useDisplayStore();
  const reduced = usePrefersReducedMotion();
  const barRef = useRef<HTMLDivElement>(null);

  const shouldSkip = !metronomeOn || !visualPulseEnabled || reduced || (bpm > 150 && beat !== 0);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    if (shouldSkip) return;
    const durationMs = Math.max(380, Math.min(900, (60 / Math.max(40, bpm)) * 1000));
    const anim = el.animate(
      [
        { opacity: beat === 0 ? 0.95 : 0.72, transform: 'scaleX(1)' },
        { opacity: 0, transform: 'scaleX(0.92)' },
      ],
      { duration: durationMs, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    );
    return () => anim.cancel();
  }, [beat, bpm, shouldSkip]);

  if (!metronomeOn || !visualPulseEnabled || reduced) return null;

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      className={`fixed top-0 inset-x-0 h-1.5 z-50 pointer-events-none origin-center ${
        beat === 0 ? 'bg-primary' : 'bg-tertiary'
      }`}
      style={{ opacity: 0 }}
    />
  );
}

export function VisualBeatStrip({ beatsPerBar = 4 }: { beatsPerBar?: number }) {
  const { metronomeOn, beat, bpm } = usePlayerStore();
  const reduced = usePrefersReducedMotion();
  if (!metronomeOn) return null;

  const total = Math.min(Math.max(2, beatsPerBar), 8);
  const safeMode = reduced || bpm > 150;

  return (
    <div
      aria-hidden="true"
      data-motion-scheme="standard"
      className="stage-toast flex items-center justify-center gap-2.5 py-2 px-4 rounded-full bg-surface-container-high"
    >
      <UiIcon name="music_note" size={20} className="text-primary" />
      {safeMode ? (
        <span className="typescale-label-sm font-mono tabular-nums text-on-surface">
          Compasso {(beat % total) + 1}/{total}
        </span>
      ) : (
        Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            data-active={beat === i ? (i === 0 ? 'downbeat' : 'beat') : undefined}
            className={`beat-dot ${
              beat === i ? (i === 0 ? 'bg-primary' : 'bg-tertiary') : 'bg-outline'
            }`}
          />
        ))
      )}
    </div>
  );
}

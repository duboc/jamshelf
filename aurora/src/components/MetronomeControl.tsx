import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { usePrefersReducedMotion } from '../aurora/energy';
import { AuroraButton, GsIcon } from '../aurora/primitives';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.12;
const TAP_RESET_MS = 2200;
const MAX_TAPS = 6;

export function MetronomeControl({
  beatsPerBar = 4,
  savedTempo,
  tempoConfirmed = true,
  readOnly = false,
  compactCountIn = false,
  onSaveBpm,
  onCountIn,
}: {
  beatsPerBar?: number;
  savedTempo?: number;
  tempoConfirmed?: boolean;
  readOnly?: boolean;
  compactCountIn?: boolean;
  onSaveBpm?: (bpm: number) => void;
  onCountIn?: () => void;
}) {
  const { bpm, metronomeOn, beat, setBeat, setBpm, setMetronomeOn } = usePlayerStore();
  const reduced = usePrefersReducedMotion();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const nextNoteTimeRef = useRef(0);
  const currentBeatRef = useRef(0);
  const bpmRef = useRef(bpm);
  const barRef = useRef(beatsPerBar);
  const tapTimesRef = useRef<number[]>([]);
  const [tapActive, setTapActive] = useState(false);

  bpmRef.current = bpm;
  barRef.current = Math.max(2, Math.min(12, beatsPerBar || 4));

  useEffect(() => {
    if (!metronomeOn) {
      if (schedulerRef.current !== null) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
      return;
    }

    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    currentBeatRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.04;

    const scheduleNote = (beatNum: number, time: number) => {
      const downbeat = beatNum === 0;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = downbeat ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(downbeat ? 1120 : 840, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(downbeat ? 0.34 : 0.2, time + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + 0.055);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.06);

      const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
      const id = window.setTimeout(() => setBeat(beatNum), delayMs);
      timersRef.current.push(id);
      if (timersRef.current.length > 24) timersRef.current.shift();
    };

    const tick = () => {
      if (ctx.state === 'suspended') return;
      while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        scheduleNote(currentBeatRef.current, nextNoteTimeRef.current);
        const secPerBeat = 60 / Math.max(40, Math.min(240, bpmRef.current));
        nextNoteTimeRef.current += secPerBeat;
        currentBeatRef.current = (currentBeatRef.current + 1) % barRef.current;
      }
    };

    tick();
    schedulerRef.current = window.setInterval(tick, LOOKAHEAD_MS);

    return () => {
      if (schedulerRef.current !== null) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, [metronomeOn, setBeat]);

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

  // WCAG 2.3.1: cap visual pulse to downbeat only above 170 BPM or under reduced motion
  const downbeatOnly = reduced || bpm > 170;

  return (
    <div
      data-motion-scheme="standard"
      className="inline-flex items-center rounded-full bg-surface-container-high px-0.5 flex-shrink-0"
    >
      <AuroraButton
        color={metronomeOn ? 'primary-tonal' : 'text'}
        icon={metronomeOn ? 'graphic_eq' : 'play_arrow'}
        disabled={readOnly}
        onClick={() => setMetronomeOn(!metronomeOn)}
        aria-pressed={metronomeOn}
        aria-label={`Metrônomo ${bpm} BPM`}
        title={metronomeOn ? 'Pausar metrônomo' : 'Iniciar metrônomo audível'}
        className="text-on-surface"
      >
        <span className="tabular-nums font-mono">{bpm} BPM</span>
      </AuroraButton>

      {!readOnly && (
        <>
          <button
            type="button"
            aria-label="Diminuir BPM em 2"
            title="Diminuir BPM em 2"
            onClick={() => setBpm(bpm - 2)}
            className="dock-stepper-btn"
          >
            <GsIcon name="remove" size={20} />
          </button>
          <button
            type="button"
            aria-label="Aumentar BPM em 2"
            title="Aumentar BPM em 2"
            onClick={() => setBpm(bpm + 2)}
            className="dock-stepper-btn"
          >
            <GsIcon name="add" size={20} />
          </button>
          <AuroraButton
            color={tapActive ? 'tonal' : 'text'}
            onClick={handleTap}
            className="text-on-surface"
            title="Marcar tempo com toques"
          >
            Tap
          </AuroraButton>
        </>
      )}

      {onCountIn && (
        <AuroraButton
          color="text"
          icon="looks_4"
          onClick={onCountIn}
          aria-label={`Contagem visual de ${barRef.current} tempos (atalho C)`}
          title={`Contagem visual 1-${barRef.current} (atalho C)`}
          className="text-on-surface"
        >
          <span className={compactCountIn ? 'hidden 2xl:inline' : 'hidden xl:inline'}>
            Contagem
          </span>
        </AuroraButton>
      )}

      {metronomeOn && !downbeatOnly && (
        <div className="flex items-center gap-1 px-1.5" aria-hidden="true">
          {Array.from({ length: Math.min(barRef.current, 6) }).map((_, i) => (
            <span
              key={i}
              data-active={beat === i ? (i === 0 ? 'downbeat' : 'beat') : undefined}
              className={`beat-dot ${
                beat === i
                  ? i === 0
                    ? 'bg-primary'
                    : 'bg-tertiary'
                  : 'bg-outline'
              }`}
            />
          ))}
        </div>
      )}

      {bpmDirty && onSaveBpm && (
        <AuroraButton
          color="tonal"
          icon="check"
          onClick={() => onSaveBpm(bpm)}
          className="px-3"
        >
          Salvar BPM
        </AuroraButton>
      )}
    </div>
  );
}

export function VisualBeatStrip({ beatsPerBar = 4 }: { beatsPerBar?: number }) {
  const { metronomeOn, beat, bpm } = usePlayerStore();
  const reduced = usePrefersReducedMotion();
  if (!metronomeOn) return null;

  const total = Math.min(Math.max(2, beatsPerBar), 8);
  const safeMode = reduced || bpm > 170;

  return (
    <div
      aria-hidden="true"
      data-motion-scheme="standard"
      className="stage-toast flex items-center justify-center gap-2.5 py-2 px-4 rounded-full bg-surface-container-high"
    >
      <GsIcon name="music_note" size={20} className="text-primary" />
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
              beat === i
                ? i === 0
                  ? 'bg-primary'
                  : 'bg-tertiary'
                : 'bg-outline'
            }`}
          />
        ))
      )}
    </div>
  );
}

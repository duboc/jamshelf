'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { VolumeIcon } from '@/components/ui/Icons';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.12;
const TAP_RESET_MS = 2200;
const MAX_TAP_SAMPLES = 6;

interface MetronomeProps {
  readOnly?: boolean;
  beatsPerBar?: number;
  savedTempo?: number;
  tempoConfirmed?: boolean;
  onSaveBpm?: (bpm: number) => void;
  buttonClass?: string;
  heightClass?: string;
}

export function Metronome({
  readOnly = false,
  beatsPerBar = 4,
  savedTempo,
  tempoConfirmed = true,
  onSaveBpm,
  buttonClass = '',
  heightClass = 'h-8',
}: MetronomeProps) {
  const { bpm, metronomeOn, beat, setBeat, setBpm, setMetronomeOn } = usePlayerStore();

  const audioCtxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visualTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextNoteTimeRef = useRef(0);
  const currentBeatRef = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsPerBarRef = useRef(beatsPerBar);

  // Tap tempo state
  const tapTimesRef = useRef<number[]>([]);
  const [tapActive, setTapActive] = useState(false);
  const [tapPulse, setTapPulse] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const tapClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    beatsPerBarRef.current = Math.max(2, Math.min(12, beatsPerBar || 4));
  }, [beatsPerBar]);

  // Web Audio lookahead scheduler: schedules clicks directly on the hardware audio clock
  // so tempo stays rock-solid (<1ms jitter) even under heavy UI rendering.
  useEffect(() => {
    if (!metronomeOn) {
      if (schedulerRef.current) {
        clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
      visualTimersRef.current.forEach(clearTimeout);
      visualTimersRef.current = [];
      return;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          setAudioBlocked(ctx.state === 'suspended');
        })
        .catch(() => {
          setAudioBlocked(true);
        });
    } else {
      const t = setTimeout(() => setAudioBlocked(false), 0);
      visualTimersRef.current.push(t);
    }

    currentBeatRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.04;

    const scheduleNote = (beatNumber: number, time: number) => {
      const isDownbeat = beatNumber === 0;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isDownbeat ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 1120 : 840, time);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(isDownbeat ? 0.36 : 0.22, time + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + 0.055);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.06);

      const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
      const timer = setTimeout(() => {
        setBeat(beatNumber);
      }, delayMs);
      visualTimersRef.current.push(timer);
      if (visualTimersRef.current.length > 24) {
        visualTimersRef.current.shift();
      }
    };

    const tick = () => {
      if (ctx.state === 'suspended') {
        setAudioBlocked(true);
        return;
      }
      while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        scheduleNote(currentBeatRef.current, nextNoteTimeRef.current);
        const secPerBeat = 60 / Math.max(40, Math.min(240, bpmRef.current || 120));
        nextNoteTimeRef.current += secPerBeat;
        currentBeatRef.current = (currentBeatRef.current + 1) % beatsPerBarRef.current;
      }
    };

    tick();
    schedulerRef.current = setInterval(tick, LOOKAHEAD_MS);

    return () => {
      if (schedulerRef.current) {
        clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
      visualTimersRef.current.forEach(clearTimeout);
      visualTimersRef.current = [];
    };
  }, [metronomeOn, setBeat]);

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
        // Use median to ignore accidental double-taps or hiccups
        const sorted = [...intervals].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const medianMs =
          sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        const nextBpm = Math.max(40, Math.min(240, Math.round(60000 / medianMs)));
        setBpm(nextBpm);
      }
    }
  };

  const handleUnlockAudio = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    ctx
      .resume()
      .then(() => {
        setAudioBlocked(ctx.state === 'suspended');
        nextNoteTimeRef.current = ctx.currentTime + 0.04;
      })
      .catch(() => {});
  };

  const bpmDirty =
    !readOnly &&
    onSaveBpm !== undefined &&
    savedTempo !== undefined &&
    (bpm !== savedTempo || !tempoConfirmed);

  const beatIndicator = (
    <div
      data-compact-slot="true"
      data-collapsed={!metronomeOn ? 'true' : undefined}
      aria-hidden={!metronomeOn || undefined}
      inert={!metronomeOn || undefined}
      className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0"
    >
      <div className="gm3-slot-x-inner pl-1.5">
        <div className="flex items-center gap-2">
          {audioBlocked ? (
            <button
              type="button"
              onClick={handleUnlockAudio}
              className="pill-btn pill-btn-tonal px-2.5 h-8 text-xs"
              title="O navegador pausou o áudio automático; toque para liberar o som do metrônomo"
            >
              <VolumeIcon size={14} muted />
              Ativar áudio
            </button>
          ) : (
            <>
              <div className="flex gap-1.5" aria-hidden="true">
                {Array.from({ length: beatsPerBar }, (_, b) => (
                  <div
                    key={b}
                    className={`gm3-beat-dot w-3 h-3 ${
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
                className="gm3-beat-pop font-expressive text-sm text-[var(--accent)] w-4 text-center tabular-nums"
              >
                {beat + 1}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (readOnly) {
    return (
      <div data-motion-scheme="standard" className="inline-flex items-center">
        <span className="studio-chip text-[var(--muted)]">
          {metronomeOn ? `${bpm} BPM · sinc.` : 'Metrônomo sinc.'}
        </span>
        {beatIndicator}
      </div>
    );
  }

  return (
    <div data-motion-scheme="standard" className="inline-flex items-center flex-shrink-0">
      <div className="gm3-btn-group flex-shrink-0">
        <button
          type="button"
          aria-pressed={metronomeOn}
          onClick={() => {
            if (!metronomeOn) {
              if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
              audioCtxRef.current.resume().catch(() => {});
            }
            setMetronomeOn(!metronomeOn);
          }}
          className={`pill-btn px-3 ${heightClass} text-xs ${
            metronomeOn ? 'pill-btn-primary' : buttonClass
          }`}
          title="Ligar ou desligar metrônomo com precisão Web Audio (atalho: M)"
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

      <div
        data-compact-slot="true"
        data-collapsed={!metronomeOn ? 'true' : undefined}
        aria-hidden={!metronomeOn || undefined}
        inert={!metronomeOn || undefined}
        className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0"
      >
        <div className="gm3-slot-x-inner pl-1">
          <div className="flex items-center gap-1">
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
        </div>
      </div>

      <div
        data-compact-slot="true"
        data-collapsed={!bpmDirty ? 'true' : undefined}
        aria-hidden={!bpmDirty || undefined}
        inert={!bpmDirty || undefined}
        className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0"
      >
        <div className="gm3-slot-x-inner pl-1">
          <button
            type="button"
            onClick={() => onSaveBpm?.(bpm)}
            className={`pill-btn pill-btn-tonal px-2.5 ${heightClass} text-xs`}
            title={`Salvar ${bpm} BPM nesta música`}
          >
            Salvar {bpm} BPM
          </button>
        </div>
      </div>

      {beatIndicator}
    </div>
  );
}

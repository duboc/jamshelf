'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.12;

let sharedAudioCtx: AudioContext | null = null;

/**
 * Lazily creates and synchronously resumes the shared Web Audio context.
 * Call inside user gesture handlers (click/tap) so iOS Safari unlocks audio immediately.
 */
export function ensureMetronomeAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Headless Web Audio lookahead metronome engine mounted once at page level.
 * Keeps clicks rock-solid (<1ms jitter) even when the Adjustments popover closes.
 */
export function useMetronomeEngine(beatsPerBar = 4) {
  const { bpm, metronomeOn, setBeat } = usePlayerStore();
  const [audioBlocked, setAudioBlocked] = useState(false);

  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visualTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextNoteTimeRef = useRef(0);
  const currentBeatRef = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsPerBarRef = useRef(beatsPerBar);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    beatsPerBarRef.current = Math.max(2, Math.min(12, beatsPerBar || 4));
  }, [beatsPerBar]);

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

    const ctx = ensureMetronomeAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => setAudioBlocked(ctx.state === 'suspended'))
        .catch(() => setAudioBlocked(true));
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

  const unlockAudio = useCallback(() => {
    const ctx = ensureMetronomeAudioContext();
    if (!ctx) return;
    ctx
      .resume()
      .then(() => {
        setAudioBlocked(ctx.state === 'suspended');
        nextNoteTimeRef.current = ctx.currentTime + 0.04;
      })
      .catch(() => {});
  }, []);

  return { audioBlocked, unlockAudio };
}

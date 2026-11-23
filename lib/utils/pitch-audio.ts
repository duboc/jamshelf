import { CHORD_SUFFIX_MAP, PIANO_INTERVALS, noteIndex } from './music';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function ensurePitchAudioContext(): AudioContext | null {
  return getAudioContext();
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Converts a key or chord name (e.g. "F#m", "Cm", "D/F#", "Gmaj7") into a
 * comfortable mid-register array of MIDI note numbers for vocal/band pitch reference.
 */
export function chordToMidiNotes(chordOrKey: string): number[] {
  const clean = chordOrKey.trim();
  if (!clean) return [];

  const [mainPart, bassPart] = clean.split('/');
  const m = mainPart.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return [];

  const rootIdx = noteIndex(m[1]);
  if (rootIdx < 0) return [];

  const rawSuffix = m[2].trim();
  let quality = CHORD_SUFFIX_MAP[rawSuffix];
  if (!quality) {
    if (/^m(?!aj)/i.test(rawSuffix)) quality = 'minor';
    else if (rawSuffix.includes('dim')) quality = 'dim';
    else if (rawSuffix.includes('sus4')) quality = 'sus4';
    else if (rawSuffix.includes('sus2')) quality = 'sus2';
    else if (rawSuffix.includes('5')) quality = '5';
    else quality = 'major';
  }

  const intervals = PIANO_INTERVALS[quality] || [0, 4, 7];
  // Place root in comfortable vocal/piano reference octave (C3=48 .. B3=59, nudge low C..E up slightly)
  const baseRoot = rootIdx <= 4 ? 52 + (rootIdx - 4) + 12 : 48 + rootIdx;
  const notes = intervals.slice(0, 4).map((iv) => baseRoot + iv);

  if (bassPart) {
    const bassM = bassPart.trim().match(/^([A-G][#b]?)/);
    if (bassM) {
      const bassIdx = noteIndex(bassM[1]);
      if (bassIdx >= 0) {
        let bassMidi = 48 + bassIdx;
        while (bassMidi >= baseRoot) bassMidi -= 12;
        notes.unshift(bassMidi);
      }
    }
  }

  return notes;
}

/**
 * Plays a warm electric-piano-like pitch reference chord (or single tonic note)
 * via Web Audio so singers and musicians can lock into the exact key before starting.
 */
export function playReferencePitch(
  chordOrKey: string,
  options: { mode?: 'chord' | 'root'; durationSec?: number } = {}
): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;

  const allNotes = chordToMidiNotes(chordOrKey);
  if (allNotes.length === 0) return false;

  const mode = options.mode ?? 'chord';
  const durationSec = options.durationSec ?? 1.9;
  const notes = mode === 'root' ? [allNotes[0]] : allNotes;
  const now = ctx.currentTime + 0.015;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.32 / Math.sqrt(notes.length), now);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1600, now);
  filter.Q.setValueAtTime(0.7, now);

  master.connect(filter);
  filter.connect(ctx.destination);

  notes.forEach((midi, idx) => {
    const start = now + idx * 0.055;
    const end = start + durationSec;
    const freq = midiToFrequency(midi);

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0.0001, start);
    noteGain.gain.linearRampToValueAtTime(1, start + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.35, start + 0.35);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
    noteGain.connect(master);

    // Warm fundamental sine
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, start);
    osc1.connect(noteGain);
    osc1.start(start);
    osc1.stop(end + 0.03);

    // Soft triangle 2nd harmonic for clarity on small phone speakers
    const osc2 = ctx.createOscillator();
    const harmGain = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, start);
    harmGain.gain.setValueAtTime(0.18, start);
    harmGain.gain.exponentialRampToValueAtTime(0.02, start + 0.5);
    osc2.connect(harmGain);
    harmGain.connect(noteGain);
    osc2.start(start);
    osc2.stop(end + 0.03);
  });

  return true;
}

/** Plays a crisp stage count-in click (accented on beat 1). */
export function playCountInClick(isDownbeat: boolean): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(isDownbeat ? 1180 : 840, now);
  osc.frequency.exponentialRampToValueAtTime(isDownbeat ? 720 : 520, now + 0.045);

  gain.gain.setValueAtTime(isDownbeat ? 0.38 : 0.24, now);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.06);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.065);
}

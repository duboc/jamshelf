import type { ParsedSong, Section } from '@/lib/types/song';
import { lineHasLyrics, parseLine } from './music';

/**
 * Estimates musical weight (in rough seconds at 110 BPM, 4/4) for a single section
 * based on lyrics word density, instrumental chord/bar count, and section role.
 */
function computeSectionWeight(section: Section, bpm: number, beatsPerBar: number): number {
  const safeBpm = Math.max(40, Math.min(220, bpm || 120));
  const secPerBar = (beatsPerBar * 60) / safeBpm;
  const tempoFactor = 110 / safeBpm;

  let weight = 0;
  for (const raw of section.lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (lineHasLyrics(trimmed)) {
      const segs = parseLine(trimmed);
      const plain = segs.map((s) => s.text).join(' ').trim();
      const words = plain ? plain.split(/\s+/).length : 0;
      const chordChanges = segs.filter((s) => s.chord).length;
      // Shorter vocal phrases take less time than dense lines; chord density adds weight
      const lineSec = Math.max(2.2, Math.min(7.5, 1.8 + words * 0.28 + chordChanges * 0.35));
      weight += lineSec * tempoFactor;
    } else {
      // Instrumental / chord-grid line: count explicit bars (|) or chord tokens
      const barPipes = (trimmed.match(/\|/g) || []).length;
      const chords = parseLine(trimmed).filter((s) => s.chord).length;
      const estimatedBars = barPipes >= 2 ? Math.max(1, barPipes - 1) : Math.max(2, chords);
      const roleBoost =
        section.type === 'solo' || section.type === 'interlude'
          ? 1.35
          : section.type === 'intro' || section.type === 'outro'
          ? 1.15
          : 1.0;
      weight += Math.max(3.0, estimatedBars * secPerBar * 0.85 * roleBoost);
    }
  }

  // Breathing room / transition between sections
  const minSectionSec = section.type === 'intro' || section.type === 'outro' ? 5 : 4;
  return Math.max(minSectionSec, weight + 1.8 * tempoFactor);
}

/**
 * Estimates a reasonable playback duration in seconds when a song has neither
 * a saved `{duration:}` directive nor a Spotify track duration.
 */
export function estimateSongDurationSec(
  song: Pick<ParsedSong, 'duration' | 'tempo' | 'sections'> & { timeSignature?: string }
): number {
  if (song.duration && song.duration >= 15) return song.duration;

  const bpm = Math.max(40, Math.min(220, song.tempo || 120));
  const beatsPerBar = parseInt(song.timeSignature || '4/4', 10) || 4;

  let total = 0;
  for (const sec of song.sections) {
    total += computeSectionWeight(sec, bpm, beatsPerBar);
  }
  return Math.round(Math.max(45, Math.min(540, total)));
}

/**
 * Returns the active duration adjusted by live BPM changes relative to the song's
 * saved tempo (e.g. rehearsing 10% slower lengthens duration by 10%).
 */
export function computeEffectiveDurationSec(
  song: Pick<ParsedSong, 'duration' | 'tempo' | 'sections'> & { timeSignature?: string },
  liveBpm?: number
): number {
  const baseDur = estimateSongDurationSec(song);
  const savedBpm = Math.max(30, Math.min(260, song.tempo || 120));
  if (!liveBpm || liveBpm <= 0 || Math.abs(liveBpm - savedBpm) < 1) {
    return baseDur;
  }
  const safeLive = Math.max(30, Math.min(260, liveBpm));
  const ratio = savedBpm / safeLive;
  return Math.max(20, Math.min(900, baseDur * ratio));
}

/**
 * Generates automatic per-section start timestamps (seconds) weighted by each
 * section's musical content (lyrics density + instrumental bars) and scaled to
 * totalDurationSec. Used whenever manual `{marks:}` calibration is not present.
 */
export function estimateSectionMarks(
  song: Pick<ParsedSong, 'tempo' | 'sections'> & { timeSignature?: string },
  totalDurationSec: number
): number[] {
  const n = song.sections.length;
  if (n < 2) return [0];

  const bpm = Math.max(40, Math.min(220, song.tempo || 120));
  const beatsPerBar = parseInt(song.timeSignature || '4/4', 10) || 4;
  const weights = song.sections.map((sec) => computeSectionWeight(sec, bpm, beatsPerBar));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const safeTotal = Math.max(20, totalDurationSec);

  const marks: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    marks.push(Number(((acc / sum) * safeTotal).toFixed(2)));
    acc += weights[i];
  }
  return marks;
}

/**
 * Computes linear scroll velocity (px/s) proportional to this device's actual
 * scrollable height so phones, tablets, and different font sizes finish the
 * song at the same time.
 */
export function computeLinearRatePxPerSec(
  maxScroll: number,
  durationSec: number,
  speedMultiplier: number
): number {
  if (maxScroll <= 0) return 0;
  const safeDur = Math.max(20, durationSec);
  const raw = (maxScroll / safeDur) * Math.max(0.2, Math.min(3, speedMultiplier));
  return Math.max(3, Math.min(240, raw));
}

/**
 * Checks whether saved section calibration marks can drive piece-wise scroll.
 */
export function hasUsableMarks(marks: number[] | null | undefined, sectionCount: number): marks is number[] {
  if (!marks || marks.length < 2 || sectionCount < 2) return false;
  for (let i = 1; i < marks.length; i++) {
    if (!Number.isFinite(marks[i]) || marks[i] < marks[i - 1]) return false;
  }
  return true;
}

/**
 * Computes target scrollTop anchors for each section, keeping the active section
 * comfortably inside the upper reading zone (instead of rushing off the top edge).
 */
function buildTargetTops(
  sectionTops: number[],
  count: number,
  maxScroll: number,
  viewportHeight: number
): number[] {
  // Keep current section ~20% down the viewport (capped at 130px) so the musician
  // reads ahead naturally and doesn't lose context at the top of the song.
  const readingAnchor = viewportHeight > 0 ? Math.min(130, Math.round(viewportHeight * 0.2)) : 0;
  const targets: number[] = [];
  let prev = 0;
  for (let i = 0; i < count; i++) {
    const raw = i === 0 ? 0 : Math.max(0, sectionTops[i] - readingAnchor);
    const clamped = Math.max(prev, Math.min(maxScroll, raw));
    targets.push(clamped);
    prev = clamped;
  }
  return targets;
}

/**
 * Maps elapsed song time (seconds) to a target scrollTop using calibrated
 * (or auto-estimated) per-section start times and live DOM section offsets.
 */
export function interpolateMarkedScroll(
  elapsedSec: number,
  marks: number[],
  sectionTops: number[],
  maxScroll: number,
  totalDurationSec: number,
  viewportHeight = 0
): number {
  if (maxScroll <= 0 || marks.length < 2 || sectionTops.length < 2) return 0;
  const count = Math.min(marks.length, sectionTops.length);
  const targets = buildTargetTops(sectionTops, count, maxScroll, viewportHeight);

  if (elapsedSec <= marks[0]) return targets[0];

  for (let i = 0; i < count - 1; i++) {
    const t0 = marks[i];
    const t1 = marks[i + 1];
    if (elapsedSec <= t1) {
      const span = Math.max(0.1, t1 - t0);
      const frac = Math.max(0, Math.min(1, (elapsedSec - t0) / span));
      return targets[i] + (targets[i + 1] - targets[i]) * frac;
    }
  }

  // Final section tail: reach maxScroll smoothly slightly before the final second
  // so the last lines are comfortably visible while finishing the song.
  const lastIdx = count - 1;
  const lastMark = marks[lastIdx];
  const avgSecPerSection = lastIdx > 0 ? Math.max(8, lastMark / lastIdx) : 20;
  const rawTail = totalDurationSec - lastMark > 6 ? totalDurationSec - lastMark : avgSecPerSection;
  const tailDur = Math.max(6, rawTail * 0.85);
  const tailFrac = Math.max(0, Math.min(1, (elapsedSec - lastMark) / tailDur));
  return targets[lastIdx] + (maxScroll - targets[lastIdx]) * tailFrac;
}

/**
 * Inverse of `interpolateMarkedScroll`: when the user manually scrolls to a
 * new scrollTop, finds the matching elapsedSec so scrolling resumes smoothly
 * from that exact spot instead of jumping back.
 */
export function scrollTopToMarkedElapsed(
  scrollTop: number,
  marks: number[],
  sectionTops: number[],
  maxScroll: number,
  totalDurationSec: number,
  viewportHeight = 0
): number {
  if (maxScroll <= 0 || marks.length < 2 || sectionTops.length < 2) return 0;
  const count = Math.min(marks.length, sectionTops.length);
  const targets = buildTargetTops(sectionTops, count, maxScroll, viewportHeight);
  const y = Math.max(0, Math.min(maxScroll, scrollTop));

  if (y <= targets[0]) return marks[0];

  for (let i = 0; i < count - 1; i++) {
    const y0 = targets[i];
    const y1 = targets[i + 1];
    if (y <= y1 && y1 > y0 + 0.5) {
      const frac = (y - y0) / (y1 - y0);
      return marks[i] + (marks[i + 1] - marks[i]) * Math.max(0, Math.min(1, frac));
    }
  }

  const lastIdx = count - 1;
  const lastMark = marks[lastIdx];
  const lastTop = targets[lastIdx];
  const avgSecPerSection = lastIdx > 0 ? Math.max(8, lastMark / lastIdx) : 20;
  const rawTail = totalDurationSec - lastMark > 6 ? totalDurationSec - lastMark : avgSecPerSection;
  const tailDur = Math.max(6, rawTail * 0.85);
  const remY = maxScroll - lastTop;
  const frac = remY > 0.5 ? (y - lastTop) / remY : 1;
  return lastMark + tailDur * Math.max(0, Math.min(1, frac));
}

export interface SetlistDurationSummary {
  totalSec: number;
  knownCount: number;
  estimatedCount: number;
}

/** Sums exact `{duration:}` values plus estimated fallbacks for a setlist. */
export function computeSetlistDuration(
  songs: (Pick<ParsedSong, 'duration' | 'tempo' | 'sections'> & { timeSignature?: string })[]
): SetlistDurationSummary {
  let totalSec = 0;
  let knownCount = 0;
  let estimatedCount = 0;
  for (const s of songs) {
    if (s.duration && s.duration >= 15) {
      totalSec += s.duration;
      knownCount++;
    } else {
      totalSec += estimateSongDurationSec(s);
      estimatedCount++;
    }
  }
  return { totalSec: Math.round(totalSec), knownCount, estimatedCount };
}

/** Human-friendly total show duration in Portuguese (e.g. "41 min", "1h 12min"). */
export function formatSetlistDuration(totalSec: number, isEstimated = false): string {
  const mins = Math.max(1, Math.round(totalSec / 60));
  const prefix = isEstimated ? '~' : '';
  if (mins < 60) return `${prefix}${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${prefix}${h}h ${String(m).padStart(2, '0')}min` : `${prefix}${h}h`;
}

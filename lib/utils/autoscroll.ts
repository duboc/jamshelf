import type { ParsedSong } from '@/lib/types/song';
import { lineHasLyrics } from './music';

/**
 * Estimates a reasonable playback duration in seconds when a song has neither
 * a saved `{duration:}` directive nor a Spotify track duration.
 */
export function estimateSongDurationSec(song: Pick<ParsedSong, 'duration' | 'tempo' | 'sections'>): number {
  if (song.duration && song.duration >= 15) return song.duration;

  let lyricLines = 0;
  let instrumentalLines = 0;
  for (const sec of song.sections) {
    for (const l of sec.lines) {
      if (!l.trim()) continue;
      if (lineHasLyrics(l)) lyricLines++;
      else instrumentalLines++;
    }
  }

  const bpm = Math.max(60, Math.min(180, song.tempo || 120));
  const tempoFactor = 110 / bpm; // slower songs take more seconds per line
  const estimated = (lyricLines * 3.4 + instrumentalLines * 2.2 + song.sections.length * 2.5) * tempoFactor;
  return Math.round(Math.max(60, Math.min(480, estimated)));
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
 * Maps elapsed song time (seconds) to a target scrollTop using calibrated
 * per-section start times and live DOM section offsets on the current device.
 */
export function interpolateMarkedScroll(
  elapsedSec: number,
  marks: number[],
  sectionTops: number[],
  maxScroll: number,
  totalDurationSec: number
): number {
  if (maxScroll <= 0 || marks.length < 2 || sectionTops.length < 2) return 0;
  const count = Math.min(marks.length, sectionTops.length);
  const clampedTops = sectionTops.slice(0, count).map((t) => Math.max(0, Math.min(maxScroll, t)));

  if (elapsedSec <= marks[0]) return clampedTops[0];

  for (let i = 0; i < count - 1; i++) {
    const t0 = marks[i];
    const t1 = marks[i + 1];
    if (elapsedSec <= t1) {
      const span = Math.max(0.1, t1 - t0);
      const frac = Math.max(0, Math.min(1, (elapsedSec - t0) / span));
      return clampedTops[i] + (clampedTops[i + 1] - clampedTops[i]) * frac;
    }
  }

  // Final section tail: glide from last marked section top to maxScroll
  const lastIdx = count - 1;
  const lastMark = marks[lastIdx];
  const avgSecPerSection = lastIdx > 0 ? Math.max(8, lastMark / lastIdx) : 20;
  const tailDur = Math.max(10, totalDurationSec - lastMark > 6 ? totalDurationSec - lastMark : avgSecPerSection);
  const tailFrac = Math.max(0, Math.min(1, (elapsedSec - lastMark) / tailDur));
  return clampedTops[lastIdx] + (maxScroll - clampedTops[lastIdx]) * tailFrac;
}

/**
 * Inverse of `interpolateMarkedScroll`: when the user manually scrolls to a
 * new scrollTop, finds the matching elapsedSec so calibrated scrolling resumes
 * smoothly from that exact spot instead of jumping back.
 */
export function scrollTopToMarkedElapsed(
  scrollTop: number,
  marks: number[],
  sectionTops: number[],
  maxScroll: number,
  totalDurationSec: number
): number {
  if (maxScroll <= 0 || marks.length < 2 || sectionTops.length < 2) return 0;
  const count = Math.min(marks.length, sectionTops.length);
  const clampedTops = sectionTops.slice(0, count).map((t) => Math.max(0, Math.min(maxScroll, t)));
  const y = Math.max(0, Math.min(maxScroll, scrollTop));

  if (y <= clampedTops[0]) return marks[0];

  for (let i = 0; i < count - 1; i++) {
    const y0 = clampedTops[i];
    const y1 = clampedTops[i + 1];
    if (y <= y1) {
      const dy = y1 - y0;
      const frac = dy > 0.5 ? (y - y0) / dy : 0;
      return marks[i] + (marks[i + 1] - marks[i]) * Math.max(0, Math.min(1, frac));
    }
  }

  const lastIdx = count - 1;
  const lastMark = marks[lastIdx];
  const lastTop = clampedTops[lastIdx];
  const avgSecPerSection = lastIdx > 0 ? Math.max(8, lastMark / lastIdx) : 20;
  const tailDur = Math.max(10, totalDurationSec - lastMark > 6 ? totalDurationSec - lastMark : avgSecPerSection);
  const remY = maxScroll - lastTop;
  const frac = remY > 0.5 ? (y - lastTop) / remY : 1;
  return lastMark + tailDur * Math.max(0, Math.min(1, frac));
}

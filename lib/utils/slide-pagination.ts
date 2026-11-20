import type { Section } from '@/lib/types/song';
import type { DisplayMode } from '@/lib/stores/display-store';
import { isInstrumentalSection, lineHasLyrics, parseLine } from './music';

export interface SlideSectionInput {
  sectionIdx: number;
  type: Section['type'];
  label: string;
  /** Filtered lines actually rendered in the active displayMode. */
  lines: string[];
  /** Original 0-based index of each filtered line inside `ParsedSong.sections[sectionIdx].lines`. */
  origLineIndices: number[];
  instrumentalOnly: boolean;
}

export interface SlideSectionMetrics {
  /** Pure card height (px) without trailing margin between cards. */
  fullHeight: number;
  /** Fixed vertical chrome (px) of a section card (padding + header pill) excluding line items and inter-card gap. */
  chromeHeight: number;
  /** Measured height (px) of each line item in `lines` including vertical gap between lines. */
  lineHeights: number[];
}

export interface SlideChunk {
  sectionIdx: number;
  type: Section['type'];
  label: string;
  continuation: boolean;
  lines: string[];
  /** Original 0-based index in `ParsedSong.sections[sectionIdx].lines` for each line in `lines`. */
  origLineIndices: number[];
  instrumentalOnly: boolean;
  /** Index of the first line of this chunk within the filtered section lines. */
  startLineIdx: number;
}

export interface SlidePage {
  columns: SlideChunk[][];
  /** Measured natural pixel height of each column in `columns` (used for auto-fit utilization metrics). */
  columnHeights: number[];
  anchorSectionIdx: number;
  anchorLineIdx: number;
}

export interface SlideFillStats {
  pageCount: number;
  maxColFill: number;
  avgColFill: number;
  lastSlideFill: number;
  /** Fraction of total deck capacity filled across all columns (`sum(colH) / (pageCount * cols * budget)`). */
  totalCapacityFill: number;
  /** Last slide's total content as a fraction of a full slide (`sum(lastColH) / (cols * budget)`). */
  lastSlideTotalFill: number;
}

/**
 * Filters a song's sections down to the exact visible sections & lines for the
 * chosen reading mode (`both`, `chords-only`, `lyrics-only`) while preserving
 * each line's original index so slide annotations remain glued across mode switches.
 */
export function prepareSlideSections(
  sections: Section[],
  displayMode: DisplayMode
): SlideSectionInput[] {
  const prepared: SlideSectionInput[] = [];

  for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
    const sec = sections[sectionIdx];
    if (displayMode === 'lyrics-only') {
      if (isInstrumentalSection(sec.lines)) {
        prepared.push({
          sectionIdx,
          type: sec.type,
          label: sec.label,
          lines: [],
          origLineIndices: [],
          instrumentalOnly: true,
        });
        continue;
      }
      const pairs: Array<{ text: string; origIdx: number }> = [];
      for (let li = 0; li < sec.lines.length; li++) {
        const line = sec.lines[li];
        if (line.trim() === '' || lineHasLyrics(line)) {
          pairs.push({ text: line, origIdx: li });
        }
      }
      while (pairs.length > 0 && pairs[0].text.trim() === '') pairs.shift();
      while (pairs.length > 0 && pairs[pairs.length - 1].text.trim() === '') pairs.pop();
      if (pairs.length === 0) continue;
      prepared.push({
        sectionIdx,
        type: sec.type,
        label: sec.label,
        lines: pairs.map((p) => p.text),
        origLineIndices: pairs.map((p) => p.origIdx),
        instrumentalOnly: false,
      });
      continue;
    }

    if (displayMode === 'chords-only') {
      const pairs: Array<{ text: string; origIdx: number }> = [];
      for (let li = 0; li < sec.lines.length; li++) {
        const line = sec.lines[li];
        if (parseLine(line).some((seg) => Boolean(seg.chord))) {
          pairs.push({ text: line, origIdx: li });
        }
      }
      if (pairs.length === 0) continue;
      prepared.push({
        sectionIdx,
        type: sec.type,
        label: sec.label,
        lines: pairs.map((p) => p.text),
        origLineIndices: pairs.map((p) => p.origIdx),
        instrumentalOnly: false,
      });
      continue;
    }

    const pairs = sec.lines.map((text, origIdx) => ({ text, origIdx }));
    while (pairs.length > 0 && pairs[0].text.trim() === '') pairs.shift();
    while (pairs.length > 0 && pairs[pairs.length - 1].text.trim() === '') pairs.pop();
    if (pairs.length === 0) continue;
    prepared.push({
      sectionIdx,
      type: sec.type,
      label: sec.label,
      lines: pairs.map((p) => p.text),
      origLineIndices: pairs.map((p) => p.origIdx),
      instrumentalOnly: false,
    });
  }

  return prepared;
}

interface InternalChunk {
  chunk: SlideChunk;
  height: number;
  chromeHeight: number;
  lineHeights: number[];
}

function measureColHeight(items: InternalChunk[], cardGap: number): number {
  if (items.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (i > 0) total += cardGap;
    total += items[i].height;
  }
  return total;
}

function countNonEmpty(lines: string[], start = 0, end = lines.length): number {
  let count = 0;
  for (let i = start; i < end; i++) {
    if (lines[i] && lines[i].trim() !== '') count++;
  }
  return count;
}

function sumHeights(lineHeights: number[], start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += lineHeights[i] ?? 32;
  }
  return sum;
}

/**
 * Creates a trimmed sub-chunk `[start, end)` from an existing `InternalChunk`,
 * stripping leading/trailing blank stanza spacers so split cards never start or
 * end with an empty gap while keeping `origLineIndices` exact.
 */
function sliceInternalChunk(
  item: InternalChunk,
  start: number,
  end: number,
  isContinuation: boolean
): InternalChunk | null {
  let s = start;
  let e = end;
  while (s < e && item.chunk.lines[s]?.trim() === '') s++;
  while (e > s && item.chunk.lines[e - 1]?.trim() === '') e--;
  if (s >= e) return null;

  const lines = item.chunk.lines.slice(s, e);
  const origLineIndices = item.chunk.origLineIndices.slice(s, e);
  const lineHeights = item.lineHeights.slice(s, e);
  const height = item.chromeHeight + sumHeights(lineHeights, 0, lineHeights.length);

  return {
    chunk: {
      ...item.chunk,
      continuation: isContinuation || item.chunk.continuation,
      lines,
      origLineIndices,
      startLineIdx: item.chunk.startLineIdx + s,
    },
    height,
    chromeHeight: item.chromeHeight,
    lineHeights,
  };
}

/**
 * Merges adjacent chunks belonging to the exact same song section back into a
 * contiguous block before rebalancing across columns or adjacent pages.
 */
function mergeAdjacentSectionChunks(items: InternalChunk[]): InternalChunk[] {
  const merged: InternalChunk[] = [];
  for (const item of items) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      !prev.chunk.instrumentalOnly &&
      !item.chunk.instrumentalOnly &&
      prev.chunk.sectionIdx === item.chunk.sectionIdx
    ) {
      const lines = [...prev.chunk.lines, ...item.chunk.lines];
      const origLineIndices = [...prev.chunk.origLineIndices, ...item.chunk.origLineIndices];
      const lineHeights = [...prev.lineHeights, ...item.lineHeights];
      merged[merged.length - 1] = {
        chunk: {
          ...prev.chunk,
          lines,
          origLineIndices,
        },
        height: prev.chromeHeight + sumHeights(lineHeights, 0, lineHeights.length),
        chromeHeight: prev.chromeHeight,
        lineHeights,
      };
    } else {
      merged.push(item);
    }
  }
  return merged;
}

function isSubstantialLineRange(
  lines: string[],
  lineHeights: number[],
  start: number,
  end: number,
  budget: number
): boolean {
  const nonEmpty = countNonEmpty(lines, start, end);
  if (nonEmpty >= 2) return true;
  if (nonEmpty === 1) {
    const h = sumHeights(lineHeights, start, end);
    // A single wrapped multi-row lyric/chord line occupying >= 17% of short/narrow stage height is substantial
    return h >= Math.max(50, budget * 0.17);
  }
  return false;
}

/**
 * Finds the most balanced split of an ordered list of chunks into `[leftCol, rightCol]`
 * within `budget`, preferring clean whole-card breaks and blank-line stanza breaks
 * before falling back to mid-section line splits.
 */
function balanceItemsIntoTwoCols(
  rawItems: InternalChunk[],
  budget: number,
  cardGap: number,
  opts?: { allowSplit?: boolean; minLeftRatio?: number; minRightRatio?: number }
): { left: InternalChunk[]; right: InternalChunk[]; leftH: number; rightH: number } | null {
  const items = mergeAdjacentSectionChunks(rawItems);
  if (items.length === 0) return null;

  const allowSplit = opts?.allowSplit ?? true;
  const minLeftRatio = opts?.minLeftRatio ?? 0;
  const minRightRatio = opts?.minRightRatio ?? 0;

  let best: {
    left: InternalChunk[];
    right: InternalChunk[];
    leftH: number;
    rightH: number;
    score: number;
  } | null = null;

  // 1. Evaluate every whole-card split boundary (0 split cards!)
  for (let k = 1; k < items.length; k++) {
    const left = items.slice(0, k);
    const right = items.slice(k);
    const leftH = measureColHeight(left, cardGap);
    const rightH = measureColHeight(right, cardGap);
    if (leftH > budget || rightH > budget) continue;
    if (leftH / budget < minLeftRatio || rightH / budget < minRightRatio) continue;
    const score = Math.abs(leftH - rightH) / budget;
    if (!best || score < best.score) {
      best = { left, right, leftH, rightH, score };
    }
  }

  // If a whole-card break is already cleanly balanced (within 22% and neither side is a tiny stub), keep it intact!
  if (
    best &&
    best.score <= 0.22 &&
    Math.min(best.leftH, best.rightH) >= 0.34 * Math.max(best.leftH, best.rightH)
  ) {
    return { left: best.left, right: best.right, leftH: best.leftH, rightH: best.rightH };
  }

  if (!allowSplit) {
    return best ? { left: best.left, right: best.right, leftH: best.leftH, rightH: best.rightH } : null;
  }

  // 2. Evaluate splitting one multi-line section across the boundary (preferring blank-line stanza breaks)
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (item.chunk.instrumentalOnly) continue;
    const totalNonEmpty = countNonEmpty(item.chunk.lines);
    if (totalNonEmpty < 2) continue;

    const prefix = items.slice(0, idx);
    const suffix = items.slice(idx + 1);
    const prefixH = measureColHeight(prefix, cardGap);
    const suffixH = measureColHeight(suffix, cardGap);

    for (let cut = 1; cut < item.chunk.lines.length; cut++) {
      // Skip cutting inside a blank line; cut right after the blank line instead
      if (item.chunk.lines[cut]?.trim() === '') continue;
      const isStanzaBreak = item.chunk.lines[cut - 1]?.trim() === '';
      if (
        !isSubstantialLineRange(item.chunk.lines, item.lineHeights, 0, cut, budget) ||
        !isSubstantialLineRange(item.chunk.lines, item.lineHeights, cut, item.chunk.lines.length, budget)
      ) {
        continue;
      }

      const leftSlice = sliceInternalChunk(item, 0, cut, false);
      const rightSlice = sliceInternalChunk(item, cut, item.chunk.lines.length, true);
      if (!leftSlice || !rightSlice) continue;

      const leftH = prefixH + (prefix.length > 0 ? cardGap : 0) + leftSlice.height;
      const rightH = rightSlice.height + (suffix.length > 0 ? cardGap : 0) + suffixH;
      if (leftH > budget || rightH > budget) continue;
      if (leftH / budget < minLeftRatio || rightH / budget < minRightRatio) continue;

      // Small preference for keeping cards intact or cutting at a musical stanza break
      const splitPenalty = isStanzaBreak ? 0.03 : 0.08;
      const score = Math.abs(leftH - rightH) / budget + splitPenalty;
      if (!best || score < best.score) {
        best = {
          left: [...prefix, leftSlice],
          right: [rightSlice, ...suffix],
          leftH,
          rightH,
          score,
        };
      }
    }
  }

  return best ? { left: best.left, right: best.right, leftH: best.leftH, rightH: best.rightH } : null;
}

/**
 * Checks whether a substantial prefix of `sec` fits inside `availH`
 * while leaving a substantial continuation (no 1-line unwrapped stubs).
 */
function canSplitSectionCleanlyIntoSpace(
  sec: SlideSectionInput,
  m: SlideSectionMetrics,
  availH: number,
  budget: number
): boolean {
  const totalNonEmpty = countNonEmpty(sec.lines);
  if (totalNonEmpty < 2) return false;

  let h = m.chromeHeight;
  for (let idx = 0; idx < sec.lines.length - 1; idx++) {
    const lh = m.lineHeights[idx] ?? 32;
    if (h + lh > availH) break;
    h += lh;
    if (
      isSubstantialLineRange(sec.lines, m.lineHeights, 0, idx + 1, budget) &&
      isSubstantialLineRange(sec.lines, m.lineHeights, idx + 1, sec.lines.length, budget)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Rebalances all 4 columns of the last two 2-column spreads `[c0, c1]` and `[c2, c3]`
 * when the final spread is sparse while the penultimate spread is heavy, keeping every
 * column <= `budget` and minimizing imbalance across both pages.
 */
function rebalanceLastTwoSpreads(
  rawItems: InternalChunk[],
  budget: number,
  cardGap: number
): {
  penL: InternalChunk[];
  penR: InternalChunk[];
  finL: InternalChunk[];
  finR: InternalChunk[];
  minFinalH: number;
} | null {
  const items = mergeAdjacentSectionChunks(rawItems);
  if (items.length === 0) return null;

  interface BestFourCol {
    penL: InternalChunk[];
    penR: InternalChunk[];
    finL: InternalChunk[];
    finR: InternalChunk[];
    minFinalH: number;
    score: number;
  }

  let best: BestFourCol | null = null;

  const evaluateSplit = (
    penItems: InternalChunk[],
    finItems: InternalChunk[],
    splitPenalty: number
  ): BestFourCol | null => {
    if (penItems.length === 0 || finItems.length === 0) return null;
    const penTotal = measureColHeight(penItems, cardGap);
    const finTotal = measureColHeight(finItems, cardGap);
    // Quick upper-bound reject before calling 2-col balancers
    if (penTotal > budget * 2.15 || finTotal > budget * 2.15) return null;
    if (finTotal < budget * 0.68) return null;

    const penBal = balanceItemsIntoTwoCols(penItems, budget, cardGap);
    if (!penBal) return null;
    const finBal = balanceItemsIntoTwoCols(finItems, budget, cardGap);
    if (!finBal) return null;

    const penAvg = (penBal.leftH + penBal.rightH) / (2 * budget);
    const finAvg = (finBal.leftH + finBal.rightH) / (2 * budget);
    // Keep penultimate page at least as substantial as final page (natural book flow)
    if (penAvg < 0.48 || finAvg > penAvg + 0.14) return null;

    const penDiff = Math.abs(penBal.leftH - penBal.rightH) / budget;
    const finDiff = Math.abs(finBal.leftH - finBal.rightH) / budget;
    const pageGap = Math.abs(penAvg - finAvg);
    const minFinalH = Math.min(finBal.leftH, finBal.rightH);
    const score = penDiff * 0.9 + finDiff * 0.9 + pageGap * 0.8 - (minFinalH / budget) * 0.55 + splitPenalty;
    return {
      penL: penBal.left,
      penR: penBal.right,
      finL: finBal.left,
      finR: finBal.right,
      minFinalH,
      score,
    };
  };

  // 1. Whole-card boundaries between penultimate spread and final spread
  for (let k = 1; k < items.length; k++) {
    const cand = evaluateSplit(items.slice(0, k), items.slice(k), 0);
    if (cand && (!best || cand.score < best.score)) best = cand;
  }

  // 2. Section-split boundaries (preferring blank-line stanza breaks)
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (item.chunk.instrumentalOnly || countNonEmpty(item.chunk.lines) < 4) continue;
    const prefix = items.slice(0, idx);
    const suffix = items.slice(idx + 1);
    for (let cut = 1; cut < item.chunk.lines.length; cut++) {
      if (item.chunk.lines[cut]?.trim() === '') continue;
      if (
        !isSubstantialLineRange(item.chunk.lines, item.lineHeights, 0, cut, budget) ||
        !isSubstantialLineRange(item.chunk.lines, item.lineHeights, cut, item.chunk.lines.length, budget)
      ) {
        continue;
      }
      const leftSlice = sliceInternalChunk(item, 0, cut, false);
      const rightSlice = sliceInternalChunk(item, cut, item.chunk.lines.length, true);
      if (!leftSlice || !rightSlice) continue;
      const isStanza = item.chunk.lines[cut - 1]?.trim() === '';
      const cand = evaluateSplit([...prefix, leftSlice], [rightSlice, ...suffix], isStanza ? 0.04 : 0.10);
      if (cand && (!best || cand.score < best.score)) best = cand;
    }
  }

  return best
    ? {
        penL: best.penL,
        penR: best.penR,
        finL: best.finL,
        finR: best.finR,
        minFinalH: best.minFinalH,
      }
    : null;
}

/**
 * Packs measured song sections into zero-overflow columns and balanced multi-column slides.
 * Rules:
 * 1. Charge `cardGap` ONLY between stacked cards (never after the last card of a column).
 * 2. Keep whole sections together when the current column is already >= 48% full; when a column
 *    is sparse (< 48% full, e.g. a 1-2 line Intro/Interlude) and the next section won't fit whole
 *    below it, split cleanly (preferring stanza breaks) so no slide sits 85% empty.
 * 3. Never orphan a header with 0 lines or a 1-line stub; strip blank spacers at split edges.
 * 4. Rebalance lopsided 2-column spreads (both mid-deck and final) across both columns.
 * 5. Pull content from the penultimate column/page into a sparse trailing final page when
 *    needed so the song never ends with a lone 1-2 line stub slide.
 */
export function packSectionsIntoSlides(
  sections: SlideSectionInput[],
  metrics: SlideSectionMetrics[],
  columnHeight: number,
  columnsPerSlide: 1 | 2,
  cardGap = 12
): SlidePage[] {
  if (sections.length === 0) {
    return [{ columns: [[]], columnHeights: [0], anchorSectionIdx: 0, anchorLineIdx: 0 }];
  }

  const budget = Math.max(120, Math.floor(columnHeight));
  const columns: InternalChunk[][] = [];
  let curCol: InternalChunk[] = [];
  let usedH = 0;

  const gapIfNotEmpty = () => (curCol.length > 0 ? cardGap : 0);

  const flushColumn = () => {
    if (curCol.length > 0) {
      columns.push(curCol);
      curCol = [];
      usedH = 0;
    }
  };

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const m = metrics[i];
    if (!m) continue;

    // Instrumental-only pill block (atomic)
    if (sec.instrumentalOnly || sec.lines.length === 0) {
      if (curCol.length > 0 && usedH + cardGap + m.fullHeight > budget) {
        flushColumn();
      }
      usedH += gapIfNotEmpty() + m.fullHeight;
      curCol.push({
        chunk: {
          sectionIdx: sec.sectionIdx,
          type: sec.type,
          label: sec.label,
          continuation: false,
          lines: [],
          origLineIndices: [],
          instrumentalOnly: true,
          startLineIdx: 0,
        },
        height: m.fullHeight,
        chromeHeight: m.fullHeight,
        lineHeights: [],
      });
      continue;
    }

    // Rule 1: Fits whole in current column
    if (usedH + gapIfNotEmpty() + m.fullHeight <= budget) {
      usedH += gapIfNotEmpty() + m.fullHeight;
      curCol.push({
        chunk: {
          sectionIdx: sec.sectionIdx,
          type: sec.type,
          label: sec.label,
          continuation: false,
          lines: sec.lines,
          origLineIndices: sec.origLineIndices,
          instrumentalOnly: false,
          startLineIdx: 0,
        },
        height: m.fullHeight,
        chromeHeight: m.chromeHeight,
        lineHeights: m.lineHeights,
      });
      continue;
    }

    // Check if splitting into the current sparse column avoids leaving a lonely Intro/Interlude slide
    const curFill = usedH / budget;
    const availH = budget - usedH - cardGap;
    const sparseColThreshold = columnsPerSlide === 1 ? 0.54 : 0.46;
    const shouldFillSparseCol =
      curCol.length > 0 &&
      curFill < sparseColThreshold &&
      canSplitSectionCleanlyIntoSpace(sec, m, availH, budget);

    // Rule 2: Fits whole in a fresh column -> keep section intact unless filling a sparse column
    if (curCol.length > 0 && m.fullHeight <= budget && !shouldFillSparseCol) {
      flushColumn();
      usedH = m.fullHeight;
      curCol.push({
        chunk: {
          sectionIdx: sec.sectionIdx,
          type: sec.type,
          label: sec.label,
          continuation: false,
          lines: sec.lines,
          origLineIndices: sec.origLineIndices,
          instrumentalOnly: false,
          startLineIdx: 0,
        },
        height: m.fullHeight,
        chromeHeight: m.chromeHeight,
        lineHeights: m.lineHeights,
      });
      continue;
    }

    // Rule 3: Split cleanly between lines (preferring stanza boundaries & avoiding 1-line orphans)
    if (curCol.length > 0 && !canSplitSectionCleanlyIntoSpace(sec, m, availH, budget)) {
      // Allow starting in current column only if section is taller than a full budget AND >= 2 lines fit
      const minStart =
        m.chromeHeight +
        (m.lineHeights[0] ?? 32) +
        (sec.lines.length >= 2 ? (m.lineHeights[1] ?? 0) : 0);
      if (usedH + cardGap + minStart > budget) {
        flushColumn();
      }
    }

    let cursor = 0;
    while (cursor < sec.lines.length) {
      // Skip leading blank stanza spacers on continuation chunks
      while (cursor < sec.lines.length && sec.lines[cursor].trim() === '') {
        cursor++;
      }
      if (cursor >= sec.lines.length) break;

      const leadingGap = gapIfNotEmpty();
      let chunkH = m.chromeHeight;
      let end = cursor;

      while (end < sec.lines.length) {
        const lh = m.lineHeights[end] ?? 32;
        if (end > cursor && usedH + leadingGap + chunkH + lh > budget) {
          break;
        }
        chunkH += lh;
        end++;
        if (curCol.length > 0 && usedH + leadingGap + chunkH > budget) {
          end = cursor;
          break;
        }
      }

      if (end === cursor) {
        if (curCol.length > 0) {
          flushColumn();
          continue;
        }
        end = cursor + 1;
        chunkH = m.chromeHeight + (m.lineHeights[cursor] ?? 32);
      }

      // If this split doesn't finish the section, refine the cut point cleanly
      if (end < sec.lines.length) {
        const remNonEmpty = countNonEmpty(sec.lines, end, sec.lines.length);
        const curNonEmpty = countNonEmpty(sec.lines, cursor, end);

        // Avoid leaving a lone 1-line trailing stub when we have >= 3 lines in current chunk
        if (remNonEmpty === 1 && curNonEmpty >= 3) {
          let back = end - 1;
          while (back > cursor && sec.lines[back].trim() === '') back--;
          if (back > cursor) {
            end = back;
          }
        }

        // Prefer cutting at a blank-line stanza boundary when column fill stays strong
        const minStanzaFill = curCol.length > 0 ? 0.56 : 0.66;
        for (let b = end - 1; b >= cursor + 2; b--) {
          if (sec.lines[b].trim() === '') {
            const leftNonEmpty = countNonEmpty(sec.lines, cursor, b);
            const rightNonEmpty = countNonEmpty(sec.lines, b + 1, sec.lines.length);
            if (leftNonEmpty >= 2 && rightNonEmpty >= 2) {
              const stanzaChunkH = m.chromeHeight + sumHeights(m.lineHeights, cursor, b);
              if (usedH + leadingGap + stanzaChunkH >= budget * minStanzaFill) {
                end = b;
                break;
              }
            }
          }
        }
      }

      // Trim trailing blank spacers from this chunk so bottom padding stays uniform
      let trimmedEnd = end;
      while (trimmedEnd > cursor && sec.lines[trimmedEnd - 1].trim() === '') {
        trimmedEnd--;
      }
      if (trimmedEnd === cursor) {
        trimmedEnd = end;
      }

      const finalLineHeights = m.lineHeights.slice(cursor, trimmedEnd);
      const finalChunkH = m.chromeHeight + sumHeights(finalLineHeights, 0, finalLineHeights.length);

      usedH += leadingGap + finalChunkH;
      curCol.push({
        chunk: {
          sectionIdx: sec.sectionIdx,
          type: sec.type,
          label: sec.label,
          continuation: cursor > 0,
          lines: sec.lines.slice(cursor, trimmedEnd),
          origLineIndices: sec.origLineIndices.slice(cursor, trimmedEnd),
          instrumentalOnly: false,
          startLineIdx: cursor,
        },
        height: finalChunkH,
        chromeHeight: m.chromeHeight,
        lineHeights: finalLineHeights,
      });

      cursor = end;
      while (cursor < sec.lines.length && sec.lines[cursor].trim() === '') {
        cursor++;
      }

      if (cursor < sec.lines.length) {
        flushColumn();
      }
    }
  }

  flushColumn();

  if (columns.length === 0) {
    return [{ columns: [[]], columnHeights: [0], anchorSectionIdx: 0, anchorLineIdx: 0 }];
  }

  // Pass A: Rebalance lopsided non-last 2-column spreads (e.g. sparse Left vs packed Right)
  if (columnsPerSlide === 2 && columns.length >= 2) {
    const lastSpreadStart = columns.length % 2 === 1 ? columns.length - 1 : columns.length - 2;
    for (let c = 0; c < lastSpreadStart; c += 2) {
      const left = columns[c];
      const right = columns[c + 1];
      const lh = measureColHeight(left, cardGap);
      const rh = measureColHeight(right, cardGap);
      const curDiff = Math.abs(lh - rh) / budget;
      if ((lh / budget < 0.42 && rh / budget > 0.58) || curDiff > 0.28) {
        const balanced = balanceItemsIntoTwoCols([...left, ...right], budget, cardGap);
        if (balanced) {
          const nextDiff = Math.abs(balanced.leftH - balanced.rightH) / budget;
          if (nextDiff + 0.10 < curDiff) {
            columns[c] = balanced.left;
            columns[c + 1] = balanced.right;
          }
        }
      }
    }
  }

  // Pass B: Eliminate lonely trailing last pages by borrowing cleanly from the penultimate page/column
  if (columnsPerSlide === 1 && columns.length >= 2) {
    const prev = columns[columns.length - 2];
    const last = columns[columns.length - 1];
    const prevH = measureColHeight(prev, cardGap);
    const lastH = measureColHeight(last, cardGap);
    if (lastH / budget < 0.38 && prevH / budget > 0.52) {
      const balanced = balanceItemsIntoTwoCols([...prev, ...last], budget, cardGap, {
        minLeftRatio: 0.42,
        minRightRatio: 0.36,
      });
      if (balanced && balanced.rightH > lastH + budget * 0.08) {
        columns[columns.length - 2] = balanced.left;
        columns[columns.length - 1] = balanced.right;
      }
    }
  } else if (columnsPerSlide === 2 && columns.length >= 3) {
    const isLoneLastCol = columns.length % 2 === 1;
    const prevRightIdx = isLoneLastCol ? columns.length - 2 : columns.length - 3;
    const prevLeftIdx = prevRightIdx - 1;
    const prevLeftH = prevLeftIdx >= 0 ? measureColHeight(columns[prevLeftIdx], cardGap) : budget;
    const prevRight = columns[prevRightIdx];
    const prevRightH = measureColHeight(prevRight, cardGap);

    const lastItems = isLoneLastCol
      ? columns[columns.length - 1]
      : [...columns[columns.length - 2], ...columns[columns.length - 1]];
    const lastTotalH = measureColHeight(lastItems, cardGap);

    // If the final 2-column spread has under 62% of ONE column total (i.e. < 31% of a 2-col spread!),
    // borrow trailing content from the penultimate right column so the final page feels balanced.
    if (lastTotalH < budget * 0.62 && prevRightH > budget * 0.56) {
      const combined = mergeAdjacentSectionChunks([...prevRight, ...lastItems]);
      // Try splitting combined into [newPrevRight, newFinalSpreadItems] where newFinalSpreadItems fits in 2 cols
      let bestBorrow: {
        newPrevRight: InternalChunk[];
        newFinalLeft: InternalChunk[];
        newFinalRight: InternalChunk[];
        score: number;
      } | null = null;

      // Candidate 1: move whole trailing cards from prevRight to the final spread
      for (let k = 1; k < combined.length; k++) {
        const candPrevR = combined.slice(0, k);
        const candFinal = combined.slice(k);
        const candPrevRH = measureColHeight(candPrevR, cardGap);
        if (candPrevRH > budget || candPrevRH < budget * 0.44) continue;
        // Keep penultimate spread itself visually balanced
        if (Math.abs(prevLeftH - candPrevRH) / budget > 0.38) continue;

        const balancedFinal = balanceItemsIntoTwoCols(candFinal, budget, cardGap);
        if (!balancedFinal) continue;
        const minFinal = Math.min(balancedFinal.leftH, balancedFinal.rightH);
        const diffFinal = Math.abs(balancedFinal.leftH - balancedFinal.rightH) / budget;
        const penDiff = Math.abs(prevLeftH - candPrevRH) / budget;
        const score = diffFinal + penDiff * 0.6 - (minFinal / budget) * 0.8;
        if (!bestBorrow || score < bestBorrow.score) {
          bestBorrow = {
            newPrevRight: candPrevR,
            newFinalLeft: balancedFinal.left,
            newFinalRight: balancedFinal.right,
            score,
          };
        }
      }

      // Candidate 2: if whole cards didn't work (e.g. penultimate right col is one giant Chorus),
      // split the last card of prevRight into the final spread
      if (!bestBorrow && prevRight.length >= 1) {
        const splitIdx = prevRight.length - 1;
        const targetItem = combined[splitIdx];
        if (targetItem && !targetItem.chunk.instrumentalOnly && countNonEmpty(targetItem.chunk.lines) >= 5) {
          const prefix = combined.slice(0, splitIdx);
          const suffix = combined.slice(splitIdx + 1);
          const prefixH = measureColHeight(prefix, cardGap);

          for (let cut = 2; cut < targetItem.chunk.lines.length - 1; cut++) {
            if (targetItem.chunk.lines[cut]?.trim() === '') continue;
            if (
              countNonEmpty(targetItem.chunk.lines, 0, cut) < 2 ||
              countNonEmpty(targetItem.chunk.lines, cut, targetItem.chunk.lines.length) < 2
            ) {
              continue;
            }
            const staySlice = sliceInternalChunk(targetItem, 0, cut, false);
            const moveSlice = sliceInternalChunk(targetItem, cut, targetItem.chunk.lines.length, true);
            if (!staySlice || !moveSlice) continue;

            const candPrevR = [...prefix, staySlice];
            const candPrevRH = prefixH + (prefix.length > 0 ? cardGap : 0) + staySlice.height;
            if (candPrevRH > budget || candPrevRH < budget * 0.46) continue;
            if (Math.abs(prevLeftH - candPrevRH) / budget > 0.36) continue;

            const candFinal = [moveSlice, ...suffix];
            const balancedFinal = balanceItemsIntoTwoCols(candFinal, budget, cardGap);
            if (!balancedFinal) continue;
            const minFinal = Math.min(balancedFinal.leftH, balancedFinal.rightH);
            const isStanza = targetItem.chunk.lines[cut - 1]?.trim() === '';
            const score =
              Math.abs(balancedFinal.leftH - balancedFinal.rightH) / budget +
              Math.abs(prevLeftH - candPrevRH) / budget * 0.6 -
              (minFinal / budget) * 0.8 +
              (isStanza ? 0.02 : 0.08);
            if (!bestBorrow || score < bestBorrow.score) {
              bestBorrow = {
                newPrevRight: candPrevR,
                newFinalLeft: balancedFinal.left,
                newFinalRight: balancedFinal.right,
                score,
              };
            }
          }
        }
      }

      if (bestBorrow) {
        columns[prevRightIdx] = bestBorrow.newPrevRight;
        if (isLoneLastCol) {
          columns.splice(columns.length - 1, 1, bestBorrow.newFinalLeft, bestBorrow.newFinalRight);
        } else {
          columns.splice(columns.length - 2, 2, bestBorrow.newFinalLeft, bestBorrow.newFinalRight);
        }
      }
    }

    // Pass B2: Full 4-column rebalance across the last 2 spreads when the final page is still sparse (< 42% per col)
    const nowLone = columns.length % 2 === 1;
    const penStart = nowLone ? columns.length - 3 : columns.length - 4;
    if (penStart >= 0) {
      const penL = columns[penStart];
      const penR = columns[penStart + 1];
      const finCols = nowLone ? [columns[penStart + 2]] : [columns[penStart + 2], columns[penStart + 3]];
      const penTotalH = measureColHeight(penL, cardGap) + measureColHeight(penR, cardGap);
      const finTotalH = finCols.reduce((a, col) => a + measureColHeight(col, cardGap), 0);
      const finMaxH = finCols.reduce((m, col) => Math.max(m, measureColHeight(col, cardGap)), 0);

      if ((nowLone || finMaxH < budget * 0.42 || finTotalH < budget * 0.80) && penTotalH > budget * 1.25) {
        const all4 = [...penL, ...penR, ...finCols.flat()];
        const rebal4 = rebalanceLastTwoSpreads(all4, budget, cardGap);
        if (rebal4 && rebal4.minFinalH > Math.min(finMaxH, budget * 0.34)) {
          columns.splice(
            penStart,
            nowLone ? 3 : 4,
            rebal4.penL,
            rebal4.penR,
            rebal4.finL,
            rebal4.finR
          );
        }
      }
    }
  }

  // Pass C: Balance the FINAL 2-column spread across BOTH columns (handles both lone column AND lopsided pair!)
  if (columnsPerSlide === 2) {
    if (columns.length % 2 === 1) {
      const lastCol = columns[columns.length - 1];
      const balanced = balanceItemsIntoTwoCols(lastCol, budget, cardGap);
      if (balanced) {
        columns.splice(columns.length - 1, 1, balanced.left, balanced.right);
      }
    } else if (columns.length >= 2) {
      const lastL = columns[columns.length - 2];
      const lastR = columns[columns.length - 1];
      const lh = measureColHeight(lastL, cardGap);
      const rh = measureColHeight(lastR, cardGap);
      const curDiff = Math.abs(lh - rh) / budget;
      if (curDiff > 0.20) {
        const balanced = balanceItemsIntoTwoCols([...lastL, ...lastR], budget, cardGap);
        if (balanced) {
          const nextDiff = Math.abs(balanced.leftH - balanced.rightH) / budget;
          if (nextDiff + 0.10 < curDiff) {
            columns.splice(columns.length - 2, 2, balanced.left, balanced.right);
          }
        }
      }
    }
  }

  const slides: SlidePage[] = [];
  for (let c = 0; c < columns.length; c += columnsPerSlide) {
    const pageInternalCols = columns.slice(c, c + columnsPerSlide);
    const pageCols = pageInternalCols.map((col) => col.map((item) => item.chunk));
    const colHeights = pageInternalCols.map((col) => measureColHeight(col, cardGap));
    const firstChunk = pageCols[0]?.[0];
    slides.push({
      columns: pageCols,
      columnHeights: colHeights,
      anchorSectionIdx: firstChunk?.sectionIdx ?? 0,
      anchorLineIdx: firstChunk?.startLineIdx ?? 0,
    });
  }

  return slides;
}

/**
 * Summarizes how well the packed slides fill the available column height budget
 * so SlideshowView can auto-fit typography without adding extra page turns.
 */
export function computeSlideFillStats(
  slides: SlidePage[],
  columnHeight: number,
  columnsPerSlide: 1 | 2 = 1
): SlideFillStats {
  const budget = Math.max(120, columnHeight);
  if (slides.length === 0) {
    return {
      pageCount: 0,
      maxColFill: 0,
      avgColFill: 0,
      lastSlideFill: 0,
      totalCapacityFill: 0,
      lastSlideTotalFill: 0,
    };
  }
  let maxColFill = 0;
  let sumFill = 0;
  let sumAllH = 0;
  let colCount = 0;
  for (const slide of slides) {
    for (const h of slide.columnHeights) {
      const ratio = h / budget;
      if (ratio > maxColFill) maxColFill = ratio;
      sumFill += ratio;
      sumAllH += h;
      colCount++;
    }
  }
  const last = slides[slides.length - 1];
  const lastMax = last.columnHeights.reduce((m, h) => Math.max(m, h), 0);
  const lastSum = last.columnHeights.reduce((a, h) => a + h, 0);
  const effectiveSlots = slides.length * columnsPerSlide;
  return {
    pageCount: slides.length,
    maxColFill,
    avgColFill: colCount > 0 ? sumFill / colCount : 0,
    lastSlideFill: lastMax / budget,
    totalCapacityFill: effectiveSlots > 0 ? sumAllH / (effectiveSlots * budget) : 0,
    lastSlideTotalFill: lastSum / (columnsPerSlide * budget),
  };
}

/**
 * Finds the slide index closest to a saved musical anchor `(sectionIdx, lineIdx)`
 * after font size, reading mode, or portrait/landscape orientation changes.
 */
export function findSlideIndexForAnchor(
  slides: SlidePage[],
  anchorSectionIdx: number,
  anchorLineIdx: number
): number {
  if (slides.length <= 1) return 0;

  let bestIdx = 0;
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    for (const col of slide.columns) {
      for (const chunk of col) {
        if (
          chunk.sectionIdx === anchorSectionIdx &&
          anchorLineIdx >= chunk.startLineIdx &&
          anchorLineIdx < chunk.startLineIdx + Math.max(1, chunk.lines.length)
        ) {
          return i;
        }
        if (
          chunk.sectionIdx < anchorSectionIdx ||
          (chunk.sectionIdx === anchorSectionIdx && chunk.startLineIdx <= anchorLineIdx)
        ) {
          bestIdx = i;
        }
      }
    }
  }
  return bestIdx;
}

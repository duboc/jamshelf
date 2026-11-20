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

/**
 * Packs measured song sections into zero-overflow columns and balanced multi-column slides.
 * Rules:
 * 1. Charge `cardGap` ONLY between stacked cards (never after the last card of a column).
 * 2. Keep whole sections together whenever a section fits in the current column or a fresh column.
 * 3. In 2-column landscape spreads, if the left column of a spread is under 36% full (e.g. a 2-line Intro)
 *    and the next section is tall (> 55% of column height) so it cannot fit whole below it, split cleanly
 *    across Left -> Right of the SAME visible spread.
 * 4. Balance any lone trailing column on the final 2-column spread across BOTH columns so the screen
 *    never sits half-empty on the last page.
 * 5. Never orphan a header with 0 lines or a 1-line stub; always guarantee forward progress.
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

    // Check if splitting into the left column of an active 2-col spread avoids an 80%-empty left column
    const isLeftColOfSpread = columnsPerSlide === 2 && columns.length % 2 === 0;
    const leftColSparse = isLeftColOfSpread && curCol.length > 0 && usedH / budget < 0.36;
    const isTallSection = m.fullHeight / budget > 0.55 && sec.lines.length >= 5;

    let canSplitIntoSameSpread = false;
    if (leftColSparse && isTallSection) {
      const threeLineH =
        m.chromeHeight +
        (m.lineHeights[0] ?? 32) +
        (m.lineHeights[1] ?? 32) +
        (m.lineHeights[2] ?? 32);
      if (usedH + cardGap + threeLineH <= budget) {
        canSplitIntoSameSpread = true;
      }
    }

    // Rule 2: Fits whole in a fresh column -> keep section intact unless same-spread sparse fill applies
    if (curCol.length > 0 && m.fullHeight <= budget && !canSplitIntoSameSpread) {
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

    // Rule 3: Split cleanly between lines
    const firstLineH = m.lineHeights[0] ?? 32;
    const secondLineH = m.lineHeights[1] ?? 0;
    const minStartChunkH =
      m.chromeHeight + firstLineH + (sec.lines.length >= 2 ? secondLineH : 0);

    if (curCol.length > 0 && usedH + cardGap + minStartChunkH > budget) {
      flushColumn();
    }

    let cursor = 0;
    while (cursor < sec.lines.length) {
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

      // Avoid leaving a lone 1-line orphan at the end of a long split when we can push 1 line forward
      const remaining = sec.lines.length - end;
      if (remaining === 1 && end - cursor >= 3) {
        end -= 1;
        chunkH -= m.lineHeights[end] ?? 0;
      }

      usedH += leadingGap + chunkH;
      curCol.push({
        chunk: {
          sectionIdx: sec.sectionIdx,
          type: sec.type,
          label: sec.label,
          continuation: cursor > 0,
          lines: sec.lines.slice(cursor, end),
          origLineIndices: sec.origLineIndices.slice(cursor, end),
          instrumentalOnly: false,
          startLineIdx: cursor,
        },
        height: chunkH,
        chromeHeight: m.chromeHeight,
        lineHeights: m.lineHeights.slice(cursor, end),
      });
      cursor = end;

      if (cursor < sec.lines.length) {
        flushColumn();
      }
    }
  }

  flushColumn();

  if (columns.length === 0) {
    return [{ columns: [[]], columnHeights: [0], anchorSectionIdx: 0, anchorLineIdx: 0 }];
  }

  // Rule 4: Balance a lone trailing column on a 2-column spread across BOTH columns
  if (columnsPerSlide === 2 && columns.length % 2 === 1) {
    const lastCol = columns[columns.length - 1];
    if (lastCol.length >= 2) {
      let bestSplit = 1;
      let bestDiff = Infinity;
      for (let k = 1; k < lastCol.length; k++) {
        const lh = measureColHeight(lastCol.slice(0, k), cardGap);
        const rh = measureColHeight(lastCol.slice(k), cardGap);
        const diff = Math.abs(lh - rh);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestSplit = k;
        }
      }
      columns.splice(columns.length - 1, 1, lastCol.slice(0, bestSplit), lastCol.slice(bestSplit));
    } else if (
      lastCol.length === 1 &&
      !lastCol[0].chunk.instrumentalOnly &&
      lastCol[0].chunk.lines.length >= 4
    ) {
      const item = lastCol[0];
      const mid = Math.ceil(item.chunk.lines.length / 2);
      const leftLinesH = item.lineHeights.slice(0, mid).reduce((a, b) => a + b, 0);
      const rightLinesH = item.lineHeights.slice(mid).reduce((a, b) => a + b, 0);
      const leftH = item.chromeHeight + leftLinesH;
      const rightH = item.chromeHeight + rightLinesH;
      if (leftH <= budget && rightH <= budget) {
        const leftItem: InternalChunk = {
          chunk: {
            ...item.chunk,
            lines: item.chunk.lines.slice(0, mid),
            origLineIndices: item.chunk.origLineIndices.slice(0, mid),
          },
          height: leftH,
          chromeHeight: item.chromeHeight,
          lineHeights: item.lineHeights.slice(0, mid),
        };
        const rightItem: InternalChunk = {
          chunk: {
            ...item.chunk,
            continuation: true,
            lines: item.chunk.lines.slice(mid),
            origLineIndices: item.chunk.origLineIndices.slice(mid),
            startLineIdx: item.chunk.startLineIdx + mid,
          },
          height: rightH,
          chromeHeight: item.chromeHeight,
          lineHeights: item.lineHeights.slice(mid),
        };
        columns.splice(columns.length - 1, 1, [leftItem], [rightItem]);
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
export function computeSlideFillStats(slides: SlidePage[], columnHeight: number): SlideFillStats {
  const budget = Math.max(120, columnHeight);
  if (slides.length === 0) {
    return { pageCount: 0, maxColFill: 0, avgColFill: 0, lastSlideFill: 0 };
  }
  let maxColFill = 0;
  let sumFill = 0;
  let colCount = 0;
  for (const slide of slides) {
    for (const h of slide.columnHeights) {
      const ratio = h / budget;
      if (ratio > maxColFill) maxColFill = ratio;
      sumFill += ratio;
      colCount++;
    }
  }
  const last = slides[slides.length - 1];
  const lastMax = last.columnHeights.reduce((m, h) => Math.max(m, h), 0);
  return {
    pageCount: slides.length,
    maxColFill,
    avgColFill: colCount > 0 ? sumFill / colCount : 0,
    lastSlideFill: lastMax / budget,
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

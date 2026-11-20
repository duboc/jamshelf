import type { Section } from '@/lib/types/song';
import type { DisplayMode } from '@/lib/stores/display-store';
import { isInstrumentalSection, lineHasLyrics, parseLine } from './music';

export interface SlideSectionInput {
  sectionIdx: number;
  type: Section['type'];
  label: string;
  /** Filtered lines actually rendered in the active displayMode. */
  lines: string[];
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
  instrumentalOnly: boolean;
  /** Index of the first line of this chunk within the filtered section lines. */
  startLineIdx: number;
}

export interface SlidePage {
  columns: SlideChunk[][];
  anchorSectionIdx: number;
  anchorLineIdx: number;
}

/**
 * Filters a song's sections down to the exact visible sections & lines for the
 * chosen reading mode (`both`, `chords-only`, `lyrics-only`) so pagination never
 * allocates vertical height for hidden lines or empty sections.
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
          instrumentalOnly: true,
        });
        continue;
      }
      const visibleLines = sec.lines.filter((line) => line.trim() === '' || lineHasLyrics(line));
      while (visibleLines.length > 0 && visibleLines[0].trim() === '') visibleLines.shift();
      while (visibleLines.length > 0 && visibleLines[visibleLines.length - 1].trim() === '') {
        visibleLines.pop();
      }
      if (visibleLines.length === 0) continue;
      prepared.push({
        sectionIdx,
        type: sec.type,
        label: sec.label,
        lines: visibleLines,
        instrumentalOnly: false,
      });
      continue;
    }

    if (displayMode === 'chords-only') {
      const chordLines = sec.lines.filter((line) =>
        parseLine(line).some((seg) => Boolean(seg.chord))
      );
      if (chordLines.length === 0) continue;
      prepared.push({
        sectionIdx,
        type: sec.type,
        label: sec.label,
        lines: chordLines,
        instrumentalOnly: false,
      });
      continue;
    }

    const trimmed = [...sec.lines];
    while (trimmed.length > 0 && trimmed[0].trim() === '') trimmed.shift();
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === '') trimmed.pop();
    if (trimmed.length === 0) continue;
    prepared.push({
      sectionIdx,
      type: sec.type,
      label: sec.label,
      lines: trimmed,
      instrumentalOnly: false,
    });
  }

  return prepared;
}

/**
 * Packs measured song sections into zero-overflow columns and multi-column slides.
 * Rules:
 * 1. Charge `cardGap` ONLY between stacked cards (never after the last card of a column).
 * 2. Keep whole sections together whenever a section fits in the current column or a fresh column.
 * 3. In 2-column landscape spreads, if the left column of a spread is under 36% full (e.g. a 2-line Intro)
 *    and the next section is tall (> 55% of column height) so it cannot fit whole below it, split cleanly
 *    across Left -> Right of the SAME visible spread (eliminates 80%-empty left columns and cuts page turns).
 * 4. Never orphan a header with 0 lines or a 1-line stub; always guarantee forward progress.
 */
export function packSectionsIntoSlides(
  sections: SlideSectionInput[],
  metrics: SlideSectionMetrics[],
  columnHeight: number,
  columnsPerSlide: 1 | 2,
  cardGap = 12
): SlidePage[] {
  if (sections.length === 0) {
    return [{ columns: [[]], anchorSectionIdx: 0, anchorLineIdx: 0 }];
  }

  const budget = Math.max(120, Math.floor(columnHeight));
  const columns: SlideChunk[][] = [];
  let curCol: SlideChunk[] = [];
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
        sectionIdx: sec.sectionIdx,
        type: sec.type,
        label: sec.label,
        continuation: false,
        lines: [],
        instrumentalOnly: true,
        startLineIdx: 0,
      });
      continue;
    }

    // Rule 1: Fits whole in current column
    if (usedH + gapIfNotEmpty() + m.fullHeight <= budget) {
      usedH += gapIfNotEmpty() + m.fullHeight;
      curCol.push({
        sectionIdx: sec.sectionIdx,
        type: sec.type,
        label: sec.label,
        continuation: false,
        lines: sec.lines,
        instrumentalOnly: false,
        startLineIdx: 0,
      });
      continue;
    }

    // Check if splitting into the left column of an active 2-col spread avoids an 80%-empty left column
    const isLeftColOfSpread = columnsPerSlide === 2 && columns.length % 2 === 0;
    const leftColSparse = isLeftColOfSpread && curCol.length > 0 && usedH / budget < 0.36;
    const isTallSection = m.fullHeight / budget > 0.55 && sec.lines.length >= 5;

    let canSplitIntoSameSpread = false;
    if (leftColSparse && isTallSection) {
      // Only split across the spread if at least 3 lines fit cleanly below the short intro
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
        sectionIdx: sec.sectionIdx,
        type: sec.type,
        label: sec.label,
        continuation: false,
        lines: sec.lines,
        instrumentalOnly: false,
        startLineIdx: 0,
      });
      continue;
    }

    // Rule 3: Split cleanly between lines (either taller than 1 column, or filling a sparse left spread column)
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
        sectionIdx: sec.sectionIdx,
        type: sec.type,
        label: sec.label,
        continuation: cursor > 0,
        lines: sec.lines.slice(cursor, end),
        instrumentalOnly: false,
        startLineIdx: cursor,
      });
      cursor = end;

      if (cursor < sec.lines.length) {
        flushColumn();
      }
    }
  }

  flushColumn();

  if (columns.length === 0) {
    return [{ columns: [[]], anchorSectionIdx: 0, anchorLineIdx: 0 }];
  }

  const slides: SlidePage[] = [];
  for (let c = 0; c < columns.length; c += columnsPerSlide) {
    const pageCols = columns.slice(c, c + columnsPerSlide);
    const firstChunk = pageCols[0]?.[0];
    slides.push({
      columns: pageCols,
      anchorSectionIdx: firstChunk?.sectionIdx ?? 0,
      anchorLineIdx: firstChunk?.startLineIdx ?? 0,
    });
  }

  return slides;
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

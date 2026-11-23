import { lineHasLyrics, parseLine } from './music';
import { inferSectionType } from './chordpro-parser';
import type { Section } from '@/lib/types/song';

type Segment = { chord: string | null; text: string };

/** Re-serialize parsed segments back to a raw ChordPro line string */
function segmentsToLine(segs: Segment[]): string {
  return segs.map((s) => (s.chord ? `[${s.chord}]${s.text}` : s.text)).join('');
}

interface PlacedChord {
  chord: string;
  pos: number; // character index in plain lyric text
  id: number;
}

function extractPlacedChords(line: string): { plainText: string; chords: PlacedChord[]; segIdxToId: Map<number, number> } {
  const segs = parseLine(line);
  let plainText = '';
  const chords: PlacedChord[] = [];
  const segIdxToId = new Map<number, number>();
  let nextId = 0;

  segs.forEach((seg, idx) => {
    if (seg.chord) {
      const id = nextId++;
      chords.push({ chord: seg.chord, pos: plainText.length, id });
      segIdxToId.set(idx, id);
    }
    plainText += seg.text;
  });

  return { plainText, chords, segIdxToId };
}

function rebuildLineFromPlaced(plainText: string, chords: PlacedChord[], trackedId: number): { line: string; nextSegIdx: number } {
  // Stable sort by lyric position while preserving relative order for chords at the same index
  const ordered = chords
    .map((c, order) => ({ ...c, order }))
    .sort((a, b) => a.pos - b.pos || a.order - b.order);

  let out = '';
  let cursor = 0;
  let trackedSegIdx = 0;
  const hasLeadingText = ordered.length > 0 && ordered[0].pos > 0;

  ordered.forEach((c, idx) => {
    if (c.pos > cursor) {
      out += plainText.slice(cursor, c.pos);
      cursor = c.pos;
    }
    out += `[${c.chord}]`;
    if (c.id === trackedId) {
      trackedSegIdx = idx + (hasLeadingText ? 1 : 0);
    }
  });

  if (cursor < plainText.length) {
    out += plainText.slice(cursor);
  }

  return { line: out, nextSegIdx: trackedSegIdx };
}

/**
 * Safely move the chord at `segIdx` one lyric character left or right without
 * ever corrupting neighboring `[Chord]` tokens. Also returns the chord's new
 * segment index in `parseLine(nextLine)` so selection stays locked on it.
 */
export function moveChordWithIndex(
  line: string,
  segIdx: number,
  dir: 'left' | 'right'
): { line: string; nextSegIdx: number } {
  const segs = parseLine(line);
  if (segIdx < 0 || segIdx >= segs.length || !segs[segIdx].chord) {
    return { line, nextSegIdx: segIdx };
  }

  const { plainText, chords, segIdxToId } = extractPlacedChords(line);
  const targetId = segIdxToId.get(segIdx);
  if (targetId === undefined) return { line, nextSegIdx: segIdx };

  const targetIdx = chords.findIndex((c) => c.id === targetId);
  if (targetIdx === -1) return { line, nextSegIdx: segIdx };

  const target = chords[targetIdx];
  const updated = chords.map((c) => ({ ...c }));

  // On pure chord-only lines (e.g. "[Dmaj7] [Bsus2] [Gsus2]"), swap adjacent chords directly
  // with clean single-space separation instead of chewing through spaces one char at a time.
  if (!lineHasLyrics(line) && updated.length >= 2) {
    const swapWith = dir === 'left' ? targetIdx - 1 : targetIdx + 1;
    if (swapWith < 0 || swapWith >= updated.length) {
      return { line, nextSegIdx: segIdx };
    }
    const tmp = updated[swapWith];
    updated[swapWith] = updated[targetIdx];
    updated[targetIdx] = tmp;
    const nextLine = updated.map((c) => `[${c.chord}]`).join(' ');
    return { line: nextLine, nextSegIdx: swapWith };
  }

  if (dir === 'left') {
    if (targetIdx > 0 && updated[targetIdx - 1].pos === target.pos) {
      // Swap order with an immediately preceding chord at the exact same position first
      const prev = updated[targetIdx - 1];
      updated[targetIdx - 1] = updated[targetIdx];
      updated[targetIdx] = prev;
    } else if (target.pos > 0) {
      updated[targetIdx].pos = target.pos - 1;
    } else {
      return { line, nextSegIdx: segIdx };
    }
  } else {
    if (targetIdx < updated.length - 1 && updated[targetIdx + 1].pos === target.pos) {
      const next = updated[targetIdx + 1];
      updated[targetIdx + 1] = updated[targetIdx];
      updated[targetIdx] = next;
    } else if (target.pos < plainText.length) {
      updated[targetIdx].pos = target.pos + 1;
    } else {
      return { line, nextSegIdx: segIdx };
    }
  }

  return rebuildLineFromPlaced(plainText, updated, targetId);
}

/**
 * Move the chord at `segIdx` one lyric character left or right.
 */
export function moveChord(line: string, segIdx: number, dir: 'left' | 'right'): string {
  return moveChordWithIndex(line, segIdx, dir).line;
}

/**
 * Jump the chord at `segIdx` to the previous or next word start (or line start/end).
 * On chord-only lines, swaps cleanly with the adjacent chord.
 */
export function moveChordByWordWithIndex(
  line: string,
  segIdx: number,
  dir: 'left' | 'right'
): { line: string; nextSegIdx: number } {
  if (!lineHasLyrics(line)) {
    return moveChordWithIndex(line, segIdx, dir);
  }
  const segs = parseLine(line);
  if (segIdx < 0 || segIdx >= segs.length || !segs[segIdx].chord) {
    return { line, nextSegIdx: segIdx };
  }
  const { plainText, chords, segIdxToId } = extractPlacedChords(line);
  const targetId = segIdxToId.get(segIdx);
  if (targetId === undefined) return { line, nextSegIdx: segIdx };
  const targetIdx = chords.findIndex((c) => c.id === targetId);
  if (targetIdx === -1) return { line, nextSegIdx: segIdx };

  const stops: number[] = [0];
  for (let i = 0; i < plainText.length; i++) {
    if (!/\s/.test(plainText[i]) && (i === 0 || /\s/.test(plainText[i - 1]))) {
      if (stops[stops.length - 1] !== i) stops.push(i);
    }
  }
  if (stops[stops.length - 1] !== plainText.length) stops.push(plainText.length);

  const curPos = chords[targetIdx].pos;
  let nextPos = curPos;
  if (dir === 'right') {
    const found = stops.find((s) => s > curPos);
    if (found !== undefined) nextPos = found;
  } else {
    for (let i = stops.length - 1; i >= 0; i--) {
      if (stops[i] < curPos) {
        nextPos = stops[i];
        break;
      }
    }
  }
  if (nextPos === curPos) return { line, nextSegIdx: segIdx };

  const updated = chords.map((c, idx) => (idx === targetIdx ? { ...c, pos: nextPos } : { ...c }));
  return rebuildLineFromPlaced(plainText, updated, targetId);
}

/**
 * Reports whether the chord at `segIdx` can move left/right and whether the line is chord-only.
 */
export function getChordMoveBounds(
  line: string,
  segIdx: number
): { canMoveLeft: boolean; canMoveRight: boolean; isChordOnly: boolean } {
  const isChordOnly = !lineHasLyrics(line);
  const { plainText, chords, segIdxToId } = extractPlacedChords(line);
  const targetId = segIdxToId.get(segIdx);
  if (targetId === undefined) {
    return { canMoveLeft: false, canMoveRight: false, isChordOnly };
  }
  const targetIdx = chords.findIndex((c) => c.id === targetId);
  if (targetIdx === -1) {
    return { canMoveLeft: false, canMoveRight: false, isChordOnly };
  }
  if (isChordOnly) {
    return {
      canMoveLeft: targetIdx > 0,
      canMoveRight: targetIdx < chords.length - 1,
      isChordOnly: true,
    };
  }
  const target = chords[targetIdx];
  const canMoveLeft =
    target.pos > 0 || (targetIdx > 0 && chords[targetIdx - 1].pos === target.pos);
  const canMoveRight =
    target.pos < plainText.length ||
    (targetIdx < chords.length - 1 && chords[targetIdx + 1].pos === target.pos);
  return { canMoveLeft, canMoveRight, isChordOnly: false };
}

/**
 * Counts exact occurrences of `[chord]` across all sections.
 */
export function countChordOccurrences(sections: Section[], chord: string): number {
  let count = 0;
  for (const sec of sections) {
    for (const line of sec.lines) {
      for (const seg of parseLine(line)) {
        if (seg.chord === chord) count++;
      }
    }
  }
  return count;
}

/**
 * Replaces every `[fromChord]` occurrence across all sections with `[toChord]`.
 */
export function replaceAllChordsInSections(
  sections: Section[],
  fromChord: string,
  toChord: string
): { sections: Section[]; replacedCount: number } {
  let replacedCount = 0;
  const nextSections = sections.map((sec) => ({
    ...sec,
    lines: sec.lines.map((line) => {
      const segs = parseLine(line);
      let changed = false;
      const nextSegs = segs.map((seg) => {
        if (seg.chord === fromChord) {
          replacedCount++;
          changed = true;
          return { ...seg, chord: toChord };
        }
        return seg;
      });
      return changed ? segmentsToLine(nextSegs) : line;
    }),
  }));
  return { sections: nextSections, replacedCount };
}

/**
 * Finds the previous or next chord coordinate across the entire song in reading order.
 */
export function findAdjacentChord(
  sections: Section[],
  current: { sectionIdx: number; lineIdx: number; segIdx: number },
  dir: 'prev' | 'next'
): { sectionIdx: number; lineIdx: number; segIdx: number } | null {
  const all: { sectionIdx: number; lineIdx: number; segIdx: number }[] = [];
  sections.forEach((sec, sectionIdx) => {
    sec.lines.forEach((line, lineIdx) => {
      parseLine(line).forEach((seg, segIdx) => {
        if (seg.chord) all.push({ sectionIdx, lineIdx, segIdx });
      });
    });
  });
  const idx = all.findIndex(
    (c) =>
      c.sectionIdx === current.sectionIdx &&
      c.lineIdx === current.lineIdx &&
      c.segIdx === current.segIdx
  );
  if (idx === -1) return null;
  const target = dir === 'prev' ? idx - 1 : idx + 1;
  return target >= 0 && target < all.length ? all[target] : null;
}

/**
 * Replace the chord name at `segIdx` with `newChord`.
 */
export function renameChord(line: string, segIdx: number, newChord: string): string {
  const segs = parseLine(line);
  if (segIdx < 0 || segIdx >= segs.length || !segs[segIdx].chord) return line;
  const updated = segs.map((s, i) => (i === segIdx ? { ...s, chord: newChord } : s));
  return segmentsToLine(updated);
}

/**
 * Delete the chord at `segIdx` (removes `[ChordName]` from the line,
 * keeping adjacent text intact).
 */
export function deleteChord(line: string, segIdx: number): string {
  const segs = parseLine(line);
  if (segIdx < 0 || segIdx >= segs.length || !segs[segIdx].chord) return line;
  const updated = segs.map((s, i) => (i === segIdx ? { chord: null, text: s.text } : s));
  const merged: Segment[] = [];
  for (const seg of updated) {
    if (!seg.chord && merged.length > 0 && !merged[merged.length - 1].chord) {
      merged[merged.length - 1].text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return segmentsToLine(merged);
}

/**
 * Insert a chord at a given lyric character position (ignoring existing [Chord] tokens).
 * Keeps clean single-space separation on empty or chord-only lines.
 */
export function insertChord(line: string, charPos: number, chord: string): string {
  if (!line.trim()) {
    return `[${chord}]`;
  }
  if (!lineHasLyrics(line)) {
    const plainLen = extractPlacedChords(line).plainText.length;
    if (charPos >= plainLen) {
      return `${line.trimEnd()} [${chord}]`;
    }
  }
  let rawIdx = 0;
  let lyricCount = 0;
  while (rawIdx < line.length) {
    if (line[rawIdx] === '[') {
      const end = line.indexOf(']', rawIdx);
      if (end === -1) break;
      rawIdx = end + 1;
      continue;
    }
    if (lyricCount === charPos) break;
    lyricCount++;
    rawIdx++;
  }
  return line.slice(0, rawIdx) + `[${chord}]` + line.slice(rawIdx);
}

// ─── Structural section edit helpers ─────────────────────────────────────────

export function addSongSection(sections: Section[], label: string): Section[] {
  const cleanLabel = label.trim() || 'Verso';
  return [
    ...sections,
    {
      type: inferSectionType(cleanLabel),
      label: cleanLabel,
      lines: [''],
    },
  ];
}

export function duplicateSongSection(sections: Section[], sectionIdx: number): Section[] {
  if (sectionIdx < 0 || sectionIdx >= sections.length) return sections;
  const src = sections[sectionIdx];
  const copy: Section = {
    type: src.type,
    label: src.label,
    lines: [...src.lines],
  };
  const next = [...sections];
  next.splice(sectionIdx + 1, 0, copy);
  return next;
}

export function removeSongSection(sections: Section[], sectionIdx: number): Section[] {
  if (sections.length <= 1 || sectionIdx < 0 || sectionIdx >= sections.length) return sections;
  return sections.filter((_, i) => i !== sectionIdx);
}

export function moveSongSection(sections: Section[], sectionIdx: number, dir: 'up' | 'down'): Section[] {
  const targetIdx = dir === 'up' ? sectionIdx - 1 : sectionIdx + 1;
  if (sectionIdx < 0 || sectionIdx >= sections.length || targetIdx < 0 || targetIdx >= sections.length) {
    return sections;
  }
  const next = [...sections];
  const [moved] = next.splice(sectionIdx, 1);
  next.splice(targetIdx, 0, moved);
  return next;
}

export function renameSongSection(sections: Section[], sectionIdx: number, newLabel: string): Section[] {
  if (sectionIdx < 0 || sectionIdx >= sections.length) return sections;
  const clean = newLabel.trim() || sections[sectionIdx].label;
  return sections.map((sec, i) =>
    i === sectionIdx ? { ...sec, label: clean, type: inferSectionType(clean) } : sec
  );
}

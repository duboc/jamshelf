import { parseLine } from './music';
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

  if (dir === 'left') {
    if (target.pos > 0) {
      updated[targetIdx].pos = target.pos - 1;
    } else if (targetIdx > 0 && updated[targetIdx - 1].pos === target.pos) {
      // Swap order with an immediately preceding chord at the same position
      const prev = updated[targetIdx - 1];
      updated[targetIdx - 1] = updated[targetIdx];
      updated[targetIdx] = prev;
    } else {
      return { line, nextSegIdx: segIdx };
    }
  } else {
    if (target.pos < plainText.length) {
      updated[targetIdx].pos = target.pos + 1;
    } else if (targetIdx < updated.length - 1 && updated[targetIdx + 1].pos === target.pos) {
      const next = updated[targetIdx + 1];
      updated[targetIdx + 1] = updated[targetIdx];
      updated[targetIdx] = next;
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
 */
export function insertChord(line: string, charPos: number, chord: string): string {
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

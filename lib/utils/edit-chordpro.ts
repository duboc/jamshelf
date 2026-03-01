import { parseLine } from './music';

type Segment = { chord: string | null; text: string };

/** Re-serialize parsed segments back to a raw ChordPro line string */
function segmentsToLine(segs: Segment[]): string {
  return segs.map((s) => (s.chord ? `[${s.chord}]${s.text}` : s.text)).join('');
}

/**
 * Move the chord at `segIdx` one character left or right within the raw line.
 * The chord token is removed from its current text boundary and reinserted
 * one character earlier or later, redistributing the adjacent text.
 */
export function moveChord(line: string, segIdx: number, dir: 'left' | 'right'): string {
  const segs = parseLine(line);
  if (segIdx < 0 || segIdx >= segs.length || !segs[segIdx].chord) return line;

  // Rebuild as a flat char array with chord markers at their positions
  // Strategy: work in the flat string space.
  // Find the character position of the [Chord] in the original line.
  let pos = 0;
  for (let i = 0; i < segIdx; i++) {
    if (segs[i].chord) pos += segs[i].chord!.length + 2; // [chord]
    pos += segs[i].text.length;
  }
  // pos is now at the '[' of our target chord

  const chordToken = `[${segs[segIdx].chord}]`;
  const before = line.slice(0, pos);
  const after = line.slice(pos + chordToken.length);

  if (dir === 'left') {
    if (before.length === 0) return line; // already at start
    // move one char from end of before to start of after
    const movedChar = before[before.length - 1];
    const newBefore = before.slice(0, -1);
    return newBefore + chordToken + movedChar + after;
  } else {
    if (after.length === 0) return line; // already at end
    // move one char from start of after to end of before
    const movedChar = after[0];
    const newAfter = after.slice(1);
    return before + movedChar + chordToken + newAfter;
  }
}

/**
 * Replace the chord name at `segIdx` with `newChord`.
 */
export function renameChord(line: string, segIdx: number, newChord: string): string {
  const segs = parseLine(line);
  if (segIdx < 0 || segIdx >= segs.length || !segs[segIdx].chord) return line;
  const updated = segs.map((s, i) =>
    i === segIdx ? { ...s, chord: newChord } : s
  );
  return segmentsToLine(updated);
}

/**
 * Delete the chord at `segIdx` (removes `[ChordName]` from the line,
 * the following text stays in place).
 */
export function deleteChord(line: string, segIdx: number): string {
  const segs = parseLine(line);
  if (segIdx < 0 || segIdx >= segs.length || !segs[segIdx].chord) return line;
  const updated = segs.map((s, i) =>
    i === segIdx ? { chord: null, text: s.text } : s
  );
  // Merge consecutive null-chord segments
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
 * Insert a chord at a given character position in the raw line.
 * `charPos` is the index in the lyric text (ignoring existing [Chord] tokens).
 * We find the right insertion point in the raw string and insert `[chord]`.
 */
export function insertChord(line: string, charPos: number, chord: string): string {
  // Walk the raw line, skipping [Chord] tokens, counting lyric characters
  let rawIdx = 0;
  let lyricCount = 0;
  while (rawIdx < line.length) {
    if (line[rawIdx] === '[') {
      // skip to end of chord token
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

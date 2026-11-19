export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const SHARP_DISPLAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_DISPLAY = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B',
};

export const CHORD_SUFFIX_MAP: Record<string, string> = {
  '': 'major', M: 'major', m: 'minor', min: 'minor', maj: 'major',
  maj7: 'maj7', Maj7: 'maj7', M7: 'maj7', m7: 'm7', min7: 'm7',
  '7': '7', dim: 'dim', dim7: 'dim', sus2: 'sus2', sus4: 'sus4',
  aug: 'aug', '+': 'aug', '6': '6', '9': '9', add9: 'add9',
  m9: 'm9', '11': '11', '13': '13', m6: 'm6', '7sus4': '7sus4',
  m7b5: 'm7b5', mmaj7: 'mmaj7',
};

export const NOTE_TO_DB_KEY: Record<string, string> = {
  C: 'C', 'C#': 'Csharp', Db: 'Csharp', D: 'D', 'D#': 'Eb', Eb: 'Eb',
  E: 'E', F: 'F', 'F#': 'Fsharp', Gb: 'Fsharp', G: 'G', 'G#': 'Ab',
  Ab: 'Ab', A: 'A', 'A#': 'Bb', Bb: 'Bb', B: 'B',
};

export const PIANO_INTERVALS: Record<string, number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7], '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6],
  sus2: [0, 2, 7], sus4: [0, 5, 7], aug: [0, 4, 8],
  '6': [0, 4, 7, 9], '9': [0, 4, 7, 10, 14], add9: [0, 4, 7, 14],
  m9: [0, 3, 7, 10, 14], '11': [0, 4, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 21], m6: [0, 3, 7, 9],
  '7sus4': [0, 5, 7, 10], '5': [0, 7], m7b5: [0, 3, 6, 10],
  mmaj7: [0, 3, 7, 11],
};

// Theme-aware Google Cloud Console section accents (readable in both light and dark mode)
export const SECTION_COLORS: Record<string, { bg: string; bd: string; lb: string }> = {
  intro: {
    bg: 'var(--surface)',
    bd: 'var(--flat)',
    lb: 'var(--flat)',
  },
  verse: {
    bg: 'var(--surface)',
    bd: 'var(--line)',
    lb: 'var(--muted)',
  },
  'pre-chorus': {
    bg: 'color-mix(in srgb, var(--warn) 6%, var(--surface))',
    bd: 'var(--warn)',
    lb: 'var(--warn-ink)',
  },
  chorus: {
    bg: 'color-mix(in srgb, var(--sharp) 6%, var(--surface))',
    bd: 'var(--sharp)',
    lb: 'var(--sharp)',
  },
  bridge: {
    bg: 'color-mix(in srgb, var(--tune) 6%, var(--surface))',
    bd: 'var(--tune)',
    lb: 'var(--tune)',
  },
  outro: {
    bg: 'var(--surface)',
    bd: 'var(--flat)',
    lb: 'var(--flat)',
  },
  solo: {
    bg: 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
    bd: 'var(--accent)',
    lb: 'var(--accent-ink)',
  },
  interlude: {
    bg: 'color-mix(in srgb, var(--tune) 5%, var(--surface))',
    bd: 'var(--tune)',
    lb: 'var(--tune)',
  },
};

export function normalizeNote(n: string): string {
  return FLAT_TO_SHARP[n] || n;
}

export function noteIndex(n: string): number {
  return NOTES.indexOf(normalizeNote(n) as typeof NOTES[number]);
}

export function transposeChord(chord: string, semitones: number, useFlats: boolean): string {
  if (!semitones) return chord;
  const m = chord.match(/^([A-G][#b]?)(.*)/);
  if (!m) return chord;
  const idx = noteIndex(m[1]);
  if (idx < 0) return chord;
  const d = useFlats ? FLAT_DISPLAY : SHARP_DISPLAY;
  return d[((idx + semitones) % 12 + 12) % 12] + m[2];
}

export function parseLine(line: string): { chord: string | null; text: string }[] {
  const parts: { chord: string | null; text: string }[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0, m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      if (parts.length) parts[parts.length - 1].text += line.slice(last, m.index);
      else parts.push({ chord: null, text: line.slice(last, m.index) });
    }
    parts.push({ chord: m[1], text: '' });
    last = re.lastIndex;
  }
  if (last < line.length) {
    if (parts.length) parts[parts.length - 1].text += line.slice(last);
    else parts.push({ chord: null, text: line.slice(last) });
  }
  if (!parts.length) parts.push({ chord: null, text: '' });
  return parts;
}

/** Extracts plain lyric text from a ChordPro line, ignoring chords and bar-grid punctuation. */
export function extractLyricText(line: string): string {
  return parseLine(line)
    .map((seg) => seg.text)
    .join('');
}

/** True when a ChordPro line contains real sung words (not just chords, spaces, pipes or repeat marks). */
export function lineHasLyrics(line: string): boolean {
  const stripped = extractLyricText(line).replace(/[\s|/:.,\-–—()x×0-9]+/gi, '');
  return stripped.length > 0;
}

/** True when a whole section is instrumental (no sung lyrics on any line). */
export function isInstrumentalSection(lines: string[]): boolean {
  return lines.every((l) => !lineHasLyrics(l));
}

export function extractChords(sections: { lines: string[] }[]): string[] {
  const s = new Set<string>();
  sections.forEach(sec => sec.lines.forEach(l => {
    let m;
    const re = /\[([^\]]+)\]/g;
    while ((m = re.exec(l)) !== null) s.add(m[1]);
  }));
  return [...s];
}

export function transposeLine(line: string, semitones: number, useFlats: boolean): string {
  if (!semitones) return line;
  return line.replace(/\[([^\]]+)\]/g, (_, chord) => `[${transposeChord(chord, semitones, useFlats)}]`);
}

/** Permanently bakes a transpose into a song's chords and key (used by "Save as Key"). */
export function transposeSong<T extends { originalKey: string; displayKey: string; sections: { lines: string[] }[] }>(
  song: T,
  semitones: number,
  useFlats: boolean
): T {
  if (!semitones) return song;
  const newKey = transposeChord(song.originalKey, semitones, useFlats);
  return {
    ...song,
    originalKey: newKey,
    displayKey: newKey,
    sections: song.sections.map((sec) => ({
      ...sec,
      lines: sec.lines.map((line) => transposeLine(line, semitones, useFlats)),
    })),
  };
}

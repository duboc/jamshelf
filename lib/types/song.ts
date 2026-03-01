export interface ChordSegment {
  chord: string | null;
  text: string;
}

export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'outro'
  | 'solo'
  | 'interlude';

export interface Section {
  type: SectionType;
  label: string;
  lines: string[];
}

// The persisted unit of storage — raw ChordPro text + stable ID
export interface ChordProEntry {
  id: string;
  text: string;
}

// The parsed, renderable song object
export interface ParsedSong {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  capo: number;
  displayKey: string;
  tempo: number;
  timeSignature: string;
  sections: Section[];
}

// Alias for backwards compatibility with existing components
export type Song = ParsedSong;

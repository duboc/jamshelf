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
  rating: number; // 0 = unrated, 1-5 stars
  favorite: boolean;
  spotifyTrackId: string | null;
  duration: number | null; // song length in seconds (from {duration:} or Spotify)
  scrollSpeed: number | null; // saved per-song auto-scroll multiplier (from {scroll:})
  sectionMarks: number[] | null; // calibrated section start timestamps in seconds (from {marks:})
  notes: string; // rehearsal / stage cues (from {notes:})
}

// Alias for backwards compatibility with existing components
export type Song = ParsedSong;

// Setlist types
export interface Setlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
}

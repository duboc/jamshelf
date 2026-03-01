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

export interface Song {
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

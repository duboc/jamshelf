export interface GuitarVoicing {
  f: number[];
  g: number[];
  b: number;
  r: number[];
  c: boolean;
}

export type GuitarDBKey =
  | 'C' | 'Csharp' | 'D' | 'Eb' | 'E' | 'F'
  | 'Fsharp' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';

export type GuitarDB = Record<GuitarDBKey, Record<string, GuitarVoicing[]>>;

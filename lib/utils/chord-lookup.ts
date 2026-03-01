import { GUITAR_DB } from '@/lib/data/guitar-db';
import { CHORD_SUFFIX_MAP, NOTE_TO_DB_KEY, PIANO_INTERVALS, NOTES, normalizeNote, noteIndex } from './music';
import type { GuitarVoicing, GuitarDBKey } from '@/lib/types/chord';

export function resolveChord(name: string): { dbKey: GuitarDBKey; suffix: string } | null {
  const m = name.match(/^([A-G][#b]?)(.*)/);
  if (!m) return null;
  const suffix = CHORD_SUFFIX_MAP[m[2]] ?? m[2];
  const dbKey = NOTE_TO_DB_KEY[m[1]] as GuitarDBKey | undefined;
  if (!dbKey) return null;
  return { dbKey, suffix };
}

export function getGuitarPositions(chordName: string): GuitarVoicing[] {
  const r = resolveChord(chordName);
  if (!r) return [];
  const kc = GUITAR_DB.chords[r.dbKey];
  if (!kc) return [];
  return (kc as Record<string, GuitarVoicing[]>)[r.suffix] || [];
}

export function getPianoNotes(chordName: string): string[] {
  const r = resolveChord(chordName);
  if (!r) return [];
  const ri = noteIndex(r.dbKey.replace('sharp', '#'));
  if (ri < 0) return [];
  const iv = PIANO_INTERVALS[r.suffix] || PIANO_INTERVALS.major;
  return iv.map(i => NOTES[(ri + i) % 12]);
}

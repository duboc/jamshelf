import type { ParsedSong } from '@/lib/types/song';
import { extractChords } from '@/lib/utils/music';

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o', 'of', 'the', 'in', 'on', 'to', 'a', 'an']);

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function isIncompleteSong(song: ParsedSong): boolean {
  if (song.sections.length === 0) return true;
  const allLines = song.sections.flatMap((s) => s.lines).map((l) => l.trim()).filter(Boolean);
  if (allLines.length === 0) return true;
  return allLines.length === 1 && /no content generated/i.test(allLines[0]);
}

export function getDisplayTitleAndArtist(song: ParsedSong): {
  title: string;
  artist: string;
  incomplete: boolean;
} {
  const incomplete = isIncompleteSong(song);
  const rawTitle = song.title.trim();
  const isRawSlug = /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/.test(rawTitle);

  if (!isRawSlug) {
    return {
      title: rawTitle || 'Sem título',
      artist: song.artist.trim(),
      incomplete,
    };
  }

  // Known artist-slug prefixes or general humanized fallback
  const knownArtists: [string, string][] = [
    ['charlie-brown-jr-', 'Charlie Brown Jr.'],
    ['coldplay-', 'Coldplay'],
    ['arctic-monkeys-', 'Arctic Monkeys'],
    ['legiao-urbana-', 'Legião Urbana'],
    ['los-hermanos-', 'Los Hermanos'],
    ['red-hot-chili-peppers-', 'Red Hot Chili Peppers'],
  ];
  for (const [prefix, artistName] of knownArtists) {
    if (rawTitle.startsWith(prefix)) {
      return {
        title: titleCaseSlug(rawTitle.slice(prefix.length)),
        artist: song.artist.trim() || artistName,
        incomplete,
      };
    }
  }

  return {
    title: titleCaseSlug(rawTitle),
    artist: song.artist.trim(),
    incomplete,
  };
}

export function getEffectiveKey(song: ParsedSong): { key: string; estimated: boolean } {
  const explicit = (song.displayKey || song.originalKey || '').trim();
  if (explicit) return { key: explicit, estimated: false };

  const chords = extractChords(song.sections);
  const first = chords[0];
  if (!first) return { key: '', estimated: false };

  // Strip slash bass and extensions down to tonal center (e.g. Gm7/D -> Gm, Cadd9 -> C)
  const base = first.split('/')[0];
  const m = base.match(/^([A-G][#b]?)(m(?!aj))?/);
  if (!m) return { key: '', estimated: false };
  return { key: `${m[1]}${m[2] ?? ''}`, estimated: true };
}

const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
};

const FLAT_PREF_ROOTS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

export function spellChordNotes(chord: string, notes: string[]): string[] {
  const rootMatch = chord.match(/^([A-G][#b]?)(m(?!aj))?/);
  const rootKey = rootMatch ? `${rootMatch[1]}${rootMatch[2] ?? ''}` : '';
  const preferFlats = chord.includes('b') || FLAT_PREF_ROOTS.has(rootKey);
  if (!preferFlats) return notes;
  return notes.map((n) => SHARP_TO_FLAT[n] ?? n);
}

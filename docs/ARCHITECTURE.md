# Architecture

## High-Level Overview

Jamshelf is a fully client-side application. There is no backend server or database — all data lives in the browser's localStorage.

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Next.js App Router                   │   │
│  │                                                   │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────┐  │   │
│  │  │  Home   │  │Song View │  │  Add Song      │  │   │
│  │  │ page    │  │  page    │  │  page          │  │   │
│  │  └────┬────┘  └────┬─────┘  └───────┬────────┘  │   │
│  │       │             │               │            │   │
│  │  ┌────▼─────────────▼───────────────▼────────┐   │   │
│  │  │            React Components               │   │   │
│  │  │  ChordSheet · ChordPanel · Metronome      │   │   │
│  │  └────────────────┬──────────────────────────┘   │   │
│  │                   │                               │   │
│  │  ┌────────────────▼──────────────────────────┐   │   │
│  │  │          Zustand Stores                    │   │   │
│  │  │  song-store · player-store · setlist-store │   │   │
│  │  └────────┬────────────────────┬──────────────┘   │   │
│  │           │                    │                   │   │
│  │  ┌────────▼────────┐  ┌───────▼──────────┐       │   │
│  │  │  localStorage   │  │  Gemini API      │       │   │
│  │  │  (persistence)  │  │  (AI import)     │       │   │
│  │  └─────────────────┘  └──────────────────┘       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Data Model

### ChordPro as Source of Truth

All song data is stored as raw ChordPro text. The flow is:

```
ChordProEntry (persisted)  →  parseChordPro()  →  ParsedSong (rendered)
{ id, text }                                      { id, title, artist, sections, ... }
```

Edits go back the other way: utility functions in `edit-chordpro.ts` mutate the raw text, which is then persisted via `updateEntry()`.

### TypeScript Interfaces

Defined in `lib/types/song.ts`:

```typescript
// Persisted unit of storage — raw ChordPro text + stable ID
interface ChordProEntry {
  id: string;    // e.g. "song-before-you-go"
  text: string;  // raw ChordPro content
}

// Parsed, renderable song object
interface ParsedSong {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  capo: number;
  displayKey: string;
  tempo: number;
  timeSignature: string;
  sections: Section[];
  rating: number;     // 0 = unrated, 1-5 stars
  favorite: boolean;
}

interface Section {
  type: SectionType;
  label: string;       // e.g. "Verse 1", "Chorus"
  lines: string[];     // raw ChordPro lines with [Chord] tokens
}

type SectionType =
  | 'intro' | 'verse' | 'pre-chorus' | 'chorus'
  | 'bridge' | 'outro' | 'solo' | 'interlude';
```

Defined in `lib/types/chord.ts`:

```typescript
interface GuitarVoicing {
  f: number[];  // fret positions per string (6 strings)
  g: number[];  // finger numbers
  b: number;    // base fret
  r: number[];  // root note string indicators
  c: boolean;   // capo/barre indicator
}
```

### ChordPro Format

Standard ChordPro with custom directives:

```chordpro
{title: Song Title}
{artist: Artist Name}
{key: Am}
{capo: 3}
{tempo: 120}
{time: 4/4}
{rating: 4}         # Custom: 1-5 stars
{favorite: true}    # Custom: boolean

[Verse 1]
[C]I fell by the [Am]wayside

[Chorus]
[C]So, [G]before you [Am]go
```

The parser (`chordpro-parser.ts`) recognizes:
- Standard directives: `{title}`, `{artist}`, `{key}`, `{capo}`, `{tempo}`, `{time}`
- Custom directives: `{rating}`, `{favorite}`
- Section headers: `[Verse 1]`, `{section: Chorus}`, `{start_of_verse}`
- Inline chords: `[Am]text`
- Ignored directives: `{define:}`, `{end_of_}`, `{x_}`

## Zustand Stores

### song-store (`jamshelf-songs`)

**Purpose**: Song library CRUD. Persisted to localStorage.

| Method | Signature | Description |
| ------ | --------- | ----------- |
| `getSong` | `(id: string) => ParsedSong \| null` | Parse and return a single song |
| `getSongs` | `() => ParsedSong[]` | Parse and return all songs |
| `getEntry` | `(id: string) => ChordProEntry \| null` | Get raw ChordPro entry |
| `addEntry` | `(entry: ChordProEntry) => void` | Add a song |
| `removeEntry` | `(id: string) => void` | Delete a song |
| `updateEntry` | `(id: string, text: string) => void` | Replace raw ChordPro text |
| `patchMeta` | `(id: string, key: string, value: string \| number) => void` | Patch a single metadata directive |
| `exportEntry` | `(id: string) => string \| null` | Export single song as ChordPro text |
| `exportAll` | `() => string` | Export all songs joined by `---` |
| `importEntries` | `(text: string) => number` | Import songs from `---`-separated text |

### player-store (not persisted)

**Purpose**: Transient UI state for the song viewer. Resets on page reload.

| State | Type | Default | Range |
| ----- | ---- | ------- | ----- |
| `transpose` | `number` | `0` | `0-11` (wraps via modular arithmetic) |
| `useFlats` | `boolean` | `false` | — |
| `fontSize` | `number` | `100` | `60-160` |
| `autoScrollSpeed` | `number` | `1` | unbounded |
| `isAutoScrolling` | `boolean` | `false` | — |
| `activeChord` | `string \| null` | `null` | — |
| `metronomeOn` | `boolean` | `false` | — |
| `bpm` | `number` | `120` | `40-240` |
| `capo` | `number` | `0` | `0-12` |
| `editMode` | `boolean` | `false` | — |

Entering edit mode automatically disables auto-scroll.

### setlist-store (`jamshelf-setlists`)

**Purpose**: Ordered song collections. Persisted to localStorage.

| Method | Signature | Description |
| ------ | --------- | ----------- |
| `createSetlist` | `(name: string) => Setlist` | Create and return new setlist |
| `deleteSetlist` | `(id: string) => void` | Delete a setlist |
| `renameSetlist` | `(id: string, name: string) => void` | Rename a setlist |
| `addSongToSetlist` | `(setlistId, songId) => void` | Add song (no duplicates) |
| `removeSongFromSetlist` | `(setlistId, songId) => void` | Remove song |
| `reorderSong` | `(setlistId, fromIdx, toIdx) => void` | Drag-to-reorder |

## App Router Routes

| Route | File | Description |
| ----- | ---- | ----------- |
| `/` | `app/page.tsx` | Home — song library with All/Favorites/Setlists tabs |
| `/song/[id]` | `app/song/[id]/page.tsx` | Song viewer with chord sheet, controls, chord panel |
| `/add-song` | `app/add-song/page.tsx` | Add song manually or via Gemini AI import |
| `/setlists/[id]` | `app/setlists/[id]/page.tsx` | Setlist viewer with ordered song list |

## Component Hierarchy

```
layout.tsx
├── page.tsx (Home)
│   └── SongCard
│
├── song/[id]/page.tsx (Song Viewer)
│   ├── ChordSheet
│   │   ├── SectionBlock (per section)
│   │   │   └── ChordLine (per line)
│   │   │       ├── ChordBadge (per chord)
│   │   │       └── EditChordOverlay (in edit mode)
│   │   └── Auto-scroll logic
│   ├── ChordPanel
│   │   ├── GuitarChordDiagram
│   │   └── PianoChordDiagram
│   └── Metronome
│
├── add-song/page.tsx
│   └── AI Import (Gemini integration)
│
└── setlists/[id]/page.tsx
    └── SongCard (reordered)
```

## Key Algorithms

### ChordPro Parser (`chordpro-parser.ts`)

`parseChordPro(id, text)` processes raw text line-by-line:
1. Extract metadata directives (`{title:}`, `{key:}`, etc.) into a `meta` object
2. Detect section headers (`[Verse 1]`, `{section: Chorus}`, `{start_of_verse}`)
3. Use `inferSectionType()` to map labels to `SectionType` using keyword matching
4. Accumulate content lines into the current section
5. Return a `ParsedSong` with all structured data

### Transposition (`music.ts`)

`transposeChord(chord, semitones, useFlats)`:
1. Parse chord into root note + suffix (e.g. `Am7` → `A` + `m7`)
2. Find root in `NOTES` array (12 semitones, C-based)
3. Add semitones with modular arithmetic: `((idx + semitones) % 12 + 12) % 12`
4. Look up display name from `SHARP_DISPLAY` or `FLAT_DISPLAY`
5. Reattach suffix

`ChordBadge` transposes by `transpose + capo` combined offset.

### Chord Editing (`edit-chordpro.ts`)

Four operations on raw ChordPro line strings:
- **`moveChord(line, segIdx, dir)`** — Shifts a `[Chord]` token one character left or right by swapping with adjacent text
- **`renameChord(line, segIdx, newChord)`** — Replaces chord name at segment index
- **`deleteChord(line, segIdx)`** — Removes `[Chord]` token, merges adjacent text segments
- **`insertChord(line, charPos, chord)`** — Inserts `[Chord]` at a lyric character position (skipping existing chord tokens)

### Auto-Scroll

Uses a stable `useEffect` loop that reads scroll speed from a `useRef` to avoid re-render dependency loops. The scroll amount per frame is calculated from `autoScrollSpeed`.

### Chord Lookup (`chord-lookup.ts`)

- **Guitar**: `getGuitarPositions(chordName)` resolves chord name to database key + suffix, then looks up voicings from the built-in `guitar-db.ts`
- **Piano**: `getPianoNotes(chordName)` uses interval arrays from `PIANO_INTERVALS` to compute the notes in a chord

## Design System

### Theme Tokens (`app/globals.css`)

```css
--color-background: #0a0a0a;       /* Near-black background */
--color-foreground: #ededed;        /* Light text */
--color-muted: #a1a1aa;            /* Zinc-400 muted text */
--color-card: #18181b;             /* Zinc-900 card background */
--color-card-hover: #27272a;       /* Zinc-800 hover state */
--color-border: #27272a;           /* Zinc-800 borders */
--color-accent: #a78bfa;          /* Violet-400 accent */
--color-accent-dim: rgba(167,139,250,0.15);  /* Dimmed accent */
```

### Fonts

| Token | Font | Usage |
| ----- | ---- | ----- |
| `--font-sans` | DM Sans | Body text, UI elements |
| `--font-mono` | JetBrains Mono | Chord names, code |
| `--font-display` | Syne | Headings, titles |

### Section Colors (`music.ts`)

Each section type has distinct background, border, and label colors:

| Section | Border Color | Label Color |
| ------- | ------------ | ----------- |
| Intro | `#7c3aed` (violet) | `#a78bfa` |
| Verse | `#0ea5e9` (cyan) | `#38bdf8` |
| Pre-chorus | `#d97706` (amber) | `#fbbf24` |
| Chorus | `#e11d48` (rose) | `#fb7185` |
| Bridge | `#16a34a` (green) | `#4ade80` |
| Outro | `#7c3aed` (violet) | `#a78bfa` |
| Solo | `#db2777` (pink) | `#f472b6` |
| Interlude | `#0d9488` (teal) | `#2dd4bf` |

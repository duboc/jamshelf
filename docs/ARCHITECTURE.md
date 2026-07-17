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
  spotifyTrackId: string | null;  // matched via /api/spotify/search when adding
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
{spotify: 3n3Ppam7vgaVa1iaRUc9Lp}  # Custom: Spotify track ID, see docs/SPOTIFY-INTEGRATION.md

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

### live-session-store (`lib/stores/live-session-store.ts`)

**Purpose**: Cross-device sync while performing a setlist live. Not persisted to localStorage — backed by a `liveSessions/{setlistId}` Firestore doc via `/api/sessions/[id]`.

| Hook | Description |
| ---- | ----------- |
| `useLiveSession(setlistId, currentSongId, scrollTopRef)` | Full leader/follower logic for the song viewer: polls every 1.5s, pushes state when leading, mirrors `player-store` when following. Returns `{ session, isLeading, isFollowing, isLeaderStale, startLeading, stopLeading, endSession, syncCorrection }`. |
| `useLiveSessionStatus(setlistId)` | Read-only polling of the session doc, no push/claim logic. Used on the setlist list page to show "who's leading" without risking two mounted instances fighting over leadership. |

**One device leads at a time** (explicit, "last claim wins" — no auth in this app). The leader reports its own real `scrollTop`/`isAutoScrolling`/`autoScrollSpeed`/`metronomeOn`/`bpm`/`currentSongId` as ground truth; followers poll on the same cadence and mirror those fields into their local `player-store`, and `ChordSheet` snaps to the leader's `scrollTop` on each poll via its `syncCorrection` prop. No device's clock is ever compared to another's — only each device's own `performance.now()`-based extrapolation between polls. See "Live Session Sync" under Key Algorithms below for the full design and its known limitations.

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

Opening a song via `/song/[id]?setlist={setlistId}` puts the device into that setlist's live session context (see below) and enables Prev/Next navigation within the setlist.

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

### Live Session Sync (`live-session-store.ts`, `app/api/sessions/[id]/route.ts`)

`app/api/sessions/[id]/route.ts` is the one route keyed by a singular doc id with its own `GET` — every other `[id]` route (`songs`, `setlists`) only supports `PUT`/`DELETE`, with `GET` at the collection level. This is deliberate: a live session doesn't belong to a "list of sessions" concept, it's addressed directly by setlist id. `GET` always returns `200` with `DEFAULT_LIVE_SESSION` merged under the stored doc (never `404`), so callers never need to special-case "no session yet."

The sync design avoids cross-device clock comparison entirely:
1. Every device (leader and followers alike) polls `GET /api/sessions/{setlistId}` every ~1.5s.
2. Whichever device sees `leaderId === its own deviceId` in the freshly-fetched doc pushes its own current state back via `PUT` (plus immediately on discrete changes like toggling auto-scroll or switching songs, not just on the timer). Re-deriving "am I leader" from each fresh poll — rather than trusting local state — is what lets a takeover happen cleanly: a deposed leader's very next poll sees someone else's id and stops pushing.
3. Every other device mirrors the fetched `isAutoScrolling`/`autoScrollSpeed`/`metronomeOn`/`bpm` into its local `player-store`, and bumps a nonce that makes `ChordSheet` hard-snap `scrollRef.current.scrollTop` to the leader's last-reported value. Between polls, the existing local auto-scroll `requestAnimationFrame` loop keeps running off the synced speed, so motion stays smooth; the snap just bounds drift every cycle.
4. If `currentSongId` in the doc differs from the song a follower is viewing, it navigates there (`router.push`) to follow the leader through the setlist.

**Known limitations (by design, not bugs)**: small visible scroll jumps every ~1.5s are expected — there's no easing in v1. Metronome sync is on/off + tempo only, not sample-accurate phase — HTTP polling can't give a synced click track, so don't rely on it for anything tighter than "roughly together." A leader that closes their tab without tapping "Stop" is only detected as inactive after ~20s of missed heartbeats (`updatedAt` staleness), not instantly.

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

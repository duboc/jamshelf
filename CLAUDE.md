# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start Next.js dev server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint (no args needed, uses eslint.config.mjs)
```

No test framework is configured.

## Architecture

**Stack**: Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS v4 + Zustand 5

**Path alias**: `@/*` maps to project root (e.g., `@/lib/utils/music`)

### Data Flow

Songs are stored as raw **ChordPro text** (`ChordProEntry`) in Zustand stores persisted to localStorage. On render, ChordPro is parsed into `ParsedSong` objects with structured sections. Edits mutate the ChordPro text via utilities in `lib/utils/edit-chordpro.ts` and `chordpro-parser.ts`, then persist back.

Three Zustand stores:
- **`song-store`** (`jamshelf-songs`): Song library — CRUD on `ChordProEntry[]`, `patchMeta()` for metadata updates
- **`player-store`**: Transient UI state — transpose, capo, BPM, fontSize, autoScrollSpeed, editMode, activeChord
- **`setlist-store`** (`jamshelf-setlists`): Ordered collections of song IDs

### Key Directories

- `app/` — Next.js App Router pages (home, song viewer, add-song, setlists)
- `components/chord-sheet/` — ChordSheet, ChordLine, SectionBlock, ChordBadge, EditChordOverlay
- `components/chord-diagrams/` — ChordPanel with GuitarChordDiagram and PianoChordDiagram
- `components/metronome/` — Web Audio API metronome
- `lib/stores/` — Zustand stores
- `lib/utils/` — Music theory (transposition), ChordPro parsing/editing, chord voicing lookup, AI import
- `lib/types/` — TypeScript interfaces (`song.ts`, `chord.ts`)
- `lib/data/` — Default songs library and guitar chord voicing database

### ChordPro Format

The app uses standard ChordPro with custom directives:
```
{title: Song Title}
{artist: Artist Name}
{key: Am}
{capo: 3}
{tempo: 120}
{time: 4/4}
{rating: 4}        # Custom: 1-5 stars
{favorite: true}   # Custom: boolean
```

Sections use bracket labels: `[Verse 1]`, `[Chorus]`, etc. Chords inline: `[C]Lyrics [Am]here`.

### Transposition

`ChordBadge` transposes by `transpose + capo`. The song page syncs `song.capo` to `playerStore.setCapo()` on load. Transposition logic lives in `lib/utils/music.ts`.

### AI Import

`lib/utils/ai-import.ts` uses Gemini 2.0 Flash API (client-side, user provides API key) to convert raw chord sheets into ChordPro format.

## Conventions

- **Styling**: Dark theme with violet accents. Section types have distinct colors (verse=cyan, chorus=rose, bridge=green, etc.)
- **Song IDs**: Format `song-{slug}` derived from title
- **Setlist IDs**: Format `setlist-{timestamp}-{random}`
- **No external UI libraries** — chord diagrams, drag-reorder, and metronome are all custom-built
- **Auto-scroll**: Uses a stable `useEffect` loop reading speed from a ref to avoid re-render loops

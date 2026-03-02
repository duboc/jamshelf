# Onboarding

New contributor guide for Jamshelf.

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (comes with Node.js)
- **git**

## Setup

```bash
git clone <repo-url> jamshelf
cd jamshelf
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app loads with default songs from `lib/data/default-songs.ts`.

## Project Orientation

### Key Directories

| Directory | What's There |
| --------- | ------------ |
| `app/` | Next.js App Router pages and layout |
| `components/chord-sheet/` | The main song rendering pipeline |
| `components/chord-diagrams/` | Guitar and piano chord visualization |
| `components/metronome/` | Web Audio API metronome |
| `components/song-list/` | Song card for the library view |
| `lib/stores/` | Three Zustand stores (song, player, setlist) |
| `lib/utils/` | ChordPro parsing, music theory, chord editing, AI import |
| `lib/types/` | TypeScript interfaces |
| `lib/data/` | Default songs and guitar chord voicing database |

### Path Alias

The project uses `@/*` as a path alias mapping to the project root:

```typescript
import { useSongStore } from '@/lib/stores/song-store';
import type { ParsedSong } from '@/lib/types/song';
```

## Development Workflow

### Hot Reload

`npm run dev` starts the Next.js dev server with Fast Refresh. Changes to components, stores, and utilities are reflected immediately without page reload.

### Linting

```bash
npm run lint
```

Uses ESLint 9 with `eslint-config-next`. No custom rules beyond the Next.js defaults.

### No Tests

There is no test framework configured. Verify changes via:
1. `npm run build` — catches TypeScript errors
2. `npm run lint` — catches lint issues
3. Manual testing in the browser

## Working with ChordPro

ChordPro is a plain-text format for annotating song lyrics with chords. Here's the format Jamshelf uses:

```chordpro
{title: Amazing Grace}
{artist: Traditional}
{key: G}
{capo: 2}
{tempo: 80}
{time: 3/4}
{rating: 5}
{favorite: true}

[Verse 1]
A[G]mazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me

[Verse 2]
I [G]once was [G7]lost but [C]now am [G]found
Was [G]blind but [Em]now I [D7]see
```

Key points:
- Metadata lives in `{key: value}` directives at the top
- Sections use `[Section Name]` on their own line
- Chords are inline: `[Chord]` immediately before the syllable
- The parser recognizes section keywords: intro, verse, pre-chorus, chorus, bridge, outro, solo, interlude

See [Architecture](./ARCHITECTURE.md#chordpro-format) for full format details.

## State Management Patterns

### Reading from Stores

```typescript
import { useSongStore } from '@/lib/stores/song-store';
import { usePlayerStore } from '@/lib/stores/player-store';

function MyComponent() {
  // Select specific state to avoid unnecessary re-renders
  const songs = useSongStore((s) => s.getSongs());
  const transpose = usePlayerStore((s) => s.transpose);

  // Get actions
  const addEntry = useSongStore((s) => s.addEntry);
  const setTranspose = usePlayerStore((s) => s.setTranspose);
}
```

### Mutations

All mutations go through store actions. Never mutate state directly.

```typescript
// Update song metadata (patches the ChordPro text)
useSongStore.getState().patchMeta(songId, 'rating', 4);

// Replace full ChordPro text
useSongStore.getState().updateEntry(songId, newChordProText);
```

### Bounded Ranges

Some player-store values are clamped:

| Value | Range | Setter |
| ----- | ----- | ------ |
| `fontSize` | 60–160 | `setFontSize` |
| `bpm` | 40–240 | `setBpm` |
| `capo` | 0–12 | `setCapo` |
| `transpose` | 0–11 (wraps) | `setTranspose` |

## Common Tasks

### Adding a New Metadata Field

Example: adding a `{genre: Rock}` directive.

1. **Update the parser** (`lib/utils/chordpro-parser.ts`):
   ```typescript
   // Add to the meta object initialization
   const meta = { ..., genre: '' };

   // Add regex match in the parsing loop
   const genreM = line.match(/^\{genre:\s*(.+)\}$/i);
   if (genreM) { meta.genre = genreM[1].trim(); continue; }
   ```

2. **Update the interface** (`lib/types/song.ts`):
   ```typescript
   interface ParsedSong {
     // ... existing fields
     genre: string;
   }
   ```

3. **Update the serializer** (`chordpro-parser.ts`, `songToChordPro`):
   ```typescript
   if (song.genre) lines.push(`{genre: ${song.genre}}`);
   ```

4. **Display it** in the component that shows song metadata.

### Adding a New Section Type

1. **Add to the type** (`lib/types/song.ts`):
   ```typescript
   type SectionType = ... | 'tag';
   ```

2. **Add keyword detection** (`lib/utils/chordpro-parser.ts`, `inferSectionType`):
   ```typescript
   if (l.includes('tag')) return 'tag';
   ```

3. **Add a color** (`lib/utils/music.ts`, `SECTION_COLORS`):
   ```typescript
   tag: { bg: 'rgba(...)' , bd: '#...', lb: '#...' },
   ```

### Adding a Chord Suffix

To support a new chord quality (e.g., `sus2sus4`):

1. **Add to `CHORD_SUFFIX_MAP`** (`lib/utils/music.ts`):
   ```typescript
   sus2sus4: 'sus2sus4',
   ```

2. **Add piano intervals** (`lib/utils/music.ts`, `PIANO_INTERVALS`):
   ```typescript
   sus2sus4: [0, 2, 5, 7],
   ```

3. **Add guitar voicings** to `lib/data/guitar-db.ts` for each root note.

### Adding a New Route

1. Create `app/my-page/page.tsx`:
   ```typescript
   export default function MyPage() {
     return <div>My Page</div>;
   }
   ```

2. For dynamic routes, use `app/my-page/[param]/page.tsx` with the `use` hook to unwrap params:
   ```typescript
   import { use } from 'react';

   export default function MyPage({ params }: { params: Promise<{ param: string }> }) {
     const { param } = use(params);
     return <div>{param}</div>;
   }
   ```

## ID Conventions

| Entity | Format | Example |
| ------ | ------ | ------- |
| Song | `song-{slugified-title}` | `song-before-you-go` |
| Setlist | `setlist-{timestamp}-{random}` | `setlist-1709394821000-a3f2` |

Song slugs are derived by: lowercase → replace non-alphanumeric with `-` → trim leading/trailing `-`.

## Styling Guide

### Dark Theme

The app uses a dark theme exclusively. All colors are defined as CSS custom properties in `app/globals.css`.

| Token | Value | Usage |
| ----- | ----- | ----- |
| `--color-background` | `#0a0a0a` | Page background |
| `--color-foreground` | `#ededed` | Primary text |
| `--color-muted` | `#a1a1aa` | Secondary text |
| `--color-card` | `#18181b` | Card backgrounds |
| `--color-card-hover` | `#27272a` | Card hover state |
| `--color-border` | `#27272a` | Borders |
| `--color-accent` | `#a78bfa` | Violet accent (buttons, links, highlights) |
| `--color-accent-dim` | `rgba(167,139,250,0.15)` | Dimmed accent for backgrounds |

### Fonts

- **DM Sans** (`font-sans`): Body text and UI elements
- **JetBrains Mono** (`font-mono`): Chord names and monospace content
- **Syne** (`font-display`): Headings and display text

### Section Colors

Each section type has a distinct color. See [Architecture](./ARCHITECTURE.md#section-colors-musicts) for the full color table.

### Tailwind v4

The project uses Tailwind CSS v4 with the `@theme inline` directive. Custom colors are available as Tailwind utilities:
```html
<div class="bg-card text-foreground border-border">
<span class="text-accent">
<p class="text-muted">
```

## Known Limitations

- **No backend**: All data is in localStorage. Clearing browser data deletes everything.
- **No sync**: Data doesn't sync across devices or browsers.
- **No test suite**: Changes should be verified manually and via `npm run build`.
- **No undo**: Edits to songs are immediate. There's no undo/redo system.
- **Single user**: No authentication or multi-user support.
- **Chord diagram coverage**: Only common chord suffixes have voicings in the database.

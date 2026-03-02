# Jamshelf Documentation

Jamshelf is a client-side chord sheet manager for musicians. It stores songs in [ChordPro](https://www.chordpro.org/) format, provides real-time transposition, chord diagrams, a metronome, auto-scroll, and AI-powered chord sheet import via Google Gemini.

## Features

- **Song library** with search, star ratings, and favorites
- **Live transposition** with sharp/flat toggle and capo support
- **Guitar and piano chord diagrams** rendered from a built-in voicing database
- **Edit mode** for positional chord editing (move, rename, insert, delete)
- **Setlists** with drag-to-reorder
- **Auto-scroll** with adjustable speed
- **Web Audio metronome** synced to song tempo
- **AI import** via Gemini 2.0 Flash (paste raw chords, get ChordPro)
- **Offline-capable** with all data in localStorage

## Quick Start

```bash
git clone <repo-url> jamshelf
cd jamshelf
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech Stack

| Layer          | Technology                        |
| -------------- | --------------------------------- |
| Framework      | Next.js 16 (App Router)          |
| UI             | React 19                          |
| Language       | TypeScript 5                      |
| Styling        | Tailwind CSS v4                   |
| State          | Zustand 5 (persisted to localStorage) |
| Fonts          | DM Sans, JetBrains Mono, Syne    |
| AI Integration | Google Gemini 2.0 Flash (client-side) |

## Project Structure

```
jamshelf/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, dark theme)
│   ├── page.tsx                  # Home — song library with tabs
│   ├── add-song/page.tsx         # Add song (manual or AI import)
│   ├── song/[id]/page.tsx        # Song viewer with controls
│   └── setlists/[id]/page.tsx    # Setlist viewer
├── components/
│   ├── chord-sheet/              # ChordSheet, ChordLine, SectionBlock, ChordBadge, EditChordOverlay
│   ├── chord-diagrams/           # ChordPanel, GuitarChordDiagram, PianoChordDiagram
│   ├── metronome/                # Web Audio API metronome
│   └── song-list/                # SongCard
├── lib/
│   ├── types/                    # TypeScript interfaces (song.ts, chord.ts)
│   ├── stores/                   # Zustand stores (song, player, setlist)
│   ├── utils/                    # ChordPro parser, music theory, chord editing, AI import, chord lookup
│   └── data/                     # Default songs, guitar chord voicing DB
├── public/                       # Static assets
├── scripts/                      # Build/seed scripts
├── docs/                         # This documentation
├── CLAUDE.md                     # AI assistant instructions
└── PLANNING.md                   # Feature roadmap
```

## NPM Scripts

| Command         | Description                |
| --------------- | -------------------------- |
| `npm run dev`   | Start Next.js dev server   |
| `npm run build` | Production build           |
| `npm run start` | Start production server    |
| `npm run lint`  | Run ESLint                 |

No test framework is currently configured.

## Documentation Index

| Document | Description |
| -------- | ----------- |
| [Architecture](./ARCHITECTURE.md) | Data model, stores, routes, components, algorithms, and design system |
| [Gemini Integration](./GEMINI-INTEGRATION.md) | AI import setup, API format, prompt engineering, and error handling |
| [Runbook](./RUNBOOK.md) | Deployment, data management, and troubleshooting |
| [Onboarding](./ONBOARDING.md) | New contributor guide with setup, workflows, and common tasks |

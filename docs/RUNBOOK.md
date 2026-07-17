# Runbook

## Environment Variables

Jamshelf reads all configuration from environment variables — see `.env.example` for the full list with descriptions. For local development:

```bash
cp .env.example .env
# fill in real values in .env — it's gitignored, never commit it
```

Next.js loads `.env` automatically for `npm run dev`/`build`/`start`. Standalone scripts (`scripts/seed-songs-batch.mjs`, `scripts/build-default-songs.mjs`) load it the same way via `@next/env`. In deployed environments (Vercel, Cloud Run, etc.), set the same variables in the platform's environment configuration instead of shipping a `.env` file.

Only `GOOGLE_CLOUD_PROJECT` is required (Firestore/Cloud Storage persistence and the Gemini/Vertex AI import feature); Spotify matching (`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`) is optional and silently skipped if unset. See `docs/GEMINI-INTEGRATION.md` and `docs/SPOTIFY-INTEGRATION.md` for setup details on each.

## Deployment

### Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Configure the environment variables from `.env.example` in the Vercel project settings
4. Deploy

Gemini/Vertex AI auth uses Application Default Credentials — on platforms other than GCP, this typically means attaching a service account key via `GOOGLE_APPLICATION_CREDENTIALS`, since there's no ambient metadata-server identity to fall back on.

### Manual / Self-Hosted

```bash
# Build
npm run build

# Start production server
npm run start
```

The production server runs on port 3000 by default. Use a reverse proxy (nginx, Caddy) to serve it behind HTTPS.

## Build Verification

```bash
# Type check + build
npm run build

# Lint
npm run lint
```

No test framework is configured. Verification relies on the TypeScript compiler and ESLint.

## Data Management

### localStorage Keys

| Key | Store | Content |
| --- | ----- | ------- |
| `jamshelf-songs` | song-store | `{ state: { entries: ChordProEntry[] }, version: 0 }` |
| `jamshelf-setlists` | setlist-store | `{ state: { setlists: Setlist[] }, version: 0 }` |

The player-store is not persisted — it resets on page reload.

### Backup

**Via Browser DevTools**:
```javascript
// Export all song data
copy(localStorage.getItem('jamshelf-songs'));

// Export all setlist data
copy(localStorage.getItem('jamshelf-setlists'));
```

**Via App UI**: The song store provides `exportAll()` which returns all songs as `---`-separated ChordPro text.

### Restore

**Via Browser DevTools**:
```javascript
// Restore songs (paste the JSON string from backup)
localStorage.setItem('jamshelf-songs', '<paste backup here>');

// Reload the page to pick up changes
location.reload();
```

**Via App UI**: The song store provides `importEntries(text)` which accepts `---`-separated ChordPro text and returns the number of songs imported.

### Data Reset

To clear all app data:
```javascript
localStorage.removeItem('jamshelf-songs');
localStorage.removeItem('jamshelf-setlists');
location.reload();
```

After clearing, the app reloads with the default songs from `lib/data/default-songs.ts`.

## Troubleshooting

### Songs not appearing after import

**Symptom**: Imported songs via AI or manual entry don't show in the library.

**Cause**: Song ID collision — a song with the same derived ID already exists.

**Fix**: Song IDs are derived from titles: `song-` + slugified title. If two songs have the same title, the second import silently appends to the entries array but may not be distinguishable. Rename one song's `{title:}` directive to make it unique.

### Corrupted localStorage

**Symptom**: App crashes on load with a JSON parse error, or shows no songs.

**Fix**:
```javascript
// Check if data is parseable
JSON.parse(localStorage.getItem('jamshelf-songs'));

// If it throws, clear and reload
localStorage.removeItem('jamshelf-songs');
location.reload();
```

### Auto-scroll not working

**Symptom**: Toggling auto-scroll does nothing.

**Possible causes**:
1. **Edit mode is active** — entering edit mode disables auto-scroll. Exit edit mode first.
2. **Speed is 0** — increase the scroll speed using the speed control.
3. **Page too short** — auto-scroll only works if the content overflows the viewport.

### Capo not transposing chords

**Symptom**: Setting capo doesn't change displayed chords.

**How it works**: Capo affects transposition. `ChordBadge` transposes by `transpose + capo`. If the song's `{capo:}` directive is set, it's synced to the player store on page load. Check that:
1. The `{capo:}` directive exists in the song's ChordPro text
2. The capo value in the player controls matches expectations

### Gemini API errors

See the error table in [Gemini Integration](./GEMINI-INTEGRATION.md#error-handling).

**Common fixes**:
- **400/403**: Check that the API key is valid and has the Generative Language API enabled
- **429**: Wait a moment and retry — free-tier keys have rate limits
- **No response**: The raw text may be too short or not recognizable as a chord sheet

### Chord diagrams not showing

**Symptom**: Tapping a chord doesn't show guitar/piano diagrams.

**Cause**: The chord suffix isn't in the lookup table. The app supports these suffixes:

```
major, minor, 7, m7, maj7, dim, sus2, sus4, aug, 6, 9,
add9, m9, 11, 13, m6, 7sus4, m7b5, mmaj7
```

Chords with other suffixes (e.g., `add11`, `7#9`) will show an empty diagram panel.

## Performance Notes

- **Parsing is on-demand**: `getSong()` and `getSongs()` parse ChordPro text on every call. For large libraries (100+ songs), the home page may feel sluggish.
- **Guitar voicing database**: `lib/data/guitar-db.ts` is a large JSON object loaded at import time. It's bundled into the client JS.
- **No virtualization**: The song list and chord sheet render all items. Very long songs (50+ sections) may impact scroll performance.
- **localStorage limits**: Browsers typically allow 5-10 MB per origin. A typical song is ~1 KB of ChordPro text, so the practical limit is thousands of songs.

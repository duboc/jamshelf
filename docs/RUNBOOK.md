# Runbook

## Deployment

### Vercel (Recommended)

Jamshelf is a standard Next.js app with no backend dependencies. Vercel provides zero-config deployment:

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Deploy — no environment variables required

The app has no server-side data dependencies, so every deployment is self-contained.

### Manual / Self-Hosted

```bash
# Build
npm run build

# Start production server
npm run start
```

The production server runs on port 3000 by default. Use a reverse proxy (nginx, Caddy) to serve it behind HTTPS.

### Static Export

Since the app is fully client-side, you can also export it as static HTML:

```bash
# Add to next.config.ts: output: 'export'
npm run build
# Serve the 'out/' directory with any static file server
```

Note: Static export requires configuring `next.config.ts` with `output: 'export'` and may need `trailingSlash: true` for dynamic routes.

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

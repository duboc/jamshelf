# Spotify Integration

## Overview

Jamshelf can attach a real Spotify track to a song when it's added, so the song viewer can show Spotify's own embedded player — a free 30-second preview for anyone, and a one-tap handoff into the visitor's own Spotify account for full playback. The integration is server-side via `/api/spotify/search`, using Spotify's Client Credentials flow (app-level access, no user login).

## Setup & Configuration

1. Create a free app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Copy its Client ID and Client Secret into `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` in your `.env` file — see `.env.example` at the repo root.

If these aren't set, Spotify matching is silently skipped — adding songs still works exactly as before.

## User Flow

1. Navigate to `/add-song` and process a chord sheet as usual.
2. Once the preview appears, Jamshelf automatically searches Spotify for `{title} {artist}` and shows up to 5 candidate tracks (album art, name, artist).
3. Pick the correct match (or "No match" to skip).
4. Click "Add to Library" — the chosen track's Spotify ID is saved as a `{spotify: <id>}` ChordPro directive alongside the song.
5. In the song viewer, a "🎵 Preview" button appears in the header whenever a song has a Spotify match — tapping it reveals the embedded Spotify player.

## API Endpoint Reference

**Endpoint**:
```
GET /api/spotify/search?q=<query>
```

**Response Body (Success)**:
```json
{
  "results": [
    { "id": "3n3Ppam7vgaVa1iaRUc9Lp", "name": "Track Name", "artist": "Artist Name", "albumArt": "https://...", "spotifyUrl": "https://open.spotify.com/track/..." }
  ]
}
```

**Response Body (not configured / upstream error)** — still `200 OK`, since this is an optional enhancement that should never block adding a song:
```json
{ "results": [], "error": "Spotify not configured: missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET" }
```

## Security Considerations

- **Server-side Credentials**: `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` never reach the browser — only used inside `lib/spotify.ts`, called from the `/api/spotify/search` route handler.
- **Scope**: Client Credentials tokens are app-level (catalog search only) — no user data, no playback control, no ability to act on a listener's account.

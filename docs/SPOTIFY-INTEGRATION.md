# Spotify Integration

## Overview

Jamshelf can attach a real Spotify track to a song when it's added or from the song viewer, giving musicians two playback options:

1. **Custom Web Playback SDK player (full track)** — authenticates the listener's Spotify Premium account via OAuth 2.0 Authorization Code flow and streams the full track directly in the browser with Play/Pause, seek bar, `-10s` / `+10s` jumps, **A-B loop** rehearsal markers, and volume controls.
2. **Simple Spotify Embed fallback** — a zero-login embedded player (30-second preview for visitors, or full track handoff into the listener's Spotify app), always 1 click away.

Track matching is server-side via `/api/spotify/search` using Spotify's Client Credentials flow.

## Setup & Configuration

For step-by-step instructions on creating a Spotify app, obtaining `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`, registering `127.0.0.1` Redirect URIs, and configuring Development Mode users, see:

- **[Spotify Web Playback SDK Setup](./SPOTIFY-WEB-PLAYBACK-SETUP.md)**

If `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` aren't set, Spotify matching is silently skipped — adding songs still works exactly as before, and tracks linked manually with `{spotify: <id>}` can still play via the simple embed.

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

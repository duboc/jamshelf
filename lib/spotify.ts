export interface SpotifyTrackResult {
  id: string;
  name: string;
  artist: string;
  albumArt: string | null;
  spotifyUrl: string;
  durationMs: number | null;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Spotify not configured: missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    // Refresh a minute early to avoid using a token that expires mid-request.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

export async function searchSpotifyTrack(query: string, limit = 5): Promise<SpotifyTrackResult[]> {
  const token = await getSpotifyToken();

  const url = `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Spotify search failed: ${res.status}`);
  }

  const data = await res.json();
  const items: unknown[] = data?.tracks?.items ?? [];

  return items.map((item) => {
    const track = item as {
      id: string;
      name: string;
      artists: { name: string }[];
      album?: { images?: { url: string }[] };
      external_urls?: { spotify?: string };
      duration_ms?: number;
    };
    return {
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(', '),
      albumArt: track.album?.images?.[0]?.url ?? null,
      spotifyUrl: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
      durationMs: typeof track.duration_ms === 'number' && track.duration_ms > 0 ? track.duration_ms : null,
    };
  });
}

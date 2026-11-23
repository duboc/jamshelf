import type { NextRequest, NextResponse } from 'next/server';
import type { SpotifyUserProfile } from '@/lib/types/spotify-sdk';

export const SPOTIFY_SCOPES =
  'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';

export const SP_COOKIE_ACCESS = 'jamshelf_sp_at';
export const SP_COOKIE_REFRESH = 'jamshelf_sp_rt';
export const SP_COOKIE_EXPIRES = 'jamshelf_sp_exp';
export const SP_COOKIE_USER = 'jamshelf_sp_user';
export const SP_COOKIE_OAUTH = 'jamshelf_sp_oauth';

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

interface SpotifyTokenPayload {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

let cachedToken: CachedToken | null = null;

function getSpotifyCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Spotify not configured: missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET');
  }
  return { clientId, clientSecret };
}

async function requestSpotifyToken(params: Record<string, string>): Promise<SpotifyTokenPayload> {
  const { clientId, clientSecret } = getSpotifyCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }

  return res.json() as Promise<SpotifyTokenPayload>;
}

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const data = await requestSpotifyToken({ grant_type: 'client_credentials' });
  cachedToken = {
    token: data.access_token,
    // Refresh a minute early to avoid using a token that expires mid-request.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

/**
 * Resolves the external request origin from `Host` / `X-Forwarded-*` headers because
 * `request.nextUrl` in Next.js dev server normalizes `127.0.0.1` to `localhost`.
 */
export function getRequestOrigin(request: NextRequest): URL {
  const rawHost =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host')?.trim() ||
    request.nextUrl.host;
  const rawProto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    request.nextUrl.protocol.replace(/:$/, '') ||
    'http';
  return new URL(`${rawProto}://${rawHost}`);
}

/**
 * Resolves the Spotify OAuth callback URL. Spotify rejects `localhost` redirect URIs
 * and requires loopback IPs (`127.0.0.1`), so localhost is rewritten automatically
 * unless `SPOTIFY_REDIRECT_URI` overrides it.
 */
export function resolveSpotifyRedirectUri(requestUrl: URL): string {
  const configured = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (configured) return configured;

  const host =
    requestUrl.hostname === 'localhost'
      ? requestUrl.port
        ? `127.0.0.1:${requestUrl.port}`
        : '127.0.0.1'
      : requestUrl.host;
  return `${requestUrl.protocol}//${host}/api/spotify/callback`;
}

/** Restricts post-login redirects to same-origin relative paths. */
export function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/';
  }
  return raw;
}

function toTokenResult(data: SpotifyTokenPayload): {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
} {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in,
  };
}

export async function exchangeSpotifyAuthCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const data = await requestSpotifyToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  return toTokenResult(data);
}

export async function refreshSpotifyUserToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const data = await requestSpotifyToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return toTokenResult(data);
}

export function buildSpotifyReturnUrl(
  origin: string,
  returnTo: string,
  paramKey: string,
  paramValue: string
): URL {
  const target = new URL(sanitizeReturnTo(returnTo), origin);
  target.searchParams.set(paramKey, paramValue);
  return target;
}

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function spotifyCookieOptions(isSecure: boolean, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: isSecure,
    maxAge,
  };
}

export function applySpotifyTokenCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string | null; expiresIn: number },
  isSecure: boolean,
  profile?: SpotifyUserProfile
): number {
  const expiresAt = Date.now() + tokens.expiresIn * 1000;
  const opts = spotifyCookieOptions(isSecure, SESSION_MAX_AGE_SEC);
  res.cookies.set(SP_COOKIE_ACCESS, tokens.accessToken, opts);
  res.cookies.set(SP_COOKIE_EXPIRES, String(expiresAt), opts);
  if (tokens.refreshToken) {
    res.cookies.set(SP_COOKIE_REFRESH, tokens.refreshToken, opts);
  }
  if (profile) {
    res.cookies.set(SP_COOKIE_USER, JSON.stringify(profile), opts);
  }
  return expiresAt;
}

export function clearSpotifySessionCookies(res: NextResponse, includeOauth = false) {
  const names = [SP_COOKIE_ACCESS, SP_COOKIE_REFRESH, SP_COOKIE_EXPIRES, SP_COOKIE_USER];
  if (includeOauth) names.push(SP_COOKIE_OAUTH);
  for (const name of names) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
}

export async function fetchSpotifyUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { displayName: null, product: null };
    const data = (await res.json()) as { display_name?: string | null; product?: string | null };
    return {
      displayName: data.display_name ?? null,
      product: data.product ?? null,
    };
  } catch {
    return { displayName: null, product: null };
  }
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

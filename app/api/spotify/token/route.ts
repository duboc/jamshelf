import { NextRequest, NextResponse } from 'next/server';
import type { SpotifyUserProfile } from '@/lib/types/spotify-sdk';
import {
  SP_COOKIE_ACCESS,
  SP_COOKIE_EXPIRES,
  SP_COOKIE_REFRESH,
  SP_COOKIE_USER,
  applySpotifyTokenCookies,
  clearSpotifySessionCookies,
  getRequestOrigin,
  refreshSpotifyUserToken,
} from '@/lib/spotify';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function parseUserCookie(raw: string | undefined): SpotifyUserProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SpotifyUserProfile>;
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
      product: typeof parsed.product === 'string' ? parsed.product : null,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(SP_COOKIE_ACCESS)?.value || null;
  const refreshToken = request.cookies.get(SP_COOKIE_REFRESH)?.value || null;
  const expiresAtRaw = request.cookies.get(SP_COOKIE_EXPIRES)?.value;
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : 0;
  const user = parseUserCookie(request.cookies.get(SP_COOKIE_USER)?.value);

  if (accessToken && Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
    return NextResponse.json(
      { authenticated: true, accessToken, expiresAt, user },
      { headers: NO_STORE_HEADERS }
    );
  }

  if (refreshToken) {
    try {
      const tokens = await refreshSpotifyUserToken(refreshToken);
      const nextExpiresAt = Date.now() + tokens.expiresIn * 1000;
      const isSecure = getRequestOrigin(request).protocol === 'https:';

      const res = NextResponse.json(
        { authenticated: true, accessToken: tokens.accessToken, expiresAt: nextExpiresAt, user },
        { headers: NO_STORE_HEADERS }
      );
      applySpotifyTokenCookies(res, tokens, isSecure);
      return res;
    } catch (err) {
      console.error('Spotify token refresh failed:', err);
      const res = NextResponse.json(
        { authenticated: false, error: 'session_expired' },
        { headers: NO_STORE_HEADERS }
      );
      clearSpotifySessionCookies(res);
      return res;
    }
  }

  return NextResponse.json({ authenticated: false }, { headers: NO_STORE_HEADERS });
}

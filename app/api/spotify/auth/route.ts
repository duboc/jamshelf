import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  SP_COOKIE_OAUTH,
  SPOTIFY_SCOPES,
  buildSpotifyReturnUrl,
  getRequestOrigin,
  resolveSpotifyRedirectUri,
  sanitizeReturnTo,
  spotifyCookieOptions,
} from '@/lib/spotify';

export async function GET(request: NextRequest) {
  const requestOrigin = getRequestOrigin(request);
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      buildSpotifyReturnUrl(requestOrigin.origin, returnTo, 'spotify_error', 'not_configured')
    );
  }

  const redirectUri = resolveSpotifyRedirectUri(requestOrigin);
  const parsedRedirect = new URL(redirectUri);

  // Spotify forbids `localhost` redirect URIs; bounce to `127.0.0.1` before setting the OAuth cookie
  // so the state cookie and session cookies share the exact callback host.
  if (requestOrigin.hostname === 'localhost' && parsedRedirect.host !== requestOrigin.host) {
    const alignedUrl = `${parsedRedirect.origin}/api/spotify/auth?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(alignedUrl, 307);
  }

  const state = crypto.randomBytes(16).toString('hex');
  const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('scope', SPOTIFY_SCOPES);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);

  const isSecure = requestOrigin.protocol === 'https:';

  const res = NextResponse.redirect(authorizeUrl.toString(), 302);
  res.cookies.set(
    SP_COOKIE_OAUTH,
    JSON.stringify({ state, returnTo }),
    spotifyCookieOptions(isSecure, 600)
  );
  return res;
}

import { NextRequest, NextResponse } from 'next/server';
import {
  SP_COOKIE_OAUTH,
  applySpotifyTokenCookies,
  buildSpotifyReturnUrl,
  exchangeSpotifyAuthCode,
  fetchSpotifyUserProfile,
  getRequestOrigin,
  resolveSpotifyRedirectUri,
  sanitizeReturnTo,
} from '@/lib/spotify';

export async function GET(request: NextRequest) {
  const requestOrigin = getRequestOrigin(request);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');

  let expectedState: string | null = null;
  let returnTo = '/';

  const rawOauthCookie = request.cookies.get(SP_COOKIE_OAUTH)?.value;
  if (rawOauthCookie) {
    try {
      const parsed = JSON.parse(rawOauthCookie) as { state?: string; returnTo?: string };
      expectedState = typeof parsed.state === 'string' ? parsed.state : null;
      returnTo = sanitizeReturnTo(typeof parsed.returnTo === 'string' ? parsed.returnTo : null);
    } catch {
      expectedState = null;
      returnTo = '/';
    }
  }

  const redirectWithParam = (paramKey: string, paramValue: string) => {
    const res = NextResponse.redirect(
      buildSpotifyReturnUrl(requestOrigin.origin, returnTo, paramKey, paramValue)
    );
    res.cookies.set(SP_COOKIE_OAUTH, '', { path: '/', maxAge: 0 });
    return res;
  };

  if (error) {
    return redirectWithParam('spotify_error', error);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithParam('spotify_error', 'invalid_state');
  }

  try {
    const redirectUri = resolveSpotifyRedirectUri(requestOrigin);
    const tokens = await exchangeSpotifyAuthCode(code, redirectUri);
    const profile = await fetchSpotifyUserProfile(tokens.accessToken);
    const isSecure = requestOrigin.protocol === 'https:';

    const res = redirectWithParam('spotify_open', '1');
    applySpotifyTokenCookies(res, tokens, isSecure, profile);
    return res;
  } catch (err) {
    console.error('Spotify OAuth token exchange failed:', err);
    return redirectWithParam('spotify_error', 'token_exchange_failed');
  }
}

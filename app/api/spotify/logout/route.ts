import { NextResponse } from 'next/server';
import { clearSpotifySessionCookies } from '@/lib/spotify';

export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  clearSpotifySessionCookies(res, true);
  return res;
}

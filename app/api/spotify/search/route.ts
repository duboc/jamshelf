import { NextResponse } from 'next/server';
import { searchSpotifyTrack } from '@/lib/spotify';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q || !q.trim()) {
    return NextResponse.json({ error: 'Missing required query param q' }, { status: 400 });
  }

  try {
    const results = await searchSpotifyTrack(q.trim());
    return NextResponse.json({ results });
  } catch (error: unknown) {
    // Optional feature — never a hard failure for the caller.
    console.error('Spotify search unavailable:', error);
    const msg = error instanceof Error ? error.message : 'Spotify search failed';
    return NextResponse.json({ results: [], error: msg });
  }
}

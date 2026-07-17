import { NextResponse } from 'next/server';
import { getDb } from '@/lib/gcp';
import { DEFAULT_LIVE_SESSION, type LiveSession } from '@/lib/types/live-session';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await getDb().collection('liveSessions').doc(id).get();
    const session: LiveSession = { ...DEFAULT_LIVE_SESSION, ...doc.data() };
    return NextResponse.json(session);
  } catch (error: unknown) {
    console.error('Error fetching live session:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch live session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates: Partial<LiveSession> = await request.json();

    await getDb().collection('liveSessions').doc(id).set(updates, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating live session:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update live session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await getDb().collection('liveSessions').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting live session:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete live session';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

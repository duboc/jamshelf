import { NextResponse } from 'next/server';
import { getDb } from '@/lib/gcp';
import { DEFAULT_LIVE_SESSION, type LiveSession } from '@/lib/types/live-session';

// Active leaders heartbeat every 1.5s; clear abandoned sessions after 90s idle.
const LEADER_TTL_MS = 90_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await getDb().collection('liveSessions').doc(id).get();
    const session: LiveSession = { ...DEFAULT_LIVE_SESSION, ...doc.data() };
    const isExpired =
      Boolean(session.leaderId) &&
      (!session.updatedAt || Date.now() - session.updatedAt > LEADER_TTL_MS);

    if (isExpired) {
      return NextResponse.json({
        ...DEFAULT_LIVE_SESSION,
        updatedAt: session.updatedAt,
      });
    }

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

    await getDb()
      .collection('liveSessions')
      .doc(id)
      .set({ ...updates, updatedAt: Date.now() }, { merge: true });

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

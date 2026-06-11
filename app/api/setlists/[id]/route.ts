import { NextResponse } from 'next/server';
import { db } from '@/lib/gcp';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.songIds !== undefined) updates.songIds = body.songIds;

    await db.collection('setlists').doc(id).set(updates, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating setlist:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update setlist';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.collection('setlists').doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting setlist:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete setlist';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

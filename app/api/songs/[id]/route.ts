import { NextResponse } from 'next/server';
import { db, getSongsBucket } from '@/lib/gcp';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'Missing text content' }, { status: 400 });
    }

    // Update in Firestore
    await db.collection('songs').doc(id).set({
      text,
      updatedAt: new Date(),
    }, { merge: true });

    // Update in GCS bucket
    const bucket = getSongsBucket();
    const file = bucket.file(`songs/${id}.cho`);
    await file.save(text, {
      contentType: 'text/plain',
      metadata: {
        cacheControl: 'no-cache',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error updating song:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update song';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete from Firestore
    await db.collection('songs').doc(id).delete();

    // Delete from GCS bucket
    const bucket = getSongsBucket();
    const file = bucket.file(`songs/${id}.cho`);
    await file.delete({ ignoreNotFound: true });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting song:', error);
    const msg = error instanceof Error ? error.message : 'Failed to delete song';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

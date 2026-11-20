import { NextResponse } from 'next/server';
import { getDb } from '@/lib/gcp';
import { sanitizeSongAnnotations } from '@/lib/types/annotations';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await getDb().collection('song_annotations').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({
        songId: id,
        strokes: [],
        notes: [],
        updatedAt: 0,
      });
    }
    const clean = sanitizeSongAnnotations(id, doc.data());
    return NextResponse.json(clean);
  } catch (error: unknown) {
    console.error('Error fetching song annotations:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch annotations';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const clean = sanitizeSongAnnotations(id, body);
    const writtenUpdatedAt = clean.updatedAt || Date.now();
    const db = getDb();
    const ref = db.collection('song_annotations').doc(id);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existingUpdatedAt = snap.exists ? Number(snap.data()?.updatedAt ?? 0) : 0;
      if (Number.isFinite(existingUpdatedAt) && existingUpdatedAt > writtenUpdatedAt) {
        return { stale: true, updatedAt: existingUpdatedAt };
      }
      tx.set(ref, {
        strokes: clean.strokes,
        notes: clean.notes,
        updatedAt: writtenUpdatedAt,
      });
      return { stale: false, updatedAt: writtenUpdatedAt };
    });

    return NextResponse.json({
      success: true,
      stale: result.stale,
      updatedAt: result.updatedAt,
    });
  } catch (error: unknown) {
    console.error('Error saving song annotations:', error);
    const msg = error instanceof Error ? error.message : 'Failed to save annotations';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

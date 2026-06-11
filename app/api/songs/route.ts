import { NextResponse } from 'next/server';
import { db, getSongsBucket } from '@/lib/gcp';

export async function GET() {
  try {
    const snapshot = await db.collection('songs').get();
    const entries = snapshot.docs.map(doc => ({
      id: doc.id,
      text: doc.data().text || '',
    }));
    return NextResponse.json(entries);
  } catch (error: unknown) {
    console.error('Error fetching songs:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch songs';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { id, text } = await request.json();

    if (!id || !text) {
      return NextResponse.json(
        { error: 'Missing required fields id or text' },
        { status: 400 }
      );
    }

    // Save to Firestore
    await db.collection('songs').doc(id).set({
      text,
      updatedAt: new Date(),
    });

    // Save to Storage bucket
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
    console.error('Error saving song:', error);
    const msg = error instanceof Error ? error.message : 'Failed to save song';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

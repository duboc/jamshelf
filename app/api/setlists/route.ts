import { NextResponse } from 'next/server';
import { db } from '@/lib/gcp';

export async function GET() {
  try {
    const snapshot = await db.collection('setlists').orderBy('createdAt', 'asc').get();
    const setlists = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || '',
      songIds: doc.data().songIds || [],
      createdAt: doc.data().createdAt || Date.now(),
    }));
    return NextResponse.json(setlists);
  } catch (error: unknown) {
    console.error('Error fetching setlists:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch setlists';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { id, name, songIds, createdAt } = await request.json();

    if (!id || !name) {
      return NextResponse.json(
        { error: 'Missing required fields id or name' },
        { status: 400 }
      );
    }

    await db.collection('setlists').doc(id).set({
      name,
      songIds: songIds || [],
      createdAt: createdAt || Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error creating setlist:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create setlist';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

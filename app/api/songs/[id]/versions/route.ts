import { NextResponse } from 'next/server';
import { getDb } from '@/lib/gcp';

function computePreview(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('{') && !l.startsWith('['));
  return (line || '').slice(0, 60);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const snapshot = await getDb()
      .collection('songs')
      .doc(id)
      .collection('versions')
      .orderBy('createdAt', 'desc')
      .get();

    const versions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        versionId: doc.id,
        createdAt: data.createdAt,
        preview: computePreview(data.text || ''),
      };
    });

    return NextResponse.json(versions);
  } catch (error: unknown) {
    console.error('Error fetching versions:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch versions';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const createdAt = Date.now();
    const ref = await getDb()
      .collection('songs')
      .doc(id)
      .collection('versions')
      .add({ text, createdAt });

    return NextResponse.json({ versionId: ref.id, createdAt });
  } catch (error: unknown) {
    console.error('Error creating version:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create version';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

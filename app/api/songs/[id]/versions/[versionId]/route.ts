import { NextResponse } from 'next/server';
import { getDb } from '@/lib/gcp';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const doc = await getDb()
      .collection('songs')
      .doc(id)
      .collection('versions')
      .doc(versionId)
      .get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json({ text: doc.data()?.text || '' });
  } catch (error: unknown) {
    console.error('Error fetching version:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch version';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

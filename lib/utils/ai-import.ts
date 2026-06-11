import type { ChordProEntry } from '@/lib/types/song';

export async function processWithGemini(rawText: string): Promise<ChordProEntry> {
  const res = await fetch('/api/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'AI processing error: ' + res.status);
  }

  const data = await res.json();
  if (!data.id || !data.text) {
    throw new Error('Invalid response from AI import service');
  }

  return data;
}

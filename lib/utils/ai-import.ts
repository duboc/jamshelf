import type { ChordProEntry } from '@/lib/types/song';

export async function processWithGemini(
  rawText: string,
  options?: { signal?: AbortSignal; forcePaste?: boolean }
): Promise<ChordProEntry> {
  const res = await fetch('/api/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, forcePaste: options?.forcePaste }),
    signal: options?.signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Não foi possível processar a cifra agora (erro ${res.status}).`
    );
  }

  const data = await res.json();
  if (!data.id || !data.text) {
    throw new Error('A resposta do processamento veio incompleta. Tente novamente.');
  }

  return data;
}

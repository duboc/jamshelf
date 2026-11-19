'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useSongStore } from '@/lib/stores/song-store';
import { useLiveSessionStatus } from '@/lib/stores/live-session-store';
import { usePointerReorder, moveItem } from '@/lib/hooks/use-pointer-reorder';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

export default function SetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { setlists, renameSetlist, removeSongFromSetlist, reorderSong, addSongToSetlist } = useSetlistStore();
  const entries = useSongStore((s) => s.entries);
  const { getSongs } = useSongStore();
  const liveStatus = useLiveSessionStatus(id);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [showAddSong, setShowAddSong] = useState(false);
  const [search, setSearch] = useState('');

  const setlist = setlists.find((sl) => sl.id === id);

  const allSongs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  // Keep the index into songIds alongside each song so reordering still
  // targets the right store slot if songIds contains deleted song IDs.
  const baseEntries = useMemo(
    () =>
      (setlist?.songIds ?? [])
        .map((sid, storeIdx) => ({ song: allSongs.find((s) => s.id === sid), storeIdx }))
        .filter(
          (e): e is { song: (typeof allSongs)[number]; storeIdx: number } => e.song !== undefined
        ),
    [setlist?.songIds, allSongs]
  );

  const { drag, getHandleProps } = usePointerReorder({
    onReorder: (from, to) =>
      reorderSong(id, baseEntries[from].storeIdx, baseEntries[to].storeIdx),
  });

  if (!setlist) {
    return (
      <div className="flex-1 flex flex-col">
        <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Setlists', href: '/?tab=setlists' }, { label: 'Não encontrado' }]} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-[var(--muted)]">Esse setlist não foi encontrado.</p>
          <button
            type="button"
            onClick={() => router.push('/?tab=setlists')}
            className="pill-btn px-4 py-2 text-xs"
          >
            Voltar para Setlists
          </button>
        </div>
      </div>
    );
  }

  const displayEntries = drag ? moveItem(baseEntries, drag.from, drag.to) : baseEntries;
  const setlistSongs = displayEntries.map((e) => e.song);

  // Join an in-progress show on the leader's actual song, not always song 1.
  const startSongId =
    (liveStatus.leaderId && liveStatus.currentSongId) || setlistSongs[0]?.id || null;

  const notInSetlist = allSongs.filter((s) => !setlist.songIds.includes(s.id));
  const filtered = notInSetlist.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.displayKey.toLowerCase().includes(q)
    );
  });

  const startRename = () => {
    setNameInput(setlist.name);
    setEditingName(true);
  };

  const commitRename = () => {
    if (nameInput.trim()) renameSetlist(id, nameInput.trim());
    setEditingName(false);
  };

  return (
    <div className="flex-1 flex flex-col">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Setlists', href: '/?tab=setlists' },
          { label: setlist.name },
        ]}
        rightSlot={
          liveStatus.leaderId ? (
            <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec)] animate-pulse" />
              {liveStatus.leaderName} ao vivo
            </span>
          ) : undefined
        }
      />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header */}
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="eyebrow">Setlist · toque no nome para renomear</div>
            <div className="flex items-baseline gap-3 flex-wrap">
              {editingName ? (
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  className="font-display text-3xl bg-transparent border-b-2 border-[var(--accent)] outline-none text-[var(--ink)] min-w-[200px]"
                />
              ) : (
                <h1
                  className="font-display text-3xl sm:text-4xl text-[var(--ink)] cursor-pointer hover:text-[var(--accent-ink)] transition-colors leading-tight"
                  title="Clique para renomear"
                  onClick={startRename}
                >
                  {setlist.name}
                </h1>
              )}
              <span className="font-mono text-xs text-[var(--muted)]">
                {setlistSongs.length} {setlistSongs.length === 1 ? 'música' : 'músicas'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => startSongId && router.push(`/song/${startSongId}?setlist=${id}&show=1`)}
              disabled={!startSongId}
              title={
                !startSongId
                  ? 'Adicione uma música primeiro'
                  : 'Abrir visão de palco focada com deslize entre músicas'
              }
              className="pill-btn pill-btn-rec px-4 py-2 text-xs"
            >
              ▶ Modo Show
            </button>
            <button
              type="button"
              onClick={() => setShowAddSong((v) => !v)}
              className="pill-btn pill-btn-primary px-4 py-2 text-xs"
            >
              {showAddSong ? 'Fechar lista' : '+ Adicionar música'}
            </button>
          </div>
        </section>

        {/* Add song picker */}
        {showAddSong && (
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">Adicionar do repertório</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddSong(false);
                  setSearch('');
                }}
                className="text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
              >
                Concluir
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Buscar música ou artista para incluir..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="studio-input w-full px-3.5 py-2 text-sm"
            />
            <div className="max-h-60 overflow-y-auto divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {filtered.length === 0 ? (
                <div className="text-center py-6 text-[var(--muted)] text-sm">
                  {notInSetlist.length === 0
                    ? 'Todas as músicas do repertório já estão neste setlist.'
                    : 'Nenhuma música encontrada.'}
                </div>
              ) : (
                filtered.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => {
                      addSongToSetlist(id, song.id);
                      setSearch('');
                    }}
                    className="w-full flex items-center justify-between gap-3 px-2 py-2.5 hover:bg-[var(--surface2)]/60 transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--ink)] truncate">{song.title}</div>
                      <div className="text-xs text-[var(--muted)] truncate">
                        {song.artist || 'Artista não informado'}
                        {song.displayKey ? ` · ${song.displayKey}` : ''}
                      </div>
                    </div>
                    <span className="pill-btn px-2.5 py-1 text-xs text-[var(--accent-ink)]">+ Incluir</span>
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        {/* Ordered song list */}
        <section>
          {setlistSongs.length === 0 ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Nenhuma música neste setlist ainda. Toque em &ldquo;+ Adicionar música&rdquo; para montar a sequência.
              </p>
              <button
                type="button"
                onClick={() => setShowAddSong(true)}
                className="pill-btn pill-btn-primary px-4 py-2 text-xs"
              >
                + Adicionar música
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-mono text-[11px] text-[var(--muted)] pb-2">
                Arraste pelo ícone ⠿ para mudar a ordem · toque em uma música para abrir no contexto do setlist.
              </p>
              <div className="border-t border-[var(--line)]">
                {setlistSongs.map((song, idx) => (
                  <div
                    key={song.id}
                    data-display-idx={idx}
                    className={`group flex items-center gap-3 py-3 px-2 sm:px-3 border-b border-[var(--line)] transition-colors ${
                      drag !== null && drag.to === idx
                        ? 'bg-[var(--surface2)] ring-1 ring-[var(--accent)] rounded-xl'
                        : 'hover:bg-[var(--surface2)]/45'
                    }`}
                  >
                    {/* Drag handle + order index */}
                    <div
                      {...getHandleProps(idx)}
                      title="Arrastar para reordenar"
                      className="flex items-center gap-2 text-[var(--muted)] select-none touch-none cursor-grab active:cursor-grabbing py-2 px-1 -ml-1 flex-shrink-0"
                    >
                      <span className="text-sm leading-none opacity-70">⠿</span>
                      <span className="font-mono text-xs w-5 text-right tabular-nums">
                        {idx + 1}
                      </span>
                    </div>

                    <Link href={`/song/${song.id}?setlist=${id}`} className="flex-1 min-w-0">
                      <div className="font-display text-[19px] leading-snug text-[var(--ink)] group-hover:underline underline-offset-4 truncate">
                        {song.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[var(--muted)]">
                        <span className="truncate">{song.artist || 'Artista não informado'}</span>
                        {song.displayKey && (
                          <span className="studio-chip text-[var(--accent-ink)]">{song.displayKey}</span>
                        )}
                        <span className="studio-chip text-[var(--muted)]">{song.tempo} BPM</span>
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => removeSongFromSetlist(id, song.id)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--rec)] hover:bg-[var(--surface2)] transition-colors cursor-pointer flex-shrink-0"
                      title="Remover do setlist"
                      aria-label={`Remover ${song.title} do setlist`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

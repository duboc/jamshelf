'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { SongCard } from '@/components/song-list/SongCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

type Tab = 'all' | 'favorites' | 'setlists';
type SortMode = 'title' | 'rating' | 'bpm' | 'favorites';

function isTab(value: string | null): value is Tab {
  return value === 'all' || value === 'favorites' || value === 'setlists';
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const entries = useSongStore((s) => s.entries);
  const { getSongs, removeEntry, exportAll, importEntries } = useSongStore();
  const { setlists, createSetlist, deleteSetlist } = useSetlistStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const songs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const tabParam = searchParams.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'all';

  const [search, setSearch] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('title');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [newSetlistName, setNewSetlistName] = useState('');
  const [showNewSetlist, setShowNewSetlist] = useState(false);
  const [setlistToDelete, setSetlistToDelete] = useState<{ id: string; name: string } | null>(null);

  const favoriteCount = useMemo(() => songs.filter((s) => s.favorite).length, [songs]);

  const availableKeys = useMemo(() => {
    const keys = new Set<string>();
    songs.forEach((s) => {
      if (s.displayKey) keys.add(s.displayKey);
    });
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [songs]);

  const filteredSongs = useMemo(() => {
    const base = tab === 'favorites' ? songs.filter((s) => s.favorite) : songs;
    const q = search.trim().toLowerCase();

    const matched = base.filter((s) => {
      if (keyFilter && s.displayKey !== keyFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.displayKey.toLowerCase().includes(q)
      );
    });

    return [...matched].sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating || a.title.localeCompare(b.title);
      if (sortBy === 'bpm') return b.tempo - a.tempo || a.title.localeCompare(b.title);
      if (sortBy === 'favorites') {
        return Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title);
    });
  }, [songs, tab, search, keyFilter, sortBy]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2600);
  };

  const handleExportAll = () => {
    const cho = exportAll();
    navigator.clipboard
      .writeText(cho)
      .then(() => showToast('Todas as músicas foram copiadas em formato ChordPro (.cho).'))
      .catch(() => showToast('Não foi possível acessar a área de transferência.'));
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportMsg('Cole o conteúdo de um arquivo ChordPro primeiro.');
      return;
    }
    const count = importEntries(importText.trim());
    if (count > 0) {
      setImportMsg(
        count === 1
          ? '1 música importada com sucesso.'
          : `${count} músicas importadas com sucesso.`
      );
      setImportText('');
      setTimeout(() => {
        setShowImport(false);
        setImportMsg('');
      }, 1300);
    } else {
      setImportMsg('Não foi possível ler o ChordPro. Confira se o texto começa com {title: ...}.');
    }
  };

  const handleCreateSetlist = () => {
    const name = newSetlistName.trim();
    if (!name) return;
    const sl = createSetlist(name);
    setNewSetlistName('');
    setShowNewSetlist(false);
    router.push(`/setlists/${sl.id}`);
  };

  const pageHeading =
    tab === 'favorites'
      ? { eyebrow: 'Seleção da banda', title: 'Favoritas', count: `${favoriteCount} ${favoriteCount === 1 ? 'música' : 'músicas'}` }
      : tab === 'setlists'
      ? { eyebrow: 'Ordem de ensaio e show', title: 'Setlists', count: `${setlists.length} ${setlists.length === 1 ? 'setlist' : 'setlists'}` }
      : { eyebrow: 'Caderno da banda', title: 'Repertório', count: `${songs.length} ${songs.length === 1 ? 'música' : 'músicas'}` };

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Page header */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="eyebrow">{pageHeading.eyebrow}</div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="font-display text-3xl sm:text-4xl text-[var(--ink)] leading-tight">
              {pageHeading.title}
            </h1>
            <span className="font-mono text-xs text-[var(--muted)]">{pageHeading.count}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'setlists' ? (
            <>
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="pill-btn px-3.5 py-1.5 text-xs"
              >
                Importar .cho
              </button>
              <button
                type="button"
                onClick={handleExportAll}
                className="pill-btn px-3.5 py-1.5 text-xs"
              >
                Exportar tudo
              </button>
              <Link
                href="/add-song"
                className="pill-btn pill-btn-primary px-4 py-1.5 text-xs sm:hidden"
              >
                + Música
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewSetlist(true)}
              className="pill-btn pill-btn-primary px-4 py-1.5 text-xs"
            >
              + Novo setlist
            </button>
          )}
        </div>
      </section>

      {toastMsg && (
        <div
          role="status"
          className="rounded-xl border border-[var(--line)] border-l-[3px] border-l-[var(--tune)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)]"
        >
          {toastMsg}
        </div>
      )}

      {/* Search + filter bar (Songs & Favorites tabs) */}
      {tab !== 'setlists' && (
        <section className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
          <div className="relative flex-1">
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
            >
              <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="m10.8 10.8 3.2 3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder={
                tab === 'favorites'
                  ? 'Filtrar favoritas por música, artista ou tom...'
                  : 'Filtrar por música, artista ou tom...'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="studio-input w-full pl-9 pr-9 py-2.5 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] flex items-center justify-center cursor-pointer"
              >
                &times;
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {availableKeys.length > 0 && (
              <select
                aria-label="Filtrar por tom"
                value={keyFilter}
                onChange={(e) => setKeyFilter(e.target.value)}
                className="studio-input px-3 py-2 text-xs font-mono"
              >
                <option value="">Todos os tons</option>
                {availableKeys.map((k) => (
                  <option key={k} value={k}>
                    Tom: {k}
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="Ordenar músicas"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
              className="studio-input px-3 py-2 text-xs font-mono"
            >
              <option value="title">Ordem: A–Z</option>
              <option value="rating">Melhor avaliadas</option>
              <option value="favorites">Favoritas primeiro</option>
              <option value="bpm">BPM (maior → menor)</option>
            </select>
          </div>
        </section>
      )}

      {/* Songs list */}
      {tab !== 'setlists' && (
        <section>
          {filteredSongs.length === 0 ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center space-y-3">
              <p className="text-sm text-[var(--muted)]">
                {tab === 'favorites'
                  ? favoriteCount === 0
                    ? 'Nenhuma favorita ainda. Toque no ♡ de qualquer música para fixar aqui.'
                    : 'Nenhuma favorita corresponde aos filtros.'
                  : songs.length === 0
                  ? 'Nenhuma música no repertório ainda.'
                  : 'Nenhuma música corresponde à busca ou ao filtro de tom.'}
              </p>
              {(search || keyFilter) ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setKeyFilter('');
                  }}
                  className="pill-btn px-4 py-1.5 text-xs"
                >
                  Limpar filtros
                </button>
              ) : (
                tab === 'all' && (
                  <Link href="/add-song" className="pill-btn pill-btn-primary px-4 py-2 text-xs">
                    + Adicionar primeira música
                  </Link>
                )
              )}
            </div>
          ) : (
            <div className="border-t border-[var(--line)]">
              {filteredSongs.map((song) => (
                <SongCard key={song.id} song={song} onRemove={removeEntry} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Setlists tab */}
      {tab === 'setlists' && (
        <section className="space-y-4">
          {showNewSetlist && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-wrap gap-2 items-center">
              <input
                autoFocus
                type="text"
                placeholder="Nome do setlist (ex.: Ensaio de Sexta, Show Bar...)"
                value={newSetlistName}
                onChange={(e) => setNewSetlistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSetlist();
                  if (e.key === 'Escape') {
                    setShowNewSetlist(false);
                    setNewSetlistName('');
                  }
                }}
                className="studio-input flex-1 min-w-[200px] px-3.5 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleCreateSetlist}
                disabled={!newSetlistName.trim()}
                className="pill-btn pill-btn-primary px-4 py-2 text-xs"
              >
                Criar setlist
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewSetlist(false);
                  setNewSetlistName('');
                }}
                className="pill-btn px-3.5 py-2 text-xs"
              >
                Cancelar
              </button>
            </div>
          )}

          {setlists.length === 0 && !showNewSetlist ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Nenhum setlist criado ainda. Monte um para organizar a ordem do ensaio ou do show.
              </p>
              <button
                type="button"
                onClick={() => setShowNewSetlist(true)}
                className="pill-btn pill-btn-primary px-4 py-2 text-xs"
              >
                + Criar primeiro setlist
              </button>
            </div>
          ) : (
            <div className="border-t border-[var(--line)]">
              {setlists.map((sl) => {
                const validSongIds = sl.songIds.filter((sid) => songs.some((s) => s.id === sid));
                const firstSongId = validSongIds[0] ?? null;

                return (
                  <div
                    key={sl.id}
                    className="group flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 py-4 px-2 sm:px-3 border-b border-[var(--line)] hover:bg-[var(--surface2)]/45 transition-colors"
                  >
                    <Link href={`/setlists/${sl.id}`} className="flex-1 min-w-0">
                      <h3 className="font-display text-xl text-[var(--ink)] group-hover:underline underline-offset-4 truncate">
                        {sl.name}
                      </h3>
                      <div className="font-mono text-[11.5px] text-[var(--muted)] mt-0.5">
                        {validSongIds.length}{' '}
                        {validSongIds.length === 1 ? 'música' : 'músicas'}
                      </div>
                    </Link>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {firstSongId && (
                        <Link
                          href={`/song/${firstSongId}?setlist=${sl.id}&show=1`}
                          className="pill-btn pill-btn-rec px-3.5 py-1.5 text-xs"
                          title="Abrir este setlist direto no Modo Show"
                        >
                          ▶ Modo Show
                        </Link>
                      )}
                      <Link
                        href={`/setlists/${sl.id}`}
                        className="pill-btn px-3.5 py-1.5 text-xs"
                      >
                        Abrir
                      </Link>
                      <button
                        type="button"
                        onClick={() => setSetlistToDelete({ id: sl.id, name: sl.name })}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--rec)] hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                        title="Excluir setlist"
                        aria-label={`Excluir setlist ${sl.name}`}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Import .cho modal */}
      {showImport && (
        <div
          className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
          onClick={() => {
            setShowImport(false);
            setImportMsg('');
            setImportText('');
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl w-full max-w-2xl flex flex-col overflow-hidden"
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
              <div>
                <div className="eyebrow">Arquivo ChordPro</div>
                <h3 className="font-display text-xl text-[var(--ink)]">Importar .cho</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImport(false);
                  setImportMsg('');
                  setImportText('');
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer text-lg"
                aria-label="Fechar"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Cole um arquivo ChordPro começando com{' '}
                <code className="font-mono text-[var(--accent-ink)]">{'{title: ...}'}</code>. Para importar várias músicas de uma vez, separe com{' '}
                <code className="font-mono text-[var(--ink)]">---</code> numa linha isolada.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={12}
                placeholder={`{title: Minha Música}\n{artist: Nome do Artista}\n{key: Am}\n\n[Verse 1]\n[Am]Letra aqui`}
                className="studio-input w-full px-4 py-3 font-mono text-xs resize-y"
              />
              {importMsg && (
                <div
                  className={`text-xs rounded-xl px-3.5 py-2 border ${
                    importMsg.includes('sucesso')
                      ? 'border-[var(--tune)]/40 bg-[var(--tune-dim)] text-[var(--tune)]'
                      : 'border-[var(--rec)]/40 bg-[var(--rec)]/10 text-[var(--rec)]'
                  }`}
                >
                  {importMsg}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImport(false);
                    setImportMsg('');
                    setImportText('');
                  }}
                  className="pill-btn px-4 py-2 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  className="pill-btn pill-btn-primary px-5 py-2 text-xs"
                >
                  Importar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!setlistToDelete}
        title="Excluir setlist?"
        description={
          setlistToDelete ? (
            <>
              O setlist &ldquo;{setlistToDelete.name}&rdquo; será apagado. As músicas continuam salvas no repertório.
            </>
          ) : null
        }
        confirmLabel="Excluir"
        danger
        onConfirm={() => {
          if (setlistToDelete) deleteSetlist(setlistToDelete.id);
          setSetlistToDelete(null);
        }}
        onCancel={() => setSetlistToDelete(null)}
      />
    </main>
  );
}

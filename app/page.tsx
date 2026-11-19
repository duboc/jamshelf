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
      ? {
          title: 'Favoritas',
          count: `${favoriteCount} ${favoriteCount === 1 ? 'música' : 'músicas'}`,
        }
      : tab === 'setlists'
      ? {
          title: 'Setlists',
          count: `${setlists.length} ${setlists.length === 1 ? 'setlist' : 'setlists'}`,
        }
      : {
          title: 'Repertório',
          count: `${songs.length} ${songs.length === 1 ? 'música' : 'músicas'}`,
        };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Google Cloud Console resource action bar */}
      <div className="border-b border-[var(--line)] bg-[var(--surface)] px-4 sm:px-6 min-h-[48px] py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          <h1 className="font-display text-[18px] text-[var(--ink)] leading-tight">
            {pageHeading.title}
          </h1>

          <span className="hidden sm:inline-block h-5 w-px bg-[var(--line)]" aria-hidden="true" />

          <div className="flex flex-wrap items-center gap-1">
            {tab !== 'setlists' ? (
              <>
                <Link href="/add-song" className="cloud-action-btn">
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  <span>Nova música</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShowImport(true)}
                  className="cloud-action-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 2.5v7.5M5.2 7.2 8 10l2.8-2.8M3 12.5h10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Importar .cho</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAll}
                  className="cloud-action-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 10V2.5M5.2 5.3 8 2.5l2.8 2.8M3 12.5h10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Exportar tudo</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewSetlist(true)}
                className="cloud-action-btn"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <span>Criar setlist</span>
              </button>
            )}
          </div>
        </div>

        <span className="font-mono text-xs text-[var(--muted)]">{pageHeading.count}</span>
      </div>

      {/* Main workspace body */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {toastMsg && (
          <div
            role="status"
            className="rounded-lg border border-[var(--line)] border-l-4 border-l-[var(--tune)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)]"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            {toastMsg}
          </div>
        )}

        {/* Songs & Favorites resource table */}
        {tab !== 'setlists' && (
          <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
            {/* Attached Google Cloud Filter Strip */}
            <div className="px-3 sm:px-4 py-2.5 border-b border-[var(--line)] flex flex-col sm:flex-row sm:items-center gap-2.5 bg-[var(--surface)]">
              <div className="relative flex-1 flex items-center">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  className="text-[var(--muted)] mr-2.5 flex-shrink-0"
                >
                  <path
                    d="M2.5 4h11M4.5 8h7M6.5 12h3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="text"
                  placeholder={
                    tab === 'favorites'
                      ? 'Filtrar favoritas por nome, artista ou tom...'
                      : 'Filtrar tabela por música, artista ou tom...'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-[13.5px] text-[var(--ink)] placeholder-[var(--muted)] outline-none py-1 pr-7"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Limpar busca"
                    className="absolute right-0 w-6 h-6 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] flex items-center justify-center cursor-pointer"
                  >
                    &times;
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:border-l sm:border-[var(--line-subtle)] sm:pl-3">
                {availableKeys.length > 0 && (
                  <select
                    aria-label="Filtrar por tom"
                    value={keyFilter}
                    onChange={(e) => setKeyFilter(e.target.value)}
                    className="studio-input px-2.5 py-1 text-xs font-display"
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
                  className="studio-input px-2.5 py-1 text-xs font-display"
                >
                  <option value="title">Nome (A–Z)</option>
                  <option value="rating">Avaliação</option>
                  <option value="favorites">Favoritas</option>
                  <option value="bpm">Andamento (BPM)</option>
                </select>
              </div>
            </div>

            {filteredSongs.length === 0 ? (
              <div className="px-6 py-14 text-center space-y-3">
                <p className="text-sm text-[var(--muted)]">
                  {tab === 'favorites'
                    ? favoriteCount === 0
                      ? 'Nenhuma favorita ainda. Toque no ♡ de qualquer música para fixar aqui.'
                      : 'Nenhuma favorita corresponde aos filtros.'
                    : songs.length === 0
                    ? 'Nenhuma música no repertório ainda.'
                    : 'Nenhuma música corresponde à busca ou ao filtro de tom.'}
                </p>
                {search || keyFilter ? (
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
                      + Nova música
                    </Link>
                  )
                )}
              </div>
            ) : (
              <div>
                {/* Desktop table header */}
                <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_104px_146px_112px_76px] gap-3 px-4 py-2 bg-[var(--surface2)]/75 border-b border-[var(--line)] text-[12px] font-display font-medium text-[var(--muted)]">
                  <span>Música</span>
                  <span>Tom</span>
                  <span>Andamento</span>
                  <span>Avaliação</span>
                  <span className="text-right">Ações</span>
                </div>

                {filteredSongs.map((song) => (
                  <SongCard key={song.id} song={song} onRemove={removeEntry} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Setlists resource table */}
        {tab === 'setlists' && (
          <section className="space-y-4">
            {showNewSetlist && (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-wrap gap-2 items-center">
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
                  className="studio-input flex-1 min-w-[200px] px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={handleCreateSetlist}
                  disabled={!newSetlistName.trim()}
                  className="pill-btn pill-btn-primary px-4 py-1.5 text-xs"
                >
                  Criar setlist
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewSetlist(false);
                    setNewSetlistName('');
                  }}
                  className="pill-btn px-3.5 py-1.5 text-xs"
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
              {setlists.length === 0 && !showNewSetlist ? (
                <div className="px-6 py-14 text-center space-y-3">
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
                <div>
                  <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_120px_210px] gap-3 px-4 py-2 bg-[var(--surface2)]/75 border-b border-[var(--line)] text-[12px] font-display font-medium text-[var(--muted)]">
                    <span>Nome</span>
                    <span>Faixas</span>
                    <span className="text-right">Ações</span>
                  </div>

                  {setlists.map((sl) => {
                    const validSongIds = sl.songIds.filter((sid) => songs.some((s) => s.id === sid));
                    const firstSongId = validSongIds[0] ?? null;

                    return (
                      <div
                        key={sl.id}
                        className="group flex flex-wrap sm:grid sm:grid-cols-[minmax(0,1fr)_120px_210px] sm:items-center justify-between gap-3 py-3 px-4 border-b border-[var(--line-subtle)] last:border-b-0 hover:bg-[var(--nav-active-bg)]/40 transition-colors"
                      >
                        <Link href={`/setlists/${sl.id}`} className="min-w-0">
                          <h3 className="font-display text-[14.5px] font-medium text-[var(--accent-ink)] group-hover:underline underline-offset-2 truncate">
                            {sl.name}
                          </h3>
                          <div className="sm:hidden font-mono text-[11px] text-[var(--muted)] mt-0.5">
                            {validSongIds.length}{' '}
                            {validSongIds.length === 1 ? 'música' : 'músicas'}
                          </div>
                        </Link>

                        <div className="hidden sm:block font-mono text-xs text-[var(--muted)] tabular-nums">
                          {validSongIds.length}{' '}
                          {validSongIds.length === 1 ? 'música' : 'músicas'}
                        </div>

                        <div className="flex items-center sm:justify-end gap-1.5 flex-shrink-0">
                          {firstSongId && (
                            <Link
                              href={`/song/${firstSongId}?setlist=${sl.id}&show=1`}
                              className="pill-btn pill-btn-rec px-2.5 py-1 text-xs"
                              title="Abrir este setlist direto no Modo Show"
                            >
                              ▶ Show
                            </Link>
                          )}
                          <Link
                            href={`/setlists/${sl.id}`}
                            className="pill-btn px-2.5 py-1 text-xs"
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
            </div>
          </section>
        )}

        {/* Import .cho modal */}
        {showImport && (
          <div
            className="fixed inset-0 bg-black/45 z-[70] flex items-center justify-center p-4"
            onClick={() => {
              setShowImport(false);
              setImportMsg('');
              setImportText('');
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="bg-[var(--surface)] border border-[var(--line)] rounded-lg w-full max-w-2xl flex flex-col overflow-hidden"
              style={{ boxShadow: 'var(--shadow-md)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--line)]">
                <div>
                  <div className="eyebrow">Arquivo ChordPro</div>
                  <h3 className="font-display text-lg text-[var(--ink)]">Importar .cho</h3>
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
                  className="studio-input w-full px-3.5 py-2.5 font-mono text-xs resize-y"
                />
                {importMsg && (
                  <div
                    className={`text-xs rounded-[4px] px-3.5 py-2 border ${
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
                    className="pill-btn px-4 py-1.5 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    className="pill-btn pill-btn-primary px-5 py-1.5 text-xs"
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
    </div>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import {
  useDisplayStore,
  type DisplayMode,
  type PaletteTheme,
  type ScrollLeadIn,
  type ThemeMode,
} from '@/lib/stores/display-store';
import { isMinorKey, normalizeSearch } from '@/lib/utils/music';
import {
  AuroraButton,
  AuroraDialog,
  AuroraIconButton,
  AuroraSegmented,
  AuroraSheet,
  GsIcon,
  JamshelfBrandMark,
} from '../aurora/primitives';
import { getDisplayTitleAndArtist, getEffectiveKey } from '../utils/song-display';
import { ShortcutsDialog } from './ShortcutsDialog';
import { AuroraLink, navigate, useRoute } from '../router';

const PALETTES: { id: PaletteTheme; label: string; color: string }[] = [
  { id: 'blue', label: 'Azul cobalto', color: 'light-dark(#1452c7, #9cc2ff)' },
  { id: 'violet', label: 'Violeta estúdio', color: 'light-dark(#5b3ec8, #cbbdff)' },
  { id: 'emerald', label: 'Esmeralda palco', color: 'light-dark(#0f6d43, #7adca9)' },
  { id: 'terracotta', label: 'Terracota quente', color: 'light-dark(#9a4522, #ffb598)' },
];

export function applyColorScheme(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') {
    root.style.colorScheme = theme;
    root.dataset.theme = theme;
    try {
      localStorage.setItem('jamshelf-theme', theme);
      localStorage.setItem('aurora-theme', theme);
    } catch {
      // ignore
    }
  } else {
    root.style.colorScheme = 'light dark';
    delete root.dataset.theme;
    try {
      localStorage.removeItem('jamshelf-theme');
      localStorage.removeItem('aurora-theme');
    } catch {
      // ignore
    }
  }
}

function getEffectiveDark(theme: ThemeMode): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function AuroraShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const entries = useSongStore((s) => s.entries);
  const getSongs = useSongStore((s) => s.getSongs);
  const songSyncError = useSongStore((s) => s.syncError);
  const clearSongSyncError = useSongStore((s) => s.clearSyncError);
  const retrySongSync = useSongStore((s) => s.retryPendingSync);

  const setlists = useSetlistStore((s) => s.setlists);
  const setlistSyncError = useSetlistStore((s) => s.syncError);
  const clearSetlistSyncError = useSetlistStore((s) => s.clearSyncError);
  const retrySetlistSync = useSetlistStore((s) => s.retryPendingSync);

  const {
    theme,
    setTheme,
    palette,
    setPalette,
    displayMode,
    setDisplayMode,
    fontSize,
    setFontSize,
    visualPulseEnabled,
    setVisualPulseEnabled,
    focusMode,
    setFocusMode,
    scrollLeadInSec,
    setScrollLeadInSec,
    singleKeyShortcuts,
    setSingleKeyShortcuts,
  } = useDisplayStore();

  const readDesktopRailPref = () => {
    try {
      const saved = localStorage.getItem('jamshelf-rail-expanded');
      if (saved === '0') return false;
      if (saved === '1') return true;
    } catch {
      // ignore
    }
    return true;
  };

  const [railExpanded, setRailExpanded] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1120) {
      return false;
    }
    return readDesktopRailPref();
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1120px)');
    const onChange = (e: MediaQueryListEvent) => {
      setRailExpanded(e.matches ? readDesktopRailPref() : false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const [prefsOpen, setPrefsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [quickActiveIdx, setQuickActiveIdx] = useState(0);
  const [deviceName, setDeviceName] = useState(() => {
    try {
      return localStorage.getItem('jamshelf-device-name') || '';
    } catch {
      return '';
    }
  });

  const toggleRail = () => {
    setRailExpanded((prev) => {
      const next = !prev;
      if (typeof window === 'undefined' || window.innerWidth >= 1120) {
        try {
          localStorage.setItem('jamshelf-rail-expanded', next ? '1' : '0');
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (palette === 'blue') {
      delete document.documentElement.dataset.palette;
    } else {
      document.documentElement.dataset.palette = palette;
    }
  }, [palette]);

  // Global keyboard shortcuts: Cmd/Ctrl+K, '/', '?' (guarded against stacked modals)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const hasOpenModal = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (hasOpenModal && !searchOpen) return;
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (!singleKeyShortcuts) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (hasOpenModal) return;
        e.preventDefault();
        const libraryInput = document.getElementById('library-filter-input') as HTMLInputElement | null;
        if (libraryInput) {
          libraryInput.focus();
          libraryInput.select();
        } else {
          setSearchOpen(true);
        }
      } else if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (hasOpenModal && !shortcutsOpen) return;
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [singleKeyShortcuts, searchOpen, shortcutsOpen]);

  const isSongRoute = route.pathname.startsWith('/song/');
  const isImmersive =
    route.pathname === '/slides' ||
    (isSongRoute && (route.params.get('show') === '1' || focusMode));

  // Leave Focus Mode only when navigating away from song routes (preserves Focus Mode across setlist Prev/Next!)
  useEffect(() => {
    if (!isSongRoute && focusMode) {
      setFocusMode(false);
    }
  }, [isSongRoute, focusMode, setFocusMode]);

  // Sync stage-calm motion scope to <html> so portaled dialogs/sheets inherit zero-bounce curves
  useEffect(() => {
    const root = document.documentElement;
    if (isImmersive) {
      root.dataset.motionScheme = 'standard';
    } else {
      delete root.dataset.motionScheme;
    }
    return () => {
      delete root.dataset.motionScheme;
    };
  }, [isImmersive]);

  const activeTab =
    route.pathname === '/'
      ? route.params.get('tab') === 'favorites'
        ? 'favorites'
        : route.params.get('tab') === 'setlists'
          ? 'setlists'
          : 'all'
      : route.pathname.startsWith('/setlists')
        ? 'setlists'
        : route.pathname === '/add-song'
          ? 'add'
          : route.pathname.startsWith('/song/')
            ? route.params.get('setlist')
              ? 'setlists'
              : 'all'
            : '';

  const isDark = getEffectiveDark(theme);

  const handleSetTheme = (next: ThemeMode) => {
    setTheme(next);
    applyColorScheme(next);
  };

  const toggleThemeQuick = () => {
    handleSetTheme(isDark ? 'light' : 'dark');
  };

  const songs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const favoriteCount = useMemo(() => songs.filter((s) => s.favorite).length, [songs]);

  const quickResults = useMemo(() => {
    const q = normalizeSearch(quickQuery);
    const matchingSongs = songs
      .filter(
        (s) =>
          !q ||
          normalizeSearch(s.title).includes(q) ||
          normalizeSearch(s.artist).includes(q) ||
          normalizeSearch(s.displayKey).includes(q) ||
          normalizeSearch(getEffectiveKey(s).key).includes(q)
      )
      .slice(0, 8);
    const matchingSetlists = setlists
      .filter((sl) => !q || normalizeSearch(sl.name).includes(q))
      .slice(0, 4);
    return { matchingSongs, matchingSetlists };
  }, [songs, setlists, quickQuery]);

  const flatQuickItems = useMemo(
    () => [
      ...quickResults.matchingSongs.map((s) => ({
        key: `song-${s.id}`,
        href: `/song/${s.id}`,
      })),
      ...quickResults.matchingSetlists.map((sl) => ({
        key: `setlist-${sl.id}`,
        href: `/setlists/${sl.id}`,
      })),
    ],
    [quickResults]
  );

  const qsListboxRef = useRef<HTMLDivElement>(null);
  const qsHighlightRef = useRef<HTMLSpanElement>(null);
  const keyboardNavRef = useRef(false);

  useEffect(() => {
    setQuickActiveIdx(0);
    keyboardNavRef.current = false;
  }, [quickQuery, searchOpen]);

  useEffect(() => {
    if (!searchOpen || flatQuickItems.length === 0) return;
    const item = flatQuickItems[quickActiveIdx];
    if (!item) return;
    document
      .getElementById(`qs-opt-${item.key}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [quickActiveIdx, searchOpen, flatQuickItems]);

  useLayoutEffect(() => {
    const listEl = qsListboxRef.current;
    const hiEl = qsHighlightRef.current;
    if (!listEl || !hiEl) return;
    const item = flatQuickItems[quickActiveIdx];
    const optEl = item ? document.getElementById(`qs-opt-${item.key}`) : null;
    if (!searchOpen || !optEl) {
      hiEl.removeAttribute('data-ready');
      return;
    }
    const listRect = listEl.getBoundingClientRect();
    const optRect = optEl.getBoundingClientRect();
    const scaleY = listEl.offsetHeight > 0 ? listRect.height / listEl.offsetHeight : 1;
    const top = scaleY > 0.01 ? (optRect.top - listRect.top) / scaleY : optEl.offsetTop;
    const height = optEl.offsetHeight;
    hiEl.style.transform = `translate3d(0, ${top}px, 0)`;
    hiEl.style.height = `${height}px`;
    hiEl.setAttribute('data-ready', 'true');
  }, [quickActiveIdx, flatQuickItems, searchOpen]);

  const syncError = songSyncError || setlistSyncError;
  const deviceInitial = deviceName.trim().charAt(0).toUpperCase();

  const navItems = [
    {
      id: 'all',
      href: '/',
      label: 'Repertório',
      icon: 'library_music',
      count: songs.length,
    },
    {
      id: 'favorites',
      href: '/?tab=favorites',
      label: 'Favoritas',
      icon: 'favorite',
      count: favoriteCount,
    },
    {
      id: 'setlists',
      href: '/?tab=setlists',
      label: 'Setlists',
      icon: 'queue_music',
      count: setlists.length,
    },
  ] as const;

  return (
    <div
      className={`min-h-dvh bg-canvas text-on-surface flex flex-col ${
        isImmersive ? '' : 'md:flex-row pb-20 md:pb-0'
      }`}
    >
      <a href="#main" className="skip-link typescale-label-lg">
        Ir para o conteúdo
      </a>

      {/* Desktop Collapsible Navigation Sidebar / Rail (tonal surface-low, borderless) */}
      {!isImmersive ? (
        <aside
          aria-label="Barra lateral de navegação"
          className={`hidden md:flex flex-col justify-between sticky top-0 h-dvh flex-shrink-0 bg-surface-container-low stage-sidebar-rail ${
            railExpanded ? 'w-[236px]' : 'w-[88px]'
          }`}
        >
          <div className={`${railExpanded ? 'p-3' : 'px-1.5 py-3'} space-y-4`}>
            {/* Top brand + collapse toggle */}
            <div
              className={`flex items-center ${
                railExpanded ? 'justify-between gap-2 px-1' : 'flex-col gap-2'
              }`}
            >
              <AuroraLink
                href="/"
                className="inline-flex items-center gap-2.5 min-h-[44px] no-underline text-on-surface rounded-2xl py-1"
                aria-label="Jamshelf, início"
              >
                <JamshelfBrandMark size={32} />
                {railExpanded && (
                  <span className="rail-label-enter typescale-title-lg text-on-surface truncate">
                    Jamshelf
                  </span>
                )}
              </AuroraLink>
              <AuroraIconButton
                icon={railExpanded ? 'menu_open' : 'menu'}
                label={railExpanded ? 'Recolher menu lateral' : 'Expandir menu lateral'}
                aria-expanded={railExpanded}
                onClick={toggleRail}
              />
            </div>

            {/* Dedicated Add Song FAB / Extended FAB (semantic link) */}
            <div className={railExpanded ? 'px-1' : 'flex justify-center'}>
              <AuroraLink
                href="/add-song"
                aria-current={activeTab === 'add' ? 'page' : undefined}
                aria-label={!railExpanded ? 'Adicionar nova música' : undefined}
                title="Adicionar nova música"
                className={`stage-btn stage-fab stage-btn-primary-tonal typescale-label-lg cursor-pointer no-underline ${
                  railExpanded
                    ? 'w-full min-h-[52px] justify-start px-4'
                    : 'w-14 h-14 min-h-[56px] p-0 justify-center'
                }`}
              >
                <GsIcon name="add" size={24} />
                {railExpanded && <span className="rail-label-enter">Nova música</span>}
              </AuroraLink>
            </div>

            {/* Primary destinations */}
            <nav aria-label="Navegação principal" className="space-y-1">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                if (railExpanded) {
                  return (
                    <AuroraLink
                      key={item.id}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      title={item.label}
                      className="stage-nav-pill w-full justify-between px-3.5 min-h-[46px]"
                    >
                      <span className="inline-flex items-center gap-3 min-w-0">
                        <GsIcon name={item.icon} size={22} filled={active} />
                        <span className="rail-label-enter typescale-label-lg truncate">
                          {item.label}
                        </span>
                      </span>
                      <span className="rail-label-enter typescale-body-sm font-mono tabular-nums text-on-surface-variant">
                        {item.count}
                      </span>
                    </AuroraLink>
                  );
                }
                return (
                  <AuroraLink
                    key={item.id}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    title={item.label}
                    className="stage-rail-dest w-full"
                  >
                    <span className="stage-rail-indicator">
                      <GsIcon name={item.icon} size={22} filled={active} />
                    </span>
                    <span className="rail-compact-enter typescale-label-sm truncate max-w-full">
                      {item.label}
                    </span>
                  </AuroraLink>
                );
              })}

              {railExpanded ? (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Busca rápida (Ctrl+K)"
                  title="Busca rápida (Ctrl+K)"
                  className="stage-nav-pill w-full mt-3 justify-between px-3.5 min-h-[46px] bg-surface-container"
                >
                  <span className="inline-flex items-center gap-3 min-w-0">
                    <GsIcon name="search" size={22} />
                    <span className="rail-label-enter typescale-body-md">Busca rápida</span>
                  </span>
                  <kbd className="rail-label-enter font-mono typescale-body-sm text-on-surface-variant px-1.5 py-0.5 rounded bg-surface">
                    ⌘K
                  </kbd>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Busca rápida (Ctrl+K)"
                  title="Busca rápida (Ctrl+K)"
                  className="stage-rail-dest w-full mt-2"
                >
                  <span className="stage-rail-indicator">
                    <GsIcon name="search" size={22} />
                  </span>
                  <span className="rail-compact-enter typescale-label-sm">Buscar</span>
                </button>
              )}
            </nav>
          </div>

          {/* Sidebar Footer: Theme + Shortcuts + Preferences (borderless tonal separation) */}
          <div className="p-3 space-y-1">
            {railExpanded ? (
              <>
                <button
                  type="button"
                  onClick={toggleThemeQuick}
                  className="stage-nav-pill w-full justify-start gap-3 px-3.5 min-h-[44px]"
                >
                  <span key={isDark ? 'sun' : 'moon'} className="theme-icon-spin">
                    <GsIcon name={isDark ? 'light_mode' : 'dark_mode'} size={22} />
                  </span>
                  <span className="rail-label-enter typescale-label-lg">
                    {isDark ? 'Tema claro' : 'Tema escuro'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(true)}
                  className="stage-nav-pill w-full justify-between px-3.5 min-h-[44px]"
                >
                  <span className="inline-flex items-center gap-3">
                    <GsIcon name="keyboard" size={22} />
                    <span className="rail-label-enter typescale-label-lg">Atalhos</span>
                  </span>
                  <kbd className="rail-label-enter font-mono typescale-body-sm text-on-surface-variant px-1.5 py-0.5 rounded bg-surface">
                    ?
                  </kbd>
                </button>
                <button
                  type="button"
                  onClick={() => setPrefsOpen(true)}
                  className="stage-nav-pill w-full justify-start gap-3 px-3.5 min-h-[44px]"
                >
                  {deviceInitial ? (
                    <span className="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container typescale-label-sm inline-flex items-center justify-center flex-shrink-0">
                      {deviceInitial}
                    </span>
                  ) : (
                    <GsIcon name="tune" size={22} />
                  )}
                  <span className="rail-label-enter typescale-label-lg truncate">
                    {deviceName.trim() || 'Preferências'}
                  </span>
                </button>
              </>
            ) : (
              <div className="rail-compact-enter flex flex-col items-center gap-1">
                <AuroraIconButton
                  icon={isDark ? 'light_mode' : 'dark_mode'}
                  label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                  onClick={toggleThemeQuick}
                />
                <AuroraIconButton
                  icon="keyboard"
                  label="Atalhos de teclado (?)"
                  onClick={() => setShortcutsOpen(true)}
                />
                <AuroraIconButton
                  icon="tune"
                  label="Preferências do aparelho"
                  onClick={() => setPrefsOpen(true)}
                />
              </div>
            )}
          </div>
        </aside>
      ) : null}

      {/* Mobile Slim Top Header */}
      {!isImmersive ? (
        <header className="md:hidden sticky top-0 z-30 bg-surface-container-low border-b border-outline-variant/50">
          <div className="px-4 h-14 flex items-center justify-between gap-2">
            <AuroraLink
              href="/"
              className="inline-flex items-center gap-2 min-h-[44px] no-underline text-on-surface"
              aria-label="Jamshelf, início"
            >
              <JamshelfBrandMark size={28} />
              <span className="typescale-title-lg text-on-surface">Jamshelf</span>
            </AuroraLink>
            <div className="flex items-center gap-0.5">
              {(route.pathname !== '/' || activeTab === 'setlists') && (
                <AuroraIconButton
                  icon="search"
                  label="Busca rápida"
                  onClick={() => setSearchOpen(true)}
                />
              )}
              <AuroraIconButton
                icon={isDark ? 'light_mode' : 'dark_mode'}
                label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                onClick={toggleThemeQuick}
              />
              <AuroraIconButton
                icon="tune"
                label="Preferências do aparelho"
                onClick={() => setPrefsOpen(true)}
              />
            </div>
          </div>
        </header>
      ) : null}

      {/* Main Content Area (stable tree depth so Focus Mode never unmounts SongView) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!isImmersive && syncError && (
          <div
            role="status"
            aria-live="polite"
            className="bg-surface-container-high border-b border-outline-variant"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="typescale-body-sm text-on-surface-variant inline-flex items-center gap-2">
                <GsIcon name="cloud_off" size={20} />
                <span>{syncError}</span>
              </span>
              <div className="flex items-center gap-1">
                <AuroraButton
                  color="text"
                  icon="refresh"
                  onClick={() => {
                    void retrySongSync();
                    void retrySetlistSync();
                  }}
                >
                  Tentar novamente
                </AuroraButton>
                <AuroraIconButton
                  icon="close"
                  label="Dispensar aviso de sincronização"
                  onClick={() => {
                    clearSongSyncError();
                    clearSetlistSyncError();
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col">{children}</div>
      </div>

      {/* Mobile Bottom Navigation Bar (Add Song lives cleanly in HomeView mobile header -> zero FAB card overlap) */}
      {!isImmersive ? (
        <nav
          aria-label="Navegação inferior"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-container-low border-t border-outline-variant/50 px-2 py-1.5 flex items-center justify-around"
          style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <AuroraLink
                key={item.id}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="stage-rail-dest flex-1"
              >
                <span className="stage-rail-indicator">
                  <GsIcon name={item.icon} size={22} filled={active} />
                </span>
                <span className="typescale-label-sm">{item.label}</span>
              </AuroraLink>
            );
          })}
        </nav>
      ) : null}

      {/* Quick Search Dialog with combobox keyboard navigation */}
      <AuroraDialog
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setQuickQuery('');
        }}
        title="Busca rápida"
        subtitle="Encontre músicas por título, artista, tom ou abra um setlist"
      >
        <div className="space-y-4">
          <label htmlFor="quick-search-input" className="sr-only">
            Buscar música ou setlist
          </label>
          <input
            id="quick-search-input"
            type="text"
            role="combobox"
            aria-expanded={flatQuickItems.length > 0}
            aria-controls="quick-search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              flatQuickItems[quickActiveIdx]
                ? `qs-opt-${flatQuickItems[quickActiveIdx].key}`
                : undefined
            }
            autoFocus
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                if (flatQuickItems.length === 0) return;
                e.preventDefault();
                keyboardNavRef.current = true;
                setQuickActiveIdx((i) => (i + 1) % flatQuickItems.length);
              } else if (e.key === 'ArrowUp') {
                if (flatQuickItems.length === 0) return;
                e.preventDefault();
                keyboardNavRef.current = true;
                setQuickActiveIdx((i) => (i - 1 + flatQuickItems.length) % flatQuickItems.length);
              } else if (e.key === 'Home') {
                if (flatQuickItems.length === 0) return;
                e.preventDefault();
                keyboardNavRef.current = true;
                setQuickActiveIdx(0);
              } else if (e.key === 'End') {
                if (flatQuickItems.length === 0) return;
                e.preventDefault();
                keyboardNavRef.current = true;
                setQuickActiveIdx(flatQuickItems.length - 1);
              } else if (e.key === 'Enter') {
                const chosen = flatQuickItems[quickActiveIdx];
                if (chosen) {
                  e.preventDefault();
                  setSearchOpen(false);
                  setQuickQuery('');
                  navigate(chosen.href);
                } else if (quickQuery.trim()) {
                  e.preventDefault();
                  const q = quickQuery.trim();
                  setSearchOpen(false);
                  setQuickQuery('');
                  navigate(`/add-song?q=${encodeURIComponent(q)}`);
                }
              }
            }}
            placeholder="Digite o nome da música, artista ou tom..."
            className="stage-field"
          />

          <div role="status" aria-live="polite" className="sr-only">
            {flatQuickItems.length === 0
              ? `Nenhum resultado para ${quickQuery}`
              : `${flatQuickItems.length} ${flatQuickItems.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}`}
          </div>

          <div
            ref={qsListboxRef}
            id="quick-search-listbox"
            role="listbox"
            aria-label="Resultados da busca rápida"
            onPointerMove={() => {
              keyboardNavRef.current = false;
            }}
            className="relative isolate space-y-4"
          >
            <span ref={qsHighlightRef} aria-hidden="true" className="qs-active-highlight" />
            {quickResults.matchingSongs.length > 0 && (
              <div role="group" aria-labelledby="qs-songs-heading" className="space-y-1.5">
                <div id="qs-songs-heading" className="typescale-label-sm text-on-surface-variant">
                  Músicas
                </div>
                <div className="space-y-1">
                  {quickResults.matchingSongs.map((s, idx) => {
                    const info = getDisplayTitleAndArtist(s);
                    const eff = getEffectiveKey(s);
                    const minorKey = isMinorKey(eff.key);
                    const isActive = quickActiveIdx === idx;
                    return (
                      <div
                        key={s.id}
                        id={`qs-opt-song-${s.id}`}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => {
                          if (!keyboardNavRef.current) setQuickActiveIdx(idx);
                        }}
                        onClick={() => {
                          setSearchOpen(false);
                          setQuickQuery('');
                          navigate(`/song/${s.id}`);
                        }}
                        className={`stage-list-row relative z-10 w-full min-h-[48px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left cursor-pointer ${
                          isActive
                            ? 'bg-transparent'
                            : 'bg-surface-container hover:bg-surface-container-high'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="typescale-title-md text-on-surface truncate">{info.title}</div>
                          <div className="typescale-body-sm text-on-surface-variant truncate">
                            {info.artist || 'Sem artista'} ·{' '}
                            <span className="font-mono tabular-nums">{s.tempo} BPM</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {eff.key && (
                            <span
                              className={`px-2.5 py-1 rounded-lg typescale-label-sm font-mono ${
                                minorKey
                                  ? isActive
                                    ? 'bg-surface text-minor-ink border border-outline-variant'
                                    : 'bg-minor-bg text-minor-ink'
                                  : 'bg-primary-container text-on-primary-container'
                              }`}
                            >
                              {eff.key}
                            </span>
                          )}
                          <GsIcon
                            name="subdirectory_arrow_left"
                            size={18}
                            className={`hidden sm:inline-flex text-on-surface-variant transition-opacity ${
                              isActive ? 'opacity-80' : 'opacity-0'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {quickResults.matchingSetlists.length > 0 && (
              <div role="group" aria-labelledby="qs-setlists-heading" className="space-y-1.5">
                <div id="qs-setlists-heading" className="typescale-label-sm text-on-surface-variant">
                  Setlists
                </div>
                <div className="space-y-1">
                  {quickResults.matchingSetlists.map((sl, sIdx) => {
                    const flatIdx = quickResults.matchingSongs.length + sIdx;
                    const isActive = quickActiveIdx === flatIdx;
                    const countLabel = `${sl.songIds.length} ${sl.songIds.length === 1 ? 'música' : 'músicas'}`;
                    return (
                      <div
                        key={sl.id}
                        id={`qs-opt-setlist-${sl.id}`}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => {
                          if (!keyboardNavRef.current) setQuickActiveIdx(flatIdx);
                        }}
                        onClick={() => {
                          setSearchOpen(false);
                          setQuickQuery('');
                          navigate(`/setlists/${sl.id}`);
                        }}
                        className={`stage-list-row relative z-10 w-full min-h-[48px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left cursor-pointer ${
                          isActive
                            ? 'bg-transparent'
                            : 'bg-surface-container hover:bg-surface-container-high'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5 min-w-0">
                          <GsIcon
                            name="queue_music"
                            size={20}
                            className="text-on-surface-variant flex-shrink-0"
                          />
                          <span className="typescale-title-md text-on-surface truncate">
                            {sl.name}
                          </span>
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="typescale-body-sm text-on-surface-variant">
                            {countLabel}
                          </span>
                          <GsIcon
                            name="subdirectory_arrow_left"
                            size={18}
                            className={`hidden sm:inline-flex text-on-surface-variant transition-opacity ${
                              isActive ? 'opacity-80' : 'opacity-0'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {quickResults.matchingSongs.length === 0 && quickResults.matchingSetlists.length === 0 && (
            <div className="panel-settle rounded-2xl bg-surface-container-low p-6 text-center space-y-3">
              <p className="typescale-body-md text-on-surface-variant m-0">
                Nenhuma música encontrada para "{quickQuery}".
              </p>
              <AuroraButton
                color="primary-tonal"
                icon="auto_awesome"
                onClick={() => {
                  const q = quickQuery.trim();
                  setSearchOpen(false);
                  setQuickQuery('');
                  navigate(`/add-song?q=${encodeURIComponent(q)}`);
                }}
              >
                Buscar cifra com IA
              </AuroraButton>
            </div>
          )}

          <div className="hidden sm:flex items-center justify-between pt-2 border-t border-outline-variant/50 typescale-body-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <kbd className="font-mono px-1.5 py-0.5 rounded bg-surface-container text-on-surface">
                ↑↓
              </kbd>
              <span>navegar</span>
              <span aria-hidden="true">·</span>
              <kbd className="font-mono px-1.5 py-0.5 rounded bg-surface-container text-on-surface">
                Enter
              </kbd>
              <span>abrir</span>
              <span aria-hidden="true">·</span>
              <kbd className="font-mono px-1.5 py-0.5 rounded bg-surface-container text-on-surface">
                Esc
              </kbd>
              <span>fechar</span>
            </span>
            <span>{flatQuickItems.length} {flatQuickItems.length === 1 ? 'item' : 'itens'}</span>
          </div>
        </div>
      </AuroraDialog>

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Device Preferences Sheet */}
      <AuroraSheet
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        title="Preferências do aparelho"
        subtitle="Salvas localmente neste dispositivo"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Aparência</div>
            <AuroraSegmented<ThemeMode>
              ariaLabel="Tema de cores"
              value={theme}
              onChange={handleSetTheme}
              options={[
                { value: 'light', label: 'Claro', icon: 'light_mode' },
                { value: 'dark', label: 'Escuro', icon: 'dark_mode' },
                { value: 'system', label: 'Sistema', icon: 'contrast' },
              ]}
            />
          </div>

          <div className="space-y-2">
            <div id="pref-palette-label" className="typescale-label-lg text-on-surface">
              Paleta de destaque
            </div>
            <div role="group" aria-labelledby="pref-palette-label" className="grid grid-cols-2 gap-2">
              {PALETTES.map((p) => {
                const active = palette === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPalette(p.id)}
                    className={`swatch-card min-h-[48px] px-3.5 py-2.5 rounded-2xl flex items-center gap-2.5 cursor-pointer text-left ${
                      active
                        ? 'bg-secondary-container text-on-secondary-container ring-1 ring-primary/80'
                        : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.color }}
                      aria-hidden="true"
                    />
                    <span className="typescale-label-lg truncate">{p.label}</span>
                    {active && (
                      <GsIcon name="check" size={20} className="icon-pop-in ml-auto text-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Modo de leitura padrão</div>
            <AuroraSegmented<DisplayMode>
              ariaLabel="Modo de leitura padrão"
              value={displayMode}
              onChange={(m) => setDisplayMode(m)}
              options={[
                { value: 'both', label: 'Cifra' },
                { value: 'lyrics-only', label: 'Letra' },
                { value: 'chords-only', label: 'Acordes' },
              ]}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span id="pref-fontsize-label" className="typescale-label-lg text-on-surface">
                Tamanho da cifra
              </span>
              <span
                aria-live="polite"
                className="typescale-body-sm text-on-surface-variant font-mono tabular-nums"
              >
                {fontSize}%
              </span>
            </div>
            <div role="group" aria-labelledby="pref-fontsize-label" className="flex items-center gap-2">
              <AuroraButton
                color="outlined"
                disabled={fontSize <= 70}
                aria-label="Diminuir tamanho da cifra"
                onClick={() => setFontSize(fontSize - 10)}
              >
                A-
              </AuroraButton>
              <AuroraButton
                color={fontSize === 100 ? 'primary-tonal' : 'outlined'}
                aria-label="Restaurar tamanho da cifra para 100%"
                onClick={() => setFontSize(100)}
              >
                100%
              </AuroraButton>
              <AuroraButton
                color="outlined"
                disabled={fontSize >= 160}
                aria-label="Aumentar tamanho da cifra"
                onClick={() => setFontSize(fontSize + 10)}
              >
                A+
              </AuroraButton>
            </div>
          </div>

          <div className="space-y-2">
            <div className="typescale-label-lg text-on-surface">Atraso inicial da auto-rolagem</div>
            <AuroraSegmented<string>
              ariaLabel="Atraso inicial da auto-rolagem"
              value={String(scrollLeadInSec)}
              onChange={(v) => setScrollLeadInSec(Number(v) as ScrollLeadIn)}
              options={[
                { value: '0', label: 'Imediato' },
                { value: '3', label: '3 seg' },
                { value: '5', label: '5 seg' },
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container p-4">
            <div className="min-w-0">
              <div id="pref-visual-pulse-label" className="typescale-label-lg text-on-surface">
                Pulso visual do metrônomo
              </div>
              <div id="pref-visual-pulse-desc" className="typescale-body-sm text-on-surface-variant">
                Exibe barra de batidas no topo da cifra
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={visualPulseEnabled}
              aria-labelledby="pref-visual-pulse-label"
              aria-describedby="pref-visual-pulse-desc"
              onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
              className={`stage-btn typescale-label-lg flex-shrink-0 min-w-[120px] px-3.5 ${
                visualPulseEnabled
                  ? 'stage-btn-primary-tonal'
                  : 'stage-btn-outlined border-outline'
              }`}
            >
              <GsIcon name={visualPulseEnabled ? 'check_circle' : 'radio_button_unchecked'} size={20} />
              <span aria-hidden="true">{visualPulseEnabled ? 'Ativo' : 'Desligado'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container p-4">
            <div className="min-w-0">
              <div id="pref-shortcuts-label" className="typescale-label-lg text-on-surface">
                Atalhos de 1 tecla no palco
              </div>
              <div id="pref-shortcuts-desc" className="typescale-body-sm text-on-surface-variant">
                Espaço, C, L, F, S e setas fora de campos de texto
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={singleKeyShortcuts}
              aria-labelledby="pref-shortcuts-label"
              aria-describedby="pref-shortcuts-desc"
              onClick={() => setSingleKeyShortcuts(!singleKeyShortcuts)}
              className={`stage-btn typescale-label-lg flex-shrink-0 min-w-[120px] px-3.5 ${
                singleKeyShortcuts
                  ? 'stage-btn-primary-tonal'
                  : 'stage-btn-outlined border-outline'
              }`}
            >
              <GsIcon name={singleKeyShortcuts ? 'check_circle' : 'radio_button_unchecked'} size={20} />
              <span aria-hidden="true">{singleKeyShortcuts ? 'Ativo' : 'Desligado'}</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pref-device-name" className="typescale-label-lg text-on-surface block">
              Nome deste aparelho (ao vivo)
            </label>
            <input
              id="pref-device-name"
              type="text"
              value={deviceName}
              onChange={(e) => {
                setDeviceName(e.target.value);
                try {
                  localStorage.setItem('jamshelf-device-name', e.target.value);
                } catch {
                  // ignore
                }
              }}
              placeholder="Ex.: iPad Violão, Celular Voz..."
              className="stage-field"
            />
            <p className="typescale-body-sm text-on-surface-variant m-0">
              Exibido para a banda quando você lidera uma sessão ao vivo.
            </p>
          </div>
        </div>
      </AuroraSheet>
    </div>
  );
}

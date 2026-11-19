'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import {
  useDisplayStore,
  type DisplayMode,
  type ScrollLeadIn,
  type ThemeMode,
} from '@/lib/stores/display-store';
import { QuickSearchModal } from './QuickSearchModal';

const DEVICE_NAME_EVENT = 'jamshelf-device-name-change';

function subscribeDeviceName(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(DEVICE_NAME_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(DEVICE_NAME_EVENT, cb);
  };
}

function getDeviceNameSnapshot(): string {
  try {
    return localStorage.getItem('jamshelf-device-name') || '';
  } catch {
    return '';
  }
}

function getDeviceNameServerSnapshot(): string {
  return '';
}

function subscribeDesktopViewport(cb: () => void) {
  const mql = window.matchMedia('(min-width: 1024px)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getDesktopViewportSnapshot(): boolean {
  return window.matchMedia('(min-width: 1024px)').matches;
}

function getDesktopViewportServerSnapshot(): boolean {
  return true;
}

function DeviceSettingsPopover({
  compact = false,
  align = 'rail',
}: {
  compact?: boolean;
  align?: 'rail' | 'top-right';
}) {
  const {
    theme,
    setTheme,
    displayMode,
    setDisplayMode,
    fontSize,
    setFontSize,
    visualPulseEnabled,
    setVisualPulseEnabled,
    scrollLeadInSec,
    setScrollLeadInSec,
  } = useDisplayStore();

  const [open, setOpen] = useState(false);
  const deviceName = useSyncExternalStore(
    subscribeDeviceName,
    getDeviceNameSnapshot,
    getDeviceNameServerSnapshot
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleNameChange = (val: string) => {
    try {
      localStorage.setItem('jamshelf-device-name', val);
      window.dispatchEvent(new Event(DEVICE_NAME_EVENT));
    } catch {
      // ignore
    }
  };

  const initial = deviceName.trim().charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Preferências deste aparelho (tema, leitura, fonte e nome no Ao Vivo)"
        className={`rounded-full hover:bg-[var(--surface-high)] inline-flex items-center gap-2.5 transition-colors cursor-pointer ${
          compact ? 'w-11 h-11 justify-center' : 'h-11 px-3 w-full'
        }`}
      >
        <span className="w-8 h-8 rounded-full bg-[var(--primary-container)] text-[var(--accent)] text-xs font-display font-semibold flex items-center justify-center flex-shrink-0">
          {initial || (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="5.2" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M3 13.8c.6-2.6 2.5-4 5-4s4.4 1.4 5 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
        {!compact && (
          <span className="truncate text-[13px] font-medium text-[var(--muted)]">
            {deviceName || 'Ajustes'}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ajustes deste aparelho"
          className={`absolute z-50 w-[min(332px,calc(100vw-24px))] max-h-[calc(100vh-110px)] overflow-y-auto rounded-[24px] bg-[var(--surface)] p-5 flex flex-col gap-4 ${
            align === 'rail'
              ? 'left-0 bottom-[calc(100%+10px)]'
              : 'right-0 top-[calc(100%+10px)]'
          }`}
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <div className="flex items-center justify-between pb-1">
            <span className="font-display text-base text-[var(--ink)]">Preferências do aparelho</span>
            <span className="studio-chip text-[var(--muted)]">Local</span>
          </div>

          {/* Tema */}
          <div className="flex flex-col gap-2">
            <span className="field-label">Tema</span>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-[var(--bg)]">
              {(
                [
                  { id: 'system', label: 'Sistema' },
                  { id: 'light', label: 'Claro' },
                  { id: 'dark', label: 'Escuro' },
                ] as { id: ThemeMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  aria-pressed={theme === opt.id}
                  className={`text-xs font-medium py-1.5 rounded-full transition-colors cursor-pointer ${
                    theme === opt.id
                      ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modo de leitura padrão */}
          <div className="flex flex-col gap-2">
            <span className="field-label">Leitura na música</span>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-[var(--bg)]">
              {(
                [
                  { id: 'both', label: 'Cifra' },
                  { id: 'lyrics-only', label: 'Só letra' },
                  { id: 'chords-only', label: 'Acordes' },
                ] as { id: DisplayMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDisplayMode(opt.id)}
                  aria-pressed={displayMode === opt.id}
                  className={`text-xs font-medium py-1.5 rounded-full transition-colors cursor-pointer ${
                    displayMode === opt.id
                      ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tamanho da fonte */}
          <div className="flex items-center justify-between gap-2">
            <span className="field-label">Tamanho da letra</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFontSize(fontSize - 10)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 text-xs font-mono"
                aria-label="Diminuir fonte"
              >
                A-
              </button>
              <span className="font-expressive text-sm text-[var(--ink)] w-12 text-center">
                {fontSize}%
              </span>
              <button
                type="button"
                onClick={() => setFontSize(fontSize + 10)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 text-xs font-mono"
                aria-label="Aumentar fonte"
              >
                A+
              </button>
            </div>
          </div>

          {/* Atraso do auto-scroll */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-medium text-[var(--ink)]">Atraso do auto-scroll</div>
              <div className="text-xs text-[var(--muted)]">Tempo para segurar o instrumento</div>
            </div>
            <div className="inline-flex gap-1 p-1 rounded-full bg-[var(--bg)]">
              {([0, 3, 5] as ScrollLeadIn[]).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setScrollLeadInSec(sec)}
                  aria-pressed={scrollLeadInSec === sec}
                  className={`font-mono text-xs px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                    scrollLeadInSec === sec
                      ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)] font-semibold'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {sec === 0 ? '0s' : `${sec}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Pulso visual */}
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <div>
              <div className="text-[13px] font-medium text-[var(--ink)]">Pulso visual do metrônomo</div>
              <div className="text-xs text-[var(--muted)]">Pisca a borda da tela no tempo</div>
            </div>
            <input
              type="checkbox"
              checked={visualPulseEnabled}
              onChange={(e) => setVisualPulseEnabled(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
          </label>

          {/* Nome do aparelho */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jamshelf-device-name" className="field-label">
              Seu nome no Ao Vivo
            </label>
            <input
              id="jamshelf-device-name"
              type="text"
              value={deviceName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex.: Alex - Violão"
              className="studio-input px-3.5 py-2 text-sm w-full"
            />
          </div>

          <p className="text-xs text-[var(--muted)] leading-relaxed pt-1">
            Salvo apenas neste aparelho. Não altera a visão dos outros músicos.
          </p>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const entries = useSongStore((s) => s.entries);
  const getSongs = useSongStore((s) => s.getSongs);
  const setlists = useSetlistStore((s) => s.setlists);
  const fetchEntries = useSongStore((s) => s.fetchEntries);
  const fetchSetlists = useSetlistStore((s) => s.fetchSetlists);
  const songSyncError = useSongStore((s) => s.syncError);
  const setlistSyncError = useSetlistStore((s) => s.syncError);
  const clearSongError = useSongStore((s) => s.clearSyncError);
  const clearSetlistError = useSetlistStore((s) => s.clearSyncError);
  const { theme, focusMode, setFocusMode } = useDisplayStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const isDesktopViewport = useSyncExternalStore(
    subscribeDesktopViewport,
    getDesktopViewportSnapshot,
    getDesktopViewportServerSnapshot
  );
  const [railOverride, setRailOverride] = useState<boolean | null>(null);
  const railExpanded = railOverride ?? isDesktopViewport;

  const songs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const favoriteCount = useMemo(() => songs.filter((s) => s.favorite).length, [songs]);

  useEffect(() => {
    void useSongStore.persist.rehydrate();
    void useSetlistStore.persist.rehydrate();
    void useDisplayStore.persist.rehydrate();
    fetchEntries();
    fetchSetlists();
  }, [fetchEntries, fetchSetlists]);

  useEffect(() => {
    if (!useDisplayStore.persist.hasHydrated()) return;
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  useEffect(() => {
    if (!pathname.startsWith('/song/') && focusMode) {
      setFocusMode(false);
    }
  }, [pathname, focusMode, setFocusMode]);

  // Global Cmd/Ctrl+K and '/' quick search shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isSongPage = pathname.startsWith('/song/');
  const isShowMode = isSongPage && searchParams.get('show') === '1';
  const hideChrome = isShowMode || (isSongPage && focusMode);

  const tabParam = searchParams.get('tab');
  const activeSetlistId = pathname.startsWith('/setlists/')
    ? pathname.split('/')[2] || null
    : searchParams.get('setlist');

  const activeNav =
    pathname === '/'
      ? tabParam === 'favorites'
        ? 'favorites'
        : tabParam === 'setlists'
        ? 'setlists'
        : 'songs'
      : pathname.startsWith('/setlists')
      ? 'setlists'
      : pathname.startsWith('/add-song')
      ? 'add'
      : 'songs';

  const syncError = songSyncError || setlistSyncError;

  const handleRetrySync = () => {
    clearSongError();
    clearSetlistError();
    fetchEntries();
    fetchSetlists();
  };

  const handleDismissSync = () => {
    clearSongError();
    clearSetlistError();
  };

  const navItems = [
    {
      key: 'songs',
      label: 'Repertório',
      shortLabel: 'Músicas',
      href: '/',
      count: songs.length,
      active: activeNav === 'songs',
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          {active ? (
            <path
              d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"
              fill="currentColor"
            />
          ) : (
            <path
              d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      ),
    },
    {
      key: 'favorites',
      label: 'Favoritas',
      shortLabel: 'Favoritas',
      href: '/?tab=favorites',
      count: favoriteCount,
      active: activeNav === 'favorites',
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 20.4s-7.2-4.4-7.2-9.6A4.1 4.1 0 0 1 12 7.9a4.1 4.1 0 0 1 7.2 2.9c0 5.2-7.2 9.6-7.2 9.6Z"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      key: 'setlists',
      label: 'Setlists',
      shortLabel: 'Setlists',
      href: '/?tab=setlists',
      count: setlists.length,
      active: activeNav === 'setlists',
      icon: (active: boolean) => (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7h11M4 12h11M4 17h7"
            stroke="currentColor"
            strokeWidth={active ? '2.1' : '1.8'}
            strokeLinecap="round"
          />
          <path
            d="M18 6v9.5a2.3 2.3 0 1 1-1.6-2.2V8.2l3.6-1V5.4L18 6Z"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ];

  // On song pages keep rail collapsed by default so the chord sheet gets maximum horizontal space
  const isExpandedRail = railExpanded && !isSongPage;

  return (
    <div
      className={`min-h-screen flex bg-[var(--bg)] text-[var(--ink)] ${
        isSongPage ? 'h-screen overflow-hidden' : ''
      }`}
    >
      {/* Desktop & Tablet GM3 Navigation Rail */}
      {!hideChrome && (
        <aside
          aria-label="Navegação principal"
          className={`hidden md:flex flex-col justify-between flex-shrink-0 sticky top-0 h-screen z-40 bg-[var(--bg)] py-5 transition-[width] duration-200 select-none ${
            isExpandedRail ? 'w-[208px] px-4' : 'w-[88px] px-2 items-center'
          }`}
        >
          {/* Top section: Menu toggle + Extended/Standard GM3 FAB */}
          <div className={`flex flex-col gap-5 ${isExpandedRail ? 'items-start w-full' : 'items-center'}`}>
            <div className={`flex items-center gap-2 ${isExpandedRail ? 'w-full justify-between pl-1' : ''}`}>
              <button
                type="button"
                onClick={() => setRailOverride(!railExpanded)}
                aria-label={isExpandedRail ? 'Recolher barra lateral' : 'Expandir barra lateral'}
                title={isExpandedRail ? 'Recolher menu' : 'Expandir menu'}
                className="w-11 h-11 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] transition-colors cursor-pointer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {isExpandedRail && (
                <Link
                  href="/"
                  className="font-expressive text-[19px] text-[var(--ink)] tracking-[-0.02em] pr-2 hover:text-[var(--accent)] transition-colors"
                >
                  Jamshelf
                </Link>
              )}
            </div>

            <Link
              href="/add-song"
              title="Adicionar nova música"
              className={`gm3-fab h-14 ${
                isExpandedRail ? 'px-5 w-full justify-start text-[14px]' : 'w-14'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="flex-shrink-0">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
              {isExpandedRail && <span>Nova música</span>}
            </Link>
          </div>

          {/* Center section: Primary navigation items + Pinned setlists */}
          <div className="flex-1 flex flex-col justify-start gap-6 overflow-y-auto no-scrollbar py-6 w-full">
            <nav aria-label="Menu principal" className={`flex flex-col ${isExpandedRail ? 'gap-1.5' : 'gap-4 items-center'}`}>
              {navItems.map((item) =>
                isExpandedRail ? (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={item.active ? 'page' : undefined}
                    className={`h-11 px-4 rounded-full flex items-center justify-between gap-2 text-[14px] font-medium transition-colors ${
                      item.active
                        ? 'bg-[var(--secondary-container)] text-[var(--secondary)]'
                        : 'text-[var(--muted)] hover:bg-[var(--surface-high)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="flex-shrink-0">{item.icon(item.active)}</span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="font-mono text-xs opacity-75 tabular-nums">{item.count}</span>
                  </Link>
                ) : (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={item.active ? 'page' : undefined}
                    className="group flex flex-col items-center gap-1 w-full"
                  >
                    <span
                      className={`w-14 h-8 rounded-full flex items-center justify-center transition-colors ${
                        item.active
                          ? 'bg-[var(--secondary-container)] text-[var(--secondary)]'
                          : 'text-[var(--muted)] group-hover:bg-[var(--surface-high)] group-hover:text-[var(--ink)]'
                      }`}
                    >
                      {item.icon(item.active)}
                    </span>
                    <span
                      className={`text-xs font-medium transition-colors ${
                        item.active ? 'text-[var(--ink)]' : 'text-[var(--muted)]'
                      }`}
                    >
                      {item.shortLabel}
                    </span>
                  </Link>
                )
              )}
            </nav>

            {/* Quick setlists list when rail is expanded */}
            {isExpandedRail && setlists.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="px-4 text-xs font-medium text-[var(--muted)]">Setlists</div>
                <nav aria-label="Setlists fixados" className="flex flex-col gap-0.5 max-h-48 overflow-y-auto no-scrollbar">
                  {setlists.slice(0, 6).map((sl) => {
                    const isActive = activeSetlistId === sl.id;
                    return (
                      <Link
                        key={sl.id}
                        href={`/setlists/${sl.id}`}
                        aria-current={isActive ? 'page' : undefined}
                        className={`h-9 px-4 rounded-full flex items-center justify-between gap-2 text-[13px] transition-colors ${
                          isActive
                            ? 'bg-[var(--secondary-container)] text-[var(--secondary)] font-medium'
                            : 'text-[var(--muted)] hover:bg-[var(--surface-high)] hover:text-[var(--ink)]'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isActive ? 'bg-[var(--accent)]' : 'bg-[var(--tune-dot)]'
                            }`}
                          />
                          <span className="truncate">{sl.name}</span>
                        </span>
                        <span className="font-mono text-xs opacity-70 tabular-nums">{sl.songIds.length}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>

          {/* Bottom section: Quick Search + Device Settings */}
          <div className={`flex flex-col gap-1.5 w-full ${isExpandedRail ? '' : 'items-center'}`}>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Busca rápida (/ ou Ctrl+K)"
              className={`rounded-full hover:bg-[var(--surface-high)] text-[var(--muted)] hover:text-[var(--ink)] inline-flex items-center gap-2.5 transition-colors cursor-pointer ${
                isExpandedRail ? 'h-11 px-4 justify-between w-full' : 'w-11 h-11 justify-center'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
                  <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
                {isExpandedRail && <span className="text-[13px] font-medium">Buscar</span>}
              </span>
              {isExpandedRail && (
                <kbd className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-[var(--surface)] text-[var(--muted)]">
                  /
                </kbd>
              )}
            </button>

            <DeviceSettingsPopover compact={!isExpandedRail} align="rail" />
          </div>
        </aside>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Compact mobile-only utility row (no heavy Cloud Console chrome) */}
        {!hideChrome && !isSongPage && (
          <header className="md:hidden flex items-center justify-between gap-2 px-4 pt-3 pb-1">
            <Link href="/" className="font-expressive text-xl text-[var(--ink)]">
              Jamshelf
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Busca rápida"
                className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--muted)] hover:bg-[var(--surface-high)] cursor-pointer"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
                  <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
              <DeviceSettingsPopover compact align="top-right" />
            </div>
          </header>
        )}

        {/* Sync error banner */}
        {syncError && !isShowMode && (
          <div role="status" className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-3">
            <div className="w-full rounded-2xl bg-[var(--rec-dim)] text-[var(--on-rec-container)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--rec)] flex-shrink-0" />
                <span>{syncError}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRetrySync}
                  className="pill-btn px-3 py-1 text-xs"
                >
                  Recarregar
                </button>
                <button
                  type="button"
                  onClick={handleDismissSync}
                  className="px-2 py-1 text-xs opacity-80 hover:opacity-100 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          className={`flex-1 flex flex-col min-w-0 min-h-0 ${
            !isSongPage && !hideChrome ? 'pb-36 md:pb-0' : ''
          }`}
        >
          {children}
        </div>
      </div>

      {/* Mobile floating GM3 FAB + Bottom Navigation Bar */}
      {!hideChrome && !isSongPage && (
        <>
          {!pathname.startsWith('/add-song') && !pathname.startsWith('/setlists/') && tabParam !== 'setlists' && (
            <Link
              href="/add-song"
              aria-label="Nova música"
              className="md:hidden gm3-fab fixed right-4 bottom-20 z-30 h-14 px-5 text-sm shadow-md"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <span>Nova música</span>
            </Link>
          )}

          <nav
            aria-label="Navegação móvel"
            className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface-high)]/95 backdrop-blur-md"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="grid grid-cols-3 h-16 px-2">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  className="flex flex-col items-center justify-center gap-1"
                >
                  <span
                    className={`w-16 h-8 rounded-full flex items-center justify-center transition-colors ${
                      item.active
                        ? 'bg-[var(--secondary-container)] text-[var(--secondary)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {item.icon(item.active)}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      item.active ? 'text-[var(--ink)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {item.shortLabel}
                  </span>
                </Link>
              ))}
            </div>
          </nav>
        </>
      )}

      <QuickSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

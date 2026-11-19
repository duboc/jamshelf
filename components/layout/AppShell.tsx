'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useDisplayStore, type DisplayMode, type ScrollLeadIn, type ThemeMode } from '@/lib/stores/display-store';
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

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7 flex-shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--surface2)" stroke="var(--line)" strokeWidth="1" />
      <path
        d="M7 20.5h18M7 15.5h18M7 10.5h11"
        stroke="var(--muted)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M9 21c2.5 0 2.5-6 5-6s2.5 8 5 8 2.5-11 5-11"
        fill="none"
        stroke="var(--tune)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="24" cy="9.5" r="2.3" fill="var(--accent)" />
    </svg>
  );
}

function DeviceSettingsPopover() {
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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Ajustes deste aparelho (aparência, leitura, fonte e nome no ao vivo)"
        className="pill-btn px-3 py-1.5 text-[13px]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="opacity-80">
          <circle cx="8" cy="5.2" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2.8 14c.6-2.8 2.6-4.2 5.2-4.2s4.6 1.4 5.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="max-w-[11ch] truncate hidden sm:inline">
          {deviceName || 'Ajustes'}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={`opacity-65 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ajustes deste aparelho"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col gap-4"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {/* Aparência */}
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Aparência</span>
            <div className="inline-flex rounded-full border border-[var(--line)] overflow-hidden self-start">
              {(
                [
                  { id: 'system', label: 'Sistema' },
                  { id: 'dark', label: 'Escuro' },
                  { id: 'light', label: 'Claro' },
                ] as { id: ThemeMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  aria-pressed={theme === opt.id}
                  className={`font-mono text-[11px] px-2.5 py-1.5 transition-colors cursor-pointer ${
                    theme === opt.id
                      ? 'bg-[var(--surface2)] text-[var(--ink)] font-semibold'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modo de leitura padrão */}
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Leitura na música</span>
            <div className="inline-flex rounded-full border border-[var(--line)] overflow-hidden self-start">
              {(
                [
                  { id: 'both', label: 'Cifra + Letra' },
                  { id: 'lyrics-only', label: 'Só letra' },
                  { id: 'chords-only', label: 'Só acordes' },
                ] as { id: DisplayMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDisplayMode(opt.id)}
                  aria-pressed={displayMode === opt.id}
                  className={`font-mono text-[11px] px-2.5 py-1.5 transition-colors cursor-pointer ${
                    displayMode === opt.id
                      ? 'bg-[var(--surface2)] text-[var(--ink)] font-semibold'
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
            <span className="eyebrow">Tamanho da letra</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFontSize(fontSize - 10)}
                className="pill-btn w-7 h-7 text-xs font-mono"
                aria-label="Diminuir fonte"
              >
                A-
              </button>
              <span className="font-mono text-xs text-[var(--ink)] w-11 text-center tabular-nums">
                {fontSize}%
              </span>
              <button
                type="button"
                onClick={() => setFontSize(fontSize + 10)}
                className="pill-btn w-7 h-7 text-xs font-mono"
                aria-label="Aumentar fonte"
              >
                A+
              </button>
            </div>
          </div>

          {/* Contagem do auto-scroll */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="eyebrow">Atraso do auto-scroll</div>
              <div className="text-[11px] text-[var(--muted)]">Tempo para segurar o instrumento</div>
            </div>
            <div className="inline-flex rounded-full border border-[var(--line)] overflow-hidden">
              {([0, 3, 5] as ScrollLeadIn[]).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setScrollLeadInSec(sec)}
                  aria-pressed={scrollLeadInSec === sec}
                  className={`font-mono text-[11px] px-2 py-1 transition-colors cursor-pointer ${
                    scrollLeadInSec === sec
                      ? 'bg-[var(--surface2)] text-[var(--ink)] font-semibold'
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
              <div className="text-[13px] font-semibold text-[var(--ink)]">Pulso visual do metrônomo</div>
              <div className="text-[11px] text-[var(--muted)]">Pisca a borda da tela no tempo</div>
            </div>
            <input
              type="checkbox"
              checked={visualPulseEnabled}
              onChange={(e) => setVisualPulseEnabled(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
          </label>

          {/* Nome do aparelho para sessão ao vivo */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jamshelf-device-name" className="eyebrow">
              Seu nome no Ao Vivo
            </label>
            <input
              id="jamshelf-device-name"
              type="text"
              value={deviceName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex.: Alex - Violão"
              className="studio-input px-3 py-1.5 text-sm w-full"
            />
          </div>

          <p className="font-mono text-[10.5px] text-[var(--muted)] leading-relaxed">
            Preferências salvas só neste aparelho. Não afetam os outros músicos da banda.
          </p>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fetchEntries = useSongStore((s) => s.fetchEntries);
  const fetchSetlists = useSetlistStore((s) => s.fetchSetlists);
  const songSyncError = useSongStore((s) => s.syncError);
  const setlistSyncError = useSetlistStore((s) => s.syncError);
  const clearSongError = useSongStore((s) => s.clearSyncError);
  const clearSetlistError = useSetlistStore((s) => s.clearSyncError);
  const { theme, focusMode, setFocusMode } = useDisplayStore();

  const [searchOpen, setSearchOpen] = useState(false);

  // Initial library sync
  useEffect(() => {
    fetchEntries();
    fetchSetlists();
  }, [fetchEntries, fetchSetlists]);

  // Apply theme attribute to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  // Automatically leave focus mode when navigating away from a song page
  useEffect(() => {
    if (!pathname.startsWith('/song/') && focusMode) {
      setFocusMode(false);
    }
  }, [pathname, focusMode, setFocusMode]);

  // Global Cmd/Ctrl+K quick search shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isSongPage = pathname.startsWith('/song/');
  const isShowMode = isSongPage && searchParams.get('show') === '1';
  const hideChrome = isShowMode || (isSongPage && focusMode);

  const tabParam = searchParams.get('tab');
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

  return (
    <div className={`min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] ${isSongPage ? 'h-screen overflow-hidden' : ''}`}>
      {!hideChrome && (
        <header className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-md z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
            {/* Brand */}
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[var(--ink)] hover:opacity-90 transition-opacity flex-shrink-0"
            >
              <BrandMark />
              <span className="font-display text-xl sm:text-[22px] tracking-tight leading-none">
                Jamshelf
              </span>
            </Link>

            {/* Primary pill tabs (desktop / tablet) */}
            <nav
              aria-label="Seções principais"
              className="hidden md:flex items-center gap-1 p-1 rounded-full bg-[var(--surface2)]"
            >
              {[
                { key: 'songs', label: 'Músicas', href: '/' },
                { key: 'favorites', label: 'Favoritas', href: '/?tab=favorites' },
                { key: 'setlists', label: 'Setlists', href: '/?tab=setlists' },
              ].map((item) => {
                const isActive = activeNav === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold transition-all ${
                      isActive
                        ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-sm)]'
                        : 'text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="pill-btn px-3 py-1.5 text-[13px] text-[var(--muted)]"
                title="Busca rápida em músicas e setlists (Ctrl+K)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m10.8 10.8 3.2 3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span className="hidden sm:inline">Buscar</span>
                <kbd className="hidden lg:inline font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface2)] text-[var(--muted)]">
                  ⌘K
                </kbd>
              </button>

              <Link
                href="/add-song"
                className="pill-btn pill-btn-primary px-3.5 py-1.5 text-[13px] hidden sm:inline-flex"
              >
                + Música
              </Link>

              <DeviceSettingsPopover />
            </div>
          </div>
        </header>
      )}

      {/* Sync error banner */}
      {syncError && !isShowMode && (
        <div
          role="status"
          className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 sm:px-6 py-2"
        >
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <span className="w-2 h-2 rounded-full bg-[var(--sharp)] flex-shrink-0" />
              <span>{syncError}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleRetrySync} className="pill-btn px-2.5 py-1 text-[11.5px]">
                Recarregar
              </button>
              <button
                type="button"
                onClick={handleDismissSync}
                className="text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-1 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main routed content */}
      <div className={`flex-1 flex flex-col min-h-0 ${!isSongPage && !hideChrome ? 'pb-16 md:pb-0' : ''}`}>
        {children}
      </div>

      {/* Mobile bottom navigation bar (shown on library/setlists/add pages, hidden on song reading screens) */}
      {!hideChrome && !isSongPage && (
        <nav
          aria-label="Navegação móvel"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="grid grid-cols-4 h-14">
            <Link
              href="/"
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                activeNav === 'songs' ? 'text-[var(--accent-ink)]' : 'text-[var(--muted)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 5h12M4 10h12M4 15h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              Músicas
            </Link>
            <Link
              href="/?tab=favorites"
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                activeNav === 'favorites' ? 'text-[var(--accent-ink)]' : 'text-[var(--muted)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M10 16.5s-6-3.7-6-8.1A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 6 2.4c0 4.4-6 8.1-6 8.1Z"
                  fill={activeNav === 'favorites' ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              Favoritas
            </Link>
            <Link
              href="/?tab=setlists"
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                activeNav === 'setlists' ? 'text-[var(--accent-ink)]' : 'text-[var(--muted)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 5.5h8M4 10h8M4 14.5h6M15 5v8.5a2 2 0 1 1-1.5-1.9V7l3-.8V4.5L15 5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Setlists
            </Link>
            <Link
              href="/add-song"
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                activeNav === 'add' ? 'text-[var(--accent-ink)]' : 'text-[var(--muted)]'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 6.8v6.4M6.8 10h6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              Adicionar
            </Link>
          </div>
        </nav>
      )}

      <QuickSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

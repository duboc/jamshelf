import { useEffect } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { useAnnotationStore } from '@/lib/stores/annotation-store';
import { AuroraShell, applyColorScheme } from './components/AuroraShell';
import { HomeView } from './views/HomeView';
import { SongView } from './views/SongView';
import { SetlistView } from './views/SetlistView';
import { AddSongView } from './views/AddSongView';
import { SlidesView } from './views/SlidesView';
import { useRoute } from './router';

export function App() {
  const route = useRoute();

  useEffect(() => {
    void (async () => {
      await useDisplayStore.persist.rehydrate();
      try {
        const override = localStorage.getItem('jamshelf-theme');
        if (override === 'dark' || override === 'light') {
          useDisplayStore.getState().setTheme(override);
          applyColorScheme(override);
        } else {
          applyColorScheme(useDisplayStore.getState().theme);
        }
      } catch {
        applyColorScheme(useDisplayStore.getState().theme);
      }
    })();

    void useSongStore.persist.rehydrate();
    void useSetlistStore.persist.rehydrate();
    void useAnnotationStore.persist.rehydrate();
    void useSongStore.getState().fetchEntries();
    void useSetlistStore.getState().fetchSetlists();
  }, []);

  const renderPage = () => {
    const { pathname } = route;

    if (pathname === '/add-song') {
      return <AddSongView />;
    }

    if (pathname === '/slides') {
      return <SlidesView />;
    }

    if (pathname.startsWith('/song/')) {
      const id = decodeURIComponent(pathname.slice('/song/'.length).split('/')[0] || '');
      if (id) return <SongView songId={id} />;
    }

    if (pathname.startsWith('/setlists/')) {
      const id = decodeURIComponent(pathname.slice('/setlists/'.length).split('/')[0] || '');
      if (id) return <SetlistView setlistId={id} />;
    }

    return <HomeView />;
  };

  const viewTransition = route.transition === 'top-level' ? 'none' : route.transition;

  return (
    <AuroraShell>
      <div
        key={route.transitionKey}
        data-transition={viewTransition}
        className="view-enter flex-1 flex flex-col overflow-x-clip"
      >
        {renderPage()}
      </div>
    </AuroraShell>
  );
}

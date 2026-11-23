import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const allowedHosts: true | string[] = process.env.AURORA_ALLOWED_HOSTS
  ? process.env.AURORA_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
  : true;
const apiTarget = process.env.JAMSHELF_API_URL || 'http://127.0.0.1:3000';

/**
 * Optional local-only mock API for isolated UI hillclimbing without touching
 * real Firestore/GCS (enabled strictly via AURORA_MOCK_API=1 during `vite`).
 */
function localMockApiPlugin(): Plugin {
  return {
    name: 'jamshelf-local-mock-api',
    configureServer(server) {
      if (process.env.AURORA_MOCK_API !== '1') return;

      const defaultSongsPath = path.resolve(__dirname, '../lib/data/default-songs.ts');
      const raw = fs.readFileSync(defaultSongsPath, 'utf-8');
      const entries: { id: string; text: string }[] = [];
      const re = /id:\s*"([^"]+)",\s*\n\s*text:\s*`([\s\S]*?)`/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        entries.push({ id: m[1], text: m[2].replace(/\\`/g, '`').replace(/\\\$/g, '$') });
      }

      const setlists = [
        {
          id: 'setlist-ensaio-sexta',
          name: 'Ensaio de sexta',
          songIds: entries.slice(0, 5).map((e) => e.id),
          createdAt: Date.now() - 86400000,
        },
        {
          id: 'setlist-acustico',
          name: 'Show acústico',
          songIds: entries.slice(2, 7).map((e) => e.id),
          createdAt: Date.now() - 3600000,
        },
      ];

      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) return next();

        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (url === '/api/songs' && req.method === 'GET') {
          res.end(JSON.stringify(entries));
          return;
        }
        if (url === '/api/setlists' && req.method === 'GET') {
          res.end(JSON.stringify(setlists));
          return;
        }
        if (url.startsWith('/api/sessions/')) {
          res.end(
            JSON.stringify({
              leaderId: null,
              leaderName: '',
              currentSongId: null,
              isAutoScrolling: false,
              autoScrollSpeed: 1,
              scrollTop: 0,
              scrollRatio: 0,
              metronomeOn: false,
              bpm: 120,
              updatedAt: Date.now(),
            })
          );
          return;
        }
        if (url.startsWith('/api/spotify/search')) {
          res.end(JSON.stringify({ results: [] }));
          return;
        }
        if (url.endsWith('/versions') && req.method === 'GET') {
          res.end(JSON.stringify([]));
          return;
        }
        if (url.endsWith('/annotations') && req.method === 'GET') {
          res.end(JSON.stringify({ strokes: [], notes: [], updatedAt: 0 }));
          return;
        }
        res.end(JSON.stringify({ success: true }));
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  const base = isBuild ? process.env.AURORA_BASE || './' : '/';
  const outDir = process.env.AURORA_OUT || 'dist';
  const useMock = process.env.AURORA_MOCK_API === '1';

  return {
    base,
    plugins: [localMockApiPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@/lib': path.resolve(__dirname, '../lib'),
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom', 'zustand'],
    },
    build: {
      outDir,
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: Number(process.env.AURORA_PORT || 8588),
      strictPort: true,
      allowedHosts,
      fs: {
        allow: [path.resolve(__dirname, '..')],
      },
      proxy: useMock
        ? undefined
        : {
            '/api': {
              target: apiTarget,
              changeOrigin: true,
            },
          },
    },
    preview: {
      host: true,
      port: Number(process.env.AURORA_PORT || 8588),
      strictPort: true,
      allowedHosts,
    },
  };
});

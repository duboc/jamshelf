import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jamshelf',
  description: 'Cifras, letras e setlists para ensaio de banda',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Apply saved theme and HCT palette before hydration to avoid visual flash on load.
const THEME_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('jamshelf-display-mode');if(!raw)return;var st=JSON.parse(raw).state;if(!st)return;var t=st.theme;if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}var p=st.palette;if(p==='violet'||p==='emerald'||p==='terracotta'){document.documentElement.setAttribute('data-palette',p);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght,ROND@6..144,400..700,0..100&family=Google+Sans+Text:wght@400;500;700&family=Google+Sans+Mono:wght@400;500;600;700&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Suspense fallback={null}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}

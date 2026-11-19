import type { Metadata, Viewport } from 'next';
import { Gloock, Hanken_Grotesk, Martian_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

const gloock = Gloock({
  weight: '400',
  variable: '--font-gloock',
  subsets: ['latin'],
});

const hankenGrotesk = Hanken_Grotesk({
  weight: ['400', '500', '600', '700'],
  variable: '--font-hanken',
  subsets: ['latin'],
});

const martianMono = Martian_Mono({
  weight: ['400', '500', '600', '700'],
  variable: '--font-martian',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Jamshelf',
  description: 'Cifras, letras e setlists para ensaio de banda',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Apply saved theme before hydration to avoid light/dark flash on load.
const THEME_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('jamshelf-display-mode');if(!raw)return;var t=JSON.parse(raw).state&&JSON.parse(raw).state.theme;if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${gloock.variable} ${hankenGrotesk.variable} ${martianMono.variable} antialiased`}
      >
        <Suspense fallback={null}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}

'use client';

import { DM_Sans, JetBrains_Mono, Syne } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

const syne = Syne({
  variable: '--font-syne',
  subsets: ['latin'],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <title>Jamshelf</title>
        <meta name="description" content="Band rehearsal chord sheet app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} ${syne.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import React from 'react';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ficcado — Inventory & Sales Management',
  description:
    'Internal management platform for Ficcado clothing — inventory, sales, replacements, returns, and warehouse tracking.',
  icons: {
    icon: [
      { url: '/ficcado_logo.png', type: 'image/png' },
    ],
    shortcut: '/ficcado_logo.png',
    apple: '/ficcado_logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full`}
      style={{
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
      }}
    >
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        {children}
      </body>
    </html>
  );
}

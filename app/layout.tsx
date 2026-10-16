import type { Metadata, Viewport } from 'next';
import { orbitron } from './fonts.ts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pac Ben',
  description: 'Shoot the robots, clear the maze. Thirty levels, six bosses.',
  applicationName: 'Pac Ben',
  appleWebApp: { capable: true, title: 'Pac Ben', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#03050d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={orbitron.variable}>
      <body>{children}</body>
    </html>
  );
}

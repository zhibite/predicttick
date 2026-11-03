import type { Metadata } from 'next';
import './globals.css';
import { Outfit } from 'next/font/google';
import { ThemeProvider } from '@/context/ThemeContext';
import { SidebarProvider } from '@/context/SidebarContext';
import { NoFlash } from '@/components/NoFlash';

const outfit = Outfit({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PolyKlines — Polymarket Up/Down Explorer",
  description:
    "Explore 5-minute and 15-minute Polymarket Up/Down klines for BTC, ETH, BNB, SOL, DOGE, XRP and HYPE.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <NoFlash />
      </head>
      <body className={`${outfit.className} dark:bg-zinc-900`}>
        <ThemeProvider>
          <SidebarProvider>
            {children}
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

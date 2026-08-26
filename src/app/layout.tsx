import './globals.css';
import { Outfit } from 'next/font/google';
import { ThemeProvider } from '@/context/ThemeContext';
import { SidebarProvider } from '@/context/SidebarContext';
import { NoFlash } from '@/components/NoFlash';

const outfit = Outfit({
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL("https://predicttick.com"),
  title: {
    default: "PredictTick | Polymarket UP/DOWN K-Line Monitor - 5Min & 15Min",
    template: "%s | PredictTick",
  },
  description: "PredictTick monitors Polymarket UP/DOWN market K-lines for 7 cryptocurrencies (BTC, ETH, BNB, SOL, DOGE, XRP, HYPE) across 5-minute and 15-minute intervals. Track historical data and trends.",
  keywords: [
    "PredictTick",
    "predicttick.com",
    "Polymarket",
    "Polymarket UP DOWN",
    "K-line chart",
    "5 minute prediction market",
    "15 minute prediction market",
    "crypto prediction market",
    "binary trading",
    "BTC prediction",
    "ETH prediction",
    "historical market data",
  ],
  authors: [{ name: "PredictTick", url: "https://predicttick.com" }],
  creator: "PredictTick",
  publisher: "PredictTick",
  alternates: {
    canonical: "https://predicttick.com",
  },
  openGraph: {
    title: "PredictTick - Polymarket UP/DOWN K-Line Monitor",
    description: "Historical K-line charts for Polymarket UP/DOWN prediction markets. Track 7 cryptocurrencies across 5Min and 15Min intervals.",
    url: "https://predicttick.com",
    siteName: "PredictTick",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PredictTick - Polymarket K-Line Monitor",
    description: "Polymarket UP/DOWN historical K-line charts for 7 cryptocurrencies.",
    site: "@predicttick",
  },
  robots: {
    index: true,
    follow: true,
  },
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

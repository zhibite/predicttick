import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";

import { ThemeProvider } from "@/context/ThemeContext";
import Link from "next/link";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-zinc-900 sm:p-0">
      <ThemeProvider>
        <div className="relative flex lg:flex-row w-full h-screen justify-center flex-col  dark:bg-zinc-900 sm:p-0">
          {children}
          <div className="lg:w-1/2 w-full h-full bg-brand-950 dark:bg-white/5 lg:grid items-center hidden">
            <div className="relative items-center justify-center  flex z-1">
              {/* <!-- ===== Common Grid Shape Start ===== --> */}
              <GridShape />
              <div className="flex flex-col items-center max-w-xs">
                <Link href="/" className="mb-4 block text-3xl font-semibold text-white">
                  PolyKlines
                </Link>
                <p className="text-center text-gray-400 dark:text-white/60">
                  Polymarket Up/Down market data, backtesting and API access.
                </p>
                <div className="mt-6 flex items-center gap-4 text-sm">
                  <Link href="/markets" className="text-brand-300 hover:text-white">
                    Markets
                  </Link>
                  <Link href="/pricing" className="text-brand-300 hover:text-white">
                    Pricing
                  </Link>
                  <Link href="/signin" className="text-brand-300 hover:text-white">
                    Sign in
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <ThemeTogglerTwo />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}

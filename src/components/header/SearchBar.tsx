"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchStatus = "idle" | "searching" | "found" | "not-found";

export const SearchBar: React.FC = () => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inflightRef.current) inflightRef.current.abort();

    const q = query.trim();
    if (!q) {
      setStatus("idle");
      return;
    }

    setStatus("searching");
    debounceRef.current = setTimeout(async () => {
      const ac = new AbortController();
      inflightRef.current = ac;
      try {
        const res = await fetch(
          `/api/polymarkets/search?q=${encodeURIComponent(q)}`,
          { cache: "no-store", signal: ac.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { found: boolean; windows?: Array<{ slug: string }> };
        if (json.found && json.windows && json.windows.length > 0) {
          setStatus("found");
          const slug = json.windows[0].slug;
          setQuery("");
          router.push(`/polymarket/${encodeURIComponent(slug)}`);
        } else {
          setStatus("not-found");
          router.push(`/polymarket/market-not-found?q=${encodeURIComponent(q)}`);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus("idle");
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setStatus("idle");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isSearching = query.trim().length > 0;
  const trimmed = query.trim();

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            className="fill-gray-500 dark:fill-gray-400"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
              fill=""
            />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter slug, e.g. btc-updown-5m-1787710592"
          className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {isSearching ? (
            <span className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
              {status === "searching"
                ? "Searching..."
                : status === "found"
                  ? "Found"
                  : status === "not-found"
                    ? "Not found"
                    : ""}
            </span>
          ) : (
            <span className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
              <span>⌘</span>
              <span>K</span>
            </span>
          )}
        </div>
      </div>

      {status === "not-found" && trimmed && (
        <div className="sr-only">
          No market found for {trimmed}. Format: &lt;asset&gt;-updown-&lt;period&gt;-&lt;epoch&gt;
        </div>
      )}
    </div>
  );
};

export default SearchBar;

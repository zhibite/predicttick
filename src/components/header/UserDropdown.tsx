"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";

interface Me {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  emailVerified: boolean;
  access: {
    planCode: string | null;
    accessUntil: number | null;
    isPaid: boolean;
  };
}

interface MeResponse {
  user: Me | null;
}

export default function UserDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json() as Promise<MeResponse>)
      .then((body) => setMe(body.user))
      .catch(() => {
        // Keep the signed-out state if the request fails.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  function toggleDropdown(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setIsOpen((value) => !value);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setMe(null);
      setIsOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  if (!loaded) {
    return <span className="h-10 w-10 rounded-full bg-gray-100 dark:bg-white/10" />;
  }

  if (!me) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/signin"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="hidden rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 sm:inline-flex"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const displayName = me.name || me.email;
  const initial = displayName.slice(0, 1).toUpperCase();
  const planLabel = me.access.isPaid
    ? me.access.planCode?.replace("_", " ") ?? "Paid"
    : "Free";

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="dropdown-toggle flex items-center text-gray-700 dark:text-gray-400"
      >
        <span className="mr-3 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          {initial}
        </span>
        <span className="mr-2 hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-gray-800 dark:text-white/90">
            {displayName}
          </span>
          <span className="block text-[11px] text-gray-500 dark:text-gray-400">
            {planLabel}
          </span>
        </span>
        <svg
          className={`stroke-gray-500 transition-transform duration-200 dark:stroke-gray-400 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="flex w-[260px] flex-col p-3"
      >
        <div className="border-b border-gray-200 pb-3 dark:border-gray-800">
          <span className="block truncate text-sm font-medium text-gray-700 dark:text-gray-300">
            {displayName}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
            {me.email}
          </span>
          <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {planLabel}
          </span>
        </div>

        <ul className="flex flex-col gap-1 py-3">
          <li>
            <DropdownItem
              tag="a"
              href="/account"
              onItemClick={closeDropdown}
              baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Account
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              tag="a"
              href="/account/billing"
              onItemClick={closeDropdown}
              baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Billing
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              tag="a"
              href="/account/api-keys"
              onItemClick={closeDropdown}
              baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              API keys
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              tag="a"
              href="/account/usage"
              onItemClick={closeDropdown}
              baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Usage
            </DropdownItem>
          </li>
          <li>
            <DropdownItem
              tag="a"
              href="/pricing"
              onItemClick={closeDropdown}
              baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Plans
            </DropdownItem>
          </li>
          {me.role === "admin" && (
            <>
              <li>
                <DropdownItem
                  tag="a"
                  href="/admin/leaderboard"
                  onItemClick={closeDropdown}
                  baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                >
                  Leaderboard addresses
                </DropdownItem>
              </li>
              <li>
                <DropdownItem
                  tag="a"
                  href="/admin/paper"
                  onItemClick={closeDropdown}
                  baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                >
                  Paper trading
                </DropdownItem>
              </li>
              <li>
                <DropdownItem
                  tag="a"
                  href="/admin/payments"
                  onItemClick={closeDropdown}
                  baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                >
                  Payment review
                </DropdownItem>
              </li>
              <li>
                <DropdownItem
                  tag="a"
                  href="/admin/settings/payments"
                  onItemClick={closeDropdown}
                  baseClassName="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                >
                  Payment settings
                </DropdownItem>
              </li>
            </>
          )}
        </ul>

        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </Dropdown>
    </div>
  );
}

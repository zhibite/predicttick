"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function VerifyEmailForm({ token }: { token?: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      if (!token) {
        setStatus("error");
        setMessage("This verification link is missing its token.");
        return;
      }
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!response.ok) {
          setStatus("error");
          setMessage(
            body.error?.message ??
              "This verification link is invalid or has expired.",
          );
          return;
        }
        setStatus("ok");
        setMessage("Your email is verified. You can now sign in.");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Network error. Please try again.");
        }
      }
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-white/[0.03]">
          <h1 className="mb-3 text-xl font-semibold text-gray-800 dark:text-white/90">
            Email verification
          </h1>
          <p
            className={`text-sm ${
              status === "error"
                ? "text-error-600 dark:text-error-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {message}
          </p>
          <Link
            href="/signin"
            className="mt-6 inline-flex rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white hover:bg-brand-600"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

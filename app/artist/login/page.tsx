"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RectLogo } from "@/components/rect-logo";

function ArtistLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/studio";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          surface: "artist",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not log in.");
        return;
      }
      const safeNext =
        nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/studio";
      router.push(safeNext);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="bg-[#040d06] px-4 py-10 text-[#f8f8f8]">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mx-auto w-full max-w-[400px] space-y-4"
      >
        <div className="mb-2 flex justify-center">
          <RectLogo size={48} />
        </div>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#1DB954]">
          Artist OS
        </p>
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          Artist login
        </h1>
        <p className="text-center text-sm text-white/45">
          Separate from RECT SOUND. This does not open your listener account.
        </p>
        <label className="block space-y-1.5">
          <span className="text-xs text-white/45">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="artist@email.com"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-sm outline-none focus:border-[#1DB954]"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-white/45">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your artist password"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-sm outline-none focus:border-[#1DB954]"
          />
        </label>
        {error ? (
          <p className="rounded-lg border border-[#1DB954]/30 bg-[#1DB954]/10 px-3 py-2 text-sm text-[#1DB954]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-[#1DB954] py-3 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Log in to Artist OS"}
        </button>
        <p className="text-center text-sm text-white/45">
          New artist?{" "}
          <Link href="/artist/signup" className="text-[#1DB954] hover:underline">
            Create artist account
          </Link>
        </p>
        <p className="text-center text-sm text-white/35">
          <Link href="/artist" className="hover:text-white/60">
            ← Artist OS
          </Link>
          {" · "}
          <Link href="/auth/login" className="hover:text-white/60">
            Listener login
          </Link>
        </p>
      </form>
    </main>
  );
}

export default function ArtistLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="bg-[#040d06] px-4 py-10 text-center text-white/50">
          Loading…
        </main>
      }
    >
      <ArtistLoginForm />
    </Suspense>
  );
}

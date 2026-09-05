"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RectLogo } from "@/components/rect-logo";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ) {
        setError(
          "App is missing Supabase keys. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the RECT deploy.",
        );
        return;
      }

      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        const msg = authError.message || "Could not log in.";
        // Common Supabase phrasing → clearer copy
        if (/email not confirmed/i.test(msg)) {
          setError(
            "Email not confirmed yet. Check your inbox (or disable confirm-email in Supabase Auth settings for testing).",
          );
        } else if (/invalid login credentials/i.test(msg)) {
          setError("Wrong email or password.");
        } else {
          setError(msg);
        }
        return;
      }

      if (!data.session) {
        setError("Login succeeded but no session was returned. Try again.");
        return;
      }

      // Best-effort profile sync (must not block login).
      void fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          sync_only: true,
        }),
      }).catch(() => undefined);

      const safeNext =
        nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/dashboard";

      // Hard navigation so the next server render sees auth cookies.
      window.location.assign(safeNext);
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
        <div className="mb-6 flex justify-center">
          <RectLogo size={48} />
        </div>
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          Log in
        </h1>
        <label className="block space-y-1.5">
          <span className="text-xs text-white/45">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
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
            placeholder="Your password"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-sm outline-none focus:border-[#1DB954]"
          />
        </label>
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-[#F5A623]/40 bg-[#F5A623]/10 px-3 py-2 text-sm text-[#F5A623]"
          >
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-[#1DB954] py-3 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Log in"}
        </button>
        <p className="text-center text-sm text-white/45">
          New here?{" "}
          <Link href="/auth/signup" className="text-[#1DB954] hover:underline">
            Create account
          </Link>
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="bg-[#040d06] px-4 py-10 text-center text-white/50">
          Loading…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

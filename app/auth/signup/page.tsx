"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RectLogo } from "@/components/rect-logo";

type Role = "fan" | "artist";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("fan");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          display_name: displayName.trim(),
          role,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        has_session?: boolean;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not create account.");
        return;
      }
      if (!data.has_session) {
        setError("Account created — confirm email if required, then log in.");
        return;
      }
      router.push("/dashboard");
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
          Create account
        </h1>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/45">Display name</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={24}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name on RECT"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-sm outline-none focus:border-[#1DB954]"
          />
        </label>

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
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-sm outline-none focus:border-[#1DB954]"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs text-white/45">Account type</legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole("fan")}
              className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${
                role === "fan"
                  ? "border-[#1DB954] bg-[#1DB954] text-black"
                  : "border-white/10 bg-white/[0.04] text-white/70"
              }`}
            >
              Fan
            </button>
            <button
              type="button"
              onClick={() => setRole("artist")}
              className={`rounded-lg border px-3 py-3 text-sm font-medium transition ${
                role === "artist"
                  ? "border-[#1DB954] bg-[#1DB954] text-black"
                  : "border-white/10 bg-white/[0.04] text-white/70"
              }`}
            >
              Artist
            </button>
          </div>
        </fieldset>

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
          {pending ? "Creating…" : "Sign up"}
        </button>

        <p className="text-center text-sm text-white/45">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-[#1DB954] hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}

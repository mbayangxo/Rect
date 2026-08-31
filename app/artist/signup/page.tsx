"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RectLogo } from "@/components/rect-logo";

export default function ArtistOsSignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
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
          role: "artist",
          phone: phone.trim() || null,
          countries: [],
          genres: [],
          languages: [],
          listening_times: [],
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        has_session?: boolean;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not create artist account.");
        return;
      }
      if (!data.has_session) {
        setError("Account created — confirm email if required, then log in.");
        return;
      }
      router.push("/studio");
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
          Create artist account
        </h1>
        <p className="text-center text-sm text-white/45">
          A different login from RECT SOUND. Use another email if you already
          listen on RECT.
        </p>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/45">Artist / stage name</span>
          <input
            required
            minLength={2}
            maxLength={48}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your stage name"
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
            placeholder="artist@email.com"
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
        <label className="block space-y-1.5">
          <span className="text-xs text-white/45">Phone — optional</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+221 70 000 0000"
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
          {pending ? "Creating…" : "Create Artist OS account"}
        </button>

        <p className="text-center text-sm text-white/45">
          Already an artist?{" "}
          <Link href="/artist/login" className="text-[#1DB954] hover:underline">
            Log in
          </Link>
        </p>
        <p className="text-center text-sm text-white/35">
          <Link href="/artist" className="hover:text-white/60">
            ← Artist OS
          </Link>
          {" · "}
          <Link href="/" className="hover:text-white/60">
            Listen on RECT SOUND
          </Link>
        </p>
      </form>
    </main>
  );
}

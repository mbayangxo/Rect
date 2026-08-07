"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ArtistUploadPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!file) {
      setError("Choose an audio file.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setPending(true);
    try {
      const body = new FormData();
      body.set("title", title.trim());
      if (genre.trim()) body.set("genre", genre.trim());
      body.set("audio", file);

      const res = await fetch("/api/tracks/upload", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        error?: string;
        track?: { id?: string; title?: string };
      };

      if (!res.ok || data.error) {
        if (res.status === 401) {
          setError("Sign in required. Go to Log in, then come back.");
          return;
        }
        setError(data.error || "Upload failed.");
        return;
      }

      setSuccess(`Uploaded “${data.track?.title || title}”. Opening home…`);
      setTitle("");
      setGenre("");
      setFile(null);
      window.setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative bg-[#040d06] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-[#1DB954]/15 blur-[100px]"
      />

      <div className="relative mx-auto w-full max-w-lg px-5 py-10 sm:px-6">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs uppercase tracking-[0.2em] text-white/45 hover:text-white"
            >
              ← Home
            </Link>
            <Link
              href="/artist"
              className="text-xs uppercase tracking-[0.2em] text-white/45 hover:text-white"
            >
              Library
            </Link>
          </div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
            Artist portal
          </p>
        </div>

        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Upload a track
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          Audio goes to Supabase Storage. A row is written to{" "}
          <code className="text-[#1DB954]">tracks</code> and shows on home
          immediately.
        </p>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-8 space-y-5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5"
        >
          <label className="block space-y-2">
            <span className="text-[0.65rem] uppercase tracking-[0.2em] text-white/40">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              placeholder="Song title"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-[#1DB954]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.65rem] uppercase tracking-[0.2em] text-white/40">
              Genre (optional)
            </span>
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              maxLength={40}
              placeholder="afrobeats, mbalax, amapiano…"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-[#1DB954]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[0.65rem] uppercase tracking-[0.2em] text-white/40">
              Audio file
            </span>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-[#1DB954] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
            />
            {file ? (
              <p className="text-xs text-white/40">
                {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            ) : null}
          </label>

          {error ? (
            <p className="rounded-lg border border-[#1DB954]/30 bg-[#1DB954]/10 px-3 py-2 text-sm text-[#1DB954]">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-lg border border-[#1DB954]/30 bg-[#1DB954]/10 px-3 py-2 text-sm text-[#1DB954]">
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-[#1DB954] py-3 text-sm font-semibold text-black transition hover:bg-[#17a349] disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Uploading…" : "Publish to RECT →"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/35">
          Must be logged in. Use{" "}
          <Link href="/auth/signup" className="text-[#1DB954] hover:underline">
            Sign up
          </Link>{" "}
          as Artist, or{" "}
          <Link href="/auth/login" className="text-[#1DB954] hover:underline">
            Log in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

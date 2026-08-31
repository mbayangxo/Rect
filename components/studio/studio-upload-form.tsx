"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  CULTURAL_GENRES,
  CULTURAL_LANGUAGES,
  readAudioDurationSecs,
} from "@/lib/cultural-options";

type WriterRow = { id: string; name: string; percent: string };

type Props = {
  displayName: string;
  needsPlaces: boolean;
};

function newWriter(name = "", percent = ""): WriterRow {
  return { id: crypto.randomUUID(), name, percent };
}

export function StudioUploadForm({ displayName, needsPlaces }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("");
  const [masterOwner, setMasterOwner] = useState("");
  const [territory, setTerritory] = useState("");
  const [publishLive, setPublishLive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [writers, setWriters] = useState<WriterRow[]>([
    newWriter(displayName, "100"),
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const splitsTotal = useMemo(
    () =>
      writers.reduce((sum, w) => {
        const n = Number(w.percent);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [writers],
  );
  const splitsOk = Math.abs(splitsTotal - 100) <= 0.01;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Choose an audio file.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!genre.trim()) {
      setError("Genre is required.");
      return;
    }
    if (!language.trim()) {
      setError("Language is required.");
      return;
    }
    if (!splitsOk) {
      setError(`Writer splits must total 100% (now ${splitsTotal.toFixed(1)}%).`);
      return;
    }
    for (const w of writers) {
      if (!w.name.trim()) {
        setError("Each writer needs a name.");
        return;
      }
    }
    if (publishLive) {
      if (needsPlaces) {
        setError("Set at least one place in Portal before publishing.");
        router.push("/studio/portal");
        return;
      }
      if (!cover) {
        setError("Cover art is required to publish.");
        return;
      }
    }

    setPending(true);
    try {
      const durationSecs = await readAudioDurationSecs(file);
      const body = new FormData();
      body.set("title", title.trim());
      body.set("genre", genre.trim());
      body.set("language", language.trim());
      body.set("publish", publishLive ? "1" : "0");
      if (durationSecs != null) body.set("duration_secs", String(durationSecs));
      body.set("audio", file);
      if (cover) body.set("cover", cover);
      if (masterOwner.trim()) body.set("master_owner", masterOwner.trim());
      if (territory.trim()) {
        body.set("territory_of_origin", territory.trim().toUpperCase().slice(0, 2));
      }
      body.set(
        "writers",
        JSON.stringify(
          writers.map((w) => ({
            name: w.name.trim(),
            percent: Number(w.percent),
          })),
        ),
      );

      const res = await fetch("/api/tracks/upload", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as { error?: string; track?: { id?: string } };

      if (res.status === 401) {
        window.location.href = "/artist/login?next=/studio/upload";
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || "Upload failed.");
        return;
      }

      router.push("/studio/tracks");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      <label className="block">
        <span className="text-xs text-white/45">Song title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-white/45">Genre</span>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            required
            className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
          >
            <option value="">Select genre</option>
            {CULTURAL_GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-white/45">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            required
            className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
          >
            <option value="">Select language</option>
            {CULTURAL_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-xs text-white/45">Audio file</span>
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-[#1DB954] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
        />
      </label>

      <label className="block">
        <span className="text-xs text-white/45">
          Cover art {publishLive ? "(required to publish)" : "(optional for draft)"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setCover(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white/15 file:px-4 file:py-2 file:text-sm file:text-white"
        />
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-white/45">Writer splits</span>
          <span className={`text-xs ${splitsOk ? "text-[#1DB954]" : "text-[#F5A623]"}`}>
            Total {splitsTotal.toFixed(1)}%
          </span>
        </div>
        <ul className="space-y-2">
          {writers.map((w, i) => (
            <li key={w.id} className="flex flex-wrap gap-2">
              <input
                value={w.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setWriters((list) =>
                    list.map((row, idx) => (idx === i ? { ...row, name } : row)),
                  );
                }}
                placeholder="Writer name"
                className="min-w-[10rem] flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#1DB954]"
              />
              <input
                value={w.percent}
                onChange={(e) => {
                  const percent = e.target.value;
                  setWriters((list) =>
                    list.map((row, idx) =>
                      idx === i ? { ...row, percent } : row,
                    ),
                  );
                }}
                inputMode="decimal"
                placeholder="%"
                className="w-20 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#1DB954]"
              />
              {writers.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setWriters((list) => list.filter((_, idx) => idx !== i))
                  }
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/50"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setWriters((list) => [...list, newWriter()])}
          className="mt-2 text-xs text-[#1DB954] hover:underline"
        >
          + Add writer
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-white/45">Master owner (optional)</span>
          <input
            value={masterOwner}
            onChange={(e) => setMasterOwner(e.target.value)}
            maxLength={120}
            className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
          />
        </label>
        <label className="block">
          <span className="text-xs text-white/45">Territory of origin (optional)</span>
          <input
            value={territory}
            onChange={(e) => setTerritory(e.target.value.toUpperCase())}
            maxLength={2}
            placeholder="SN"
            className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm uppercase outline-none focus:border-[#1DB954]"
          />
        </label>
      </div>

      <fieldset className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
        <legend className="px-1 text-xs text-white/45">Publish</legend>
        <label className="mt-1 flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="publish-mode"
            checked={publishLive}
            onChange={() => setPublishLive(true)}
            className="accent-[#1DB954]"
          />
          Publish live — appears on Home &amp; Charts
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="publish-mode"
            checked={!publishLive}
            onChange={() => setPublishLive(false)}
            className="accent-[#1DB954]"
          />
          Save as draft
        </label>
      </fieldset>

      {needsPlaces && publishLive ? (
        <p className="text-sm text-[#F5A623]">
          Set your place in{" "}
          <a href="/studio/portal" className="underline">
            Portal
          </a>{" "}
          before publishing to Charts.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !splitsOk}
        className="w-full rounded-full bg-[#1DB954] py-3.5 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
      >
        {pending ? "Uploading…" : publishLive ? "Upload & publish" : "Save draft"}
      </button>
    </form>
  );
}

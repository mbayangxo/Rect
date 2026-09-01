"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { PortalRelease } from "@/lib/dashboard/portal-releases";

type Props = {
  artistId: string;
  initialReleases: PortalRelease[];
};

const KINDS = [
  { id: "release", label: "Release" },
  { id: "remix", label: "Remix" },
  { id: "visual", label: "Visual" },
  { id: "personal", label: "Personal" },
  { id: "world", label: "World" },
] as const;

export function StudioPortalWorlds({ artistId, initialReleases }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [releases, setReleases] = useState(initialReleases);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("release");
  const [description, setDescription] = useState("");
  const [themeColor, setThemeColor] = useState("#1DB954");
  const [pending, setPending] = useState(false);
  const [mediaPending, setMediaPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createRelease(publish: boolean) {
    if (!title.trim()) {
      setError("Title required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/artist/portal/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          kind,
          description: description.trim() || undefined,
          theme_color: themeColor,
          published: publish,
        }),
      });
      const data = (await res.json()) as { error?: string; release?: PortalRelease };
      if (!res.ok) {
        setError(data.error ?? "Create failed.");
        return;
      }
      if (data.release) setReleases((r) => [...r, data.release!]);
      setTitle("");
      setDescription("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function uploadMedia(releaseId: string, file: File) {
    setMediaPending(releaseId);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("kind", file.type.startsWith("video/") ? "video" : "photo");
      const res = await fetch(`/api/artist/portal/releases/${releaseId}/media`, {
        method: "POST",
        body,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setMediaPending(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/45">
          Portal worlds
        </h2>
        <p className="mt-1 text-sm text-white/40">
          Separate from your public artist profile — remixes, visuals, personal drops,
          and immersive releases fans enter as a different world.
        </p>
      </div>

      {releases.length > 0 ? (
        <ul className="space-y-3">
          {releases.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-white/[0.08] overflow-hidden"
              style={{ borderColor: `${r.themeColor}40` }}
            >
              <div
                className="h-2"
                style={{ backgroundColor: r.themeColor }}
              />
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs uppercase text-white/35">{r.kind}</p>
                  </div>
                  <Link
                    href={`/artists/${artistId}/world/${r.id}`}
                    className="text-xs text-[#1DB954] hover:underline"
                  >
                    Preview world →
                  </Link>
                </div>
                {r.description ? (
                  <p className="mt-2 text-sm text-white/45 line-clamp-2">{r.description}</p>
                ) : null}
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-white/50">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    disabled={mediaPending === r.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadMedia(r.id, f);
                    }}
                  />
                  {mediaPending === r.id ? "Uploading…" : "+ Add photo or video"}
                </label>
                {r.media.length > 0 ? (
                  <p className="mt-1 text-xs text-white/30">{r.media.length} media item(s)</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/35">No portal worlds yet.</p>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="World title"
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What fans experience in this world"
          rows={3}
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-3 text-xs text-white/45">
          Theme color
          <input
            type="color"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent"
          />
        </label>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => void createRelease(true)}
            className="rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            Publish world
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void createRelease(false)}
            className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/60"
          >
            Save draft
          </button>
        </div>
      </div>
    </section>
  );
}

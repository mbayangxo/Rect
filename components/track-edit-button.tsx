"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Props = {
  trackId: string;
  title: string;
  genre: string | null;
  hasCover?: boolean;
};

export function TrackEditButton({
  trackId,
  title,
  genre,
  hasCover = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nextTitle, setNextTitle] = useState(title);
  const [nextGenre, setNextGenre] = useState(genre ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function openEditor() {
    setNextTitle(title);
    setNextGenre(genre ?? "");
    setCoverFile(null);
    setRemoveCover(false);
    setError(null);
    setSaved(false);
    setOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const titleChanged = nextTitle.trim() !== title.trim();
      const genreChanged = (nextGenre.trim() || null) !== (genre ?? null);

      if (titleChanged || genreChanged) {
        const res = await fetch(`/api/tracks/${trackId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: nextTitle.trim(),
            genre: nextGenre.trim() || null,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok || data.error) {
          setError(data.error || "Could not save metadata");
          return;
        }
      }

      if (coverFile) {
        const form = new FormData();
        form.append("cover", coverFile);
        const res = await fetch(`/api/tracks/${trackId}/cover`, {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok || data.error) {
          setError(data.error || "Could not update cover");
          return;
        }
      } else if (removeCover && hasCover) {
        const res = await fetch(`/api/tracks/${trackId}/cover`, {
          method: "DELETE",
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok || data.error) {
          setError(data.error || "Could not remove cover");
          return;
        }
      }

      if (!titleChanged && !genreChanged && !coverFile && !removeCover) {
        setOpen(false);
        return;
      }

      setSaved(true);
      setCoverFile(null);
      setRemoveCover(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openEditor())}
        className="rounded-full border border-white/20 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white/50 hover:border-white/40 hover:text-white/80"
      >
        {open ? "Close" : "Edit"}
      </button>
      {saved && !open ? (
        <p className="mt-1 text-[0.55rem] uppercase tracking-[0.12em] text-[#1DB954]">
          Saved
        </p>
      ) : null}

      {open ? (
        <form
          onSubmit={onSave}
          className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-white/15 bg-[#071208] p-3 text-left shadow-xl"
        >
          <label className="block text-[0.55rem] uppercase tracking-[0.14em] text-white/40">
            Title
            <input
              value={nextTitle}
              onChange={(e) => setNextTitle(e.target.value)}
              maxLength={120}
              required
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-[#1DB954]/50"
            />
          </label>
          <label className="mt-3 block text-[0.55rem] uppercase tracking-[0.14em] text-white/40">
            Genre
            <input
              value={nextGenre}
              onChange={(e) => setNextGenre(e.target.value)}
              maxLength={60}
              placeholder="Optional"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#1DB954]/50"
            />
          </label>
          <label className="mt-3 block text-[0.55rem] uppercase tracking-[0.14em] text-white/40">
            Cover
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setCoverFile(e.target.files?.[0] ?? null);
                setRemoveCover(false);
              }}
              className="mt-1 block w-full text-xs text-white/60 file:mr-2 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white/80"
            />
          </label>
          <p className="mt-1 text-[0.55rem] text-white/30">
            {coverFile
              ? coverFile.name
              : removeCover
                ? "Cover will be removed on save"
                : hasCover
                  ? "JPG/PNG/WebP · replaces current"
                  : "JPG/PNG/WebP · optional"}
          </p>
          {hasCover && !coverFile ? (
            <button
              type="button"
              onClick={() => setRemoveCover((v) => !v)}
              className="mt-2 text-[0.65rem] text-white/40 hover:text-red-300"
            >
              {removeCover ? "Keep cover" : "Remove cover"}
            </button>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs text-[#F5A623]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || !nextTitle.trim()}
            className="mt-3 w-full rounded-full bg-[#1DB954] py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BecomeArtistButton } from "@/components/become-artist-button";
import { SignOutButton } from "@/components/sign-out-button";
import type { BlockedPerson } from "@/lib/dashboard/blocks";

type Privacy = {
  privacy_public_profile: boolean;
  privacy_show_activity: boolean;
  privacy_show_on_charts: boolean;
  privacy_show_likes: boolean;
  privacy_show_saves: boolean;
  privacy_show_followed_artists: boolean;
  privacy_show_followers: boolean;
};

type Props = {
  displayName: string;
  email: string;
  genres: string[];
  countries: string[];
  privacy: Privacy;
  publicProfileHref: string;
  avatarUrl: string | null;
  isArtist?: boolean;
  blockedPeople?: BlockedPerson[];
  blocksReady?: boolean;
  blocksError?: string | null;
};

export function ProfileSettings({
  displayName: initialName,
  email,
  genres,
  countries,
  privacy: initial,
  publicProfileHref,
  avatarUrl: initialAvatar,
  isArtist = false,
  blockedPeople: initialBlocked = [],
  blocksReady = false,
  blocksError = null,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(initialName);
  const [nameDraft, setNameDraft] = useState(initialName);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [uploading, setUploading] = useState(false);
  const [privacy, setPrivacy] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(initialName);
    if (!editingName) setNameDraft(initialName);
  }, [initialName, editingName]);

  useEffect(() => {
    setAvatarUrl(initialAvatar);
  }, [initialAvatar]);

  useEffect(() => {
    setBlocked(initialBlocked);
  }, [initialBlocked]);

  async function unblock(personId: string) {
    if (!blocksReady || unblockingId) return;
    setBlockMsg(null);
    setUnblockingId(personId);
    const prev = blocked;
    setBlocked((list) => list.filter((p) => p.id !== personId));
    try {
      const res = await fetch("/api/people/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: personId }),
      });
      const data = (await res.json()) as {
        error?: string;
        blocked?: boolean;
      };
      if (!res.ok || data.error) {
        setBlocked(prev);
        setBlockMsg(data.error || "Could not unblock");
        return;
      }
      if (data.blocked) {
        // Toggle landed on block instead of unblock — restore and refresh
        setBlocked(prev);
        router.refresh();
        return;
      }
      router.refresh();
    } catch (err) {
      setBlocked(prev);
      setBlockMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setUnblockingId(null);
    }
  }

  async function onAvatarPick(file: File | null) {
    if (!file || uploading) return;
    setError(null);
    setMessage(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("avatar", file);
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        error?: string;
        avatar_url?: string;
      };
      if (!res.ok || data.error || !data.avatar_url) {
        setError(data.error || "Could not upload photo");
        return;
      }
      setAvatarUrl(data.avatar_url);
      setMessage("Photo saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onRemoveAvatar() {
    if (uploading || !avatarUrl) return;
    setError(null);
    setMessage(null);
    setUploading(true);
    const prev = avatarUrl;
    setAvatarUrl(null);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setAvatarUrl(prev);
        setError(data.error || "Could not remove photo");
        return;
      }
      setMessage("Photo removed.");
      router.refresh();
    } catch (err) {
      setAvatarUrl(prev);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUploading(false);
    }
  }

  async function saveDisplayName(e: FormEvent) {
    e.preventDefault();
    if (savingName) return;
    const next = nameDraft.trim().replace(/\s+/g, " ").slice(0, 48);
    if (next.length < 2) {
      setError("Display name must be at least 2 characters.");
      return;
    }
    if (next === displayName) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: next }),
      });
      const data = (await res.json()) as {
        error?: string;
        display_name?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not update name.");
        return;
      }
      const saved = (data.display_name || next).trim();
      setDisplayName(saved);
      setNameDraft(saved);
      setEditingName(false);
      setMessage("Display name saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingName(false);
    }
  }

  async function savePrivacy(next: Privacy) {
    setSaving(true);
    setError(null);
    setMessage(null);
    setPrivacy(next);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not save privacy settings.");
        return;
      }
      setMessage("Privacy settings saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof Privacy) {
    const next = { ...privacy, [key]: !privacy[key] };
    void savePrivacy(next);
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not delete account.");
        setDeleting(false);
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-5 py-10 sm:px-8">
      <div className="flex items-start gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.04]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-[#1DB954]/70">
              {(displayName.trim().slice(0, 2) || "YO").toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onAvatarPick(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-[#1DB954]/50 hover:text-white disabled:opacity-50"
          >
            {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Add photo"}
          </button>
          {avatarUrl ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void onRemoveAvatar()}
              className="ml-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/40 hover:text-red-300 disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
          <p className="mt-1.5 text-[0.65rem] text-white/30">
            Shows on your public page · JPEG/PNG/WebP · 5MB
          </p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            You
          </p>
          {editingName ? (
            <form
              onSubmit={(e) => void saveDisplayName(e)}
              className="mt-2 space-y-2"
            >
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={48}
                autoFocus
                disabled={savingName}
                className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-2xl font-semibold tracking-tight text-white outline-none focus:border-[#1DB954]/50"
                aria-label="Display name"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={savingName}
                  className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
                >
                  {savingName ? "Saving…" : "Save name"}
                </button>
                <button
                  type="button"
                  disabled={savingName}
                  onClick={() => {
                    setNameDraft(displayName);
                    setEditingName(false);
                    setError(null);
                  }}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                {displayName}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(displayName);
                  setEditingName(true);
                  setMessage(null);
                }}
                className="text-sm text-white/45 hover:text-[#1DB954]"
              >
                Edit name
              </button>
            </div>
          )}
          <p className="mt-1 text-sm text-white/40">{email}</p>
        </div>
        <SignOutButton />
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-xs uppercase tracking-[0.16em] text-white/40">
          Taste
        </h2>
        <p className="mt-3 text-sm text-white/70">
          {genres.length ? genres.join(" · ") : "No genres yet"}
        </p>
        <p className="mt-2 text-sm text-white/50">
          {countries.length ? countries.join(" · ") : "No places yet"}
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-xs uppercase tracking-[0.16em] text-white/40">
          Privacy settings
        </h2>
        <p className="mt-2 text-xs text-white/40">
          Control what others can see about you on RECT SOUND.{" "}
          {privacy.privacy_public_profile ? (
            <Link
              href={publicProfileHref}
              className="text-[#1DB954] hover:underline"
            >
              View your public page →
            </Link>
          ) : null}
        </p>
        <ul className="mt-4 space-y-3">
          {(
            [
              {
                key: "privacy_public_profile" as const,
                title: "Public profile",
                desc: "When on, others can open your /people page (mixes + listening if shared). Artists stay findable in Portals & Search.",
              },
              {
                key: "privacy_show_activity" as const,
                title: "Listening activity",
                desc: "Journal stays private. When on, artists see you listened and your portal can show Listening now — Journal will remind you when this is off.",
              },
              {
                key: "privacy_show_likes" as const,
                title: "Liked songs",
                desc: "When on, your public /people page can show tracks you’ve liked. Off by default — Library will remind you.",
              },
              {
                key: "privacy_show_saves" as const,
                title: "Saved mixes",
                desc: "When on, your public page lists public mixes you’ve saved. Off by default — Your mixes will remind you.",
              },
              {
                key: "privacy_show_followed_artists" as const,
                title: "Followed artists",
                desc: "When on, your public page lists artists you follow. Off by default — Following will remind you.",
              },
              {
                key: "privacy_show_followers" as const,
                title: "Followers & Following",
                desc: "When on, your public page shows who follows you and who you follow. Off by default — Following will remind you.",
              },
              {
                key: "privacy_show_on_charts" as const,
                title: "Appear on charts",
                desc: "When off, your plays won’t count toward Featured or Charts — Chart room will remind you.",
              },
            ] as const
          ).map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/85">{row.title}</p>
                <p className="text-xs text-white/40">{row.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={privacy[row.key]}
                disabled={saving}
                onClick={() => toggle(row.key)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                  privacy[row.key] ? "bg-[#1DB954]" : "bg-white/15"
                } disabled:opacity-50`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition ${
                    privacy[row.key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
        {message ? (
          <p className="mt-3 text-xs text-[#1DB954]">{message}</p>
        ) : null}
      </section>

      {blocksReady ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-xs uppercase tracking-[0.16em] text-white/40">
            Blocked people
          </h2>
          <p className="mt-2 text-xs text-white/40">
            They can’t follow you, comment, share with you, or invite you to
            collab mixes. Unblock anytime.
          </p>
          {blocksError || blockMsg ? (
            <p className="mt-3 text-xs text-[#F5A623]" role="alert">
              {blockMsg || blocksError}
            </p>
          ) : null}
          {blocked.length === 0 && !blocksError ? (
            <p className="mt-4 text-sm text-white/40">Nobody blocked.</p>
          ) : null}
          {blocked.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {blocked.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[0.65rem] font-semibold text-[#1DB954]/70">
                          {(p.display_name.trim().slice(0, 2) || "?").toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-sm text-white/85">
                      {p.display_name}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={unblockingId === p.id}
                    onClick={() => void unblock(p.id)}
                    className="shrink-0 text-xs text-white/40 hover:text-[#1DB954] disabled:opacity-40"
                  >
                    {unblockingId === p.id ? "…" : "Unblock"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-xs uppercase tracking-[0.16em] text-white/40">
          Account
        </h2>
        <div className="mt-4 space-y-3">
          {isArtist ? (
            <Link
              href="/studio"
              className="flex items-center justify-between rounded-xl border border-[#1DB954]/35 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954] hover:border-[#1DB954]/60"
            >
              <span>Artist Studio</span>
              <span className="text-[#1DB954]/70">›</span>
            </Link>
          ) : (
            <div className="rounded-xl border border-white/10 px-4 py-4">
              <p className="text-sm font-medium text-white/85">
                Make music on RECT
              </p>
              <p className="mt-1 text-xs text-white/40">
                Open Studio on this account — keep your likes, journal, and
                follows.
              </p>
              <BecomeArtistButton className="mt-3" />
            </div>
          )}
          <Link
            href="/dashboard"
            className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm text-white/80 hover:border-[#1DB954]/40"
          >
            <span>Back to dashboard</span>
            <span className="text-white/35">›</span>
          </Link>
          <Link
            href="/journal"
            className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm text-white/80 hover:border-[#1DB954]/40"
          >
            <span>Listening journal</span>
            <span className="text-white/35">›</span>
          </Link>
          <Link
            href="/preferences"
            className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm text-white/80 hover:border-[#1DB954]/40"
          >
            <span>Update cultural preferences</span>
            <span className="text-white/35">›</span>
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-5">
        <h2 className="text-xs uppercase tracking-[0.16em] text-red-300/80">
          Danger zone
        </h2>
        <p className="mt-2 text-sm text-white/55">
          Delete your RECT SOUND account permanently. This removes your profile,
          plays, and artist uploads. This cannot be undone.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-4 w-full rounded-full border border-red-400/40 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/10"
          >
            Delete account
          </button>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-red-200/80">
              Are you sure? Type confirm by pressing Delete forever.
            </p>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void deleteAccount()}
              className="w-full rounded-full bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete forever"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className="w-full rounded-full border border-white/15 py-3 text-sm text-white/60"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}

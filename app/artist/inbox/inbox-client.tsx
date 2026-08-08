"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RectLogo } from "@/components/rect-logo";
import {
  formatNotificationTime,
  type ArtistNotification,
} from "@/lib/dashboard/notifications";

type Props = {
  notifications: ArtistNotification[];
  unreadCount: number;
  loadError: string | null;
  missingTable: boolean;
  title?: string;
  subtitle?: string;
  homeHref?: string;
  homeLabel?: string;
  emptyHint?: string;
};

export function ArtistInboxClient({
  notifications: initial,
  unreadCount: initialUnread,
  loadError,
  missingTable,
  title = "Activity",
  subtitle = "Follows and tips",
  homeHref = "/artist",
  homeLabel = "Studio",
  emptyHint = "New follows and tips will show up here.",
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initial);
    setUnread(initialUnread);
  }, [initial, initialUnread]);

  async function markAllRead() {
    if (pending || unread === 0) return;
    setPending(true);
    setError(null);
    const prev = items;
    setItems((list) =>
      list.map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      })),
    );
    setUnread(0);
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setItems(prev);
        setUnread(initialUnread);
        setError(data.error || "Could not mark read");
        return;
      }
      router.refresh();
    } catch (e) {
      setItems(prev);
      setUnread(initialUnread);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-6">
          <Link href={homeHref}>
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href={homeHref} className="hover:text-white">
              {homeLabel}
            </Link>
            <Link href="/following" className="hover:text-white">
              Following
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
              Inbox
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="mt-2 text-sm text-white/45">
              {subtitle} · {unread} unread
            </p>
          </div>
          {unread > 0 && !missingTable ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={pending}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              {pending ? "…" : "Mark all read"}
            </button>
          ) : null}
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
            <p className="text-base font-medium">Inbox not set up yet</p>
            <p className="mt-2 text-sm text-white/40">
              Run notifications SQL in Supabase, then refresh.
            </p>
          </div>
        ) : null}

        {loadError || error ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {error || loadError}
          </p>
        ) : null}

        {!missingTable && items.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No activity yet</p>
            <p className="mt-2 text-sm text-white/40">{emptyHint}</p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            {items.map((n) => (
              <li
                key={n.id}
                className={`border-b border-white/[0.06] px-4 py-4 last:border-b-0 ${
                  n.read_at ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {!n.read_at ? (
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#1DB954]" />
                      ) : null}
                      {n.kind === "tip" ? (
                        <>
                          <span className="text-[#1DB954]">
                            {n.amount_xof?.toLocaleString() ?? "?"} XOF
                          </span>{" "}
                          tip from {n.actor_name}
                        </>
                      ) : n.kind === "release" ? (
                        <>
                          {n.actor_name} released{" "}
                          {n.track_id ? (
                            <Link
                              href={`/songs/${n.track_id}`}
                              className="text-[#1DB954] hover:underline"
                            >
                              {n.body || "a new track"}
                            </Link>
                          ) : (
                            <span className="text-[#1DB954]">
                              {n.body || "a new track"}
                            </span>
                          )}
                        </>
                      ) : (
                        <>{n.actor_name} followed you</>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      {formatNotificationTime(n.created_at)}
                      {n.kind === "tip" ? " · stub" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-white/30">
                    {n.kind}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}

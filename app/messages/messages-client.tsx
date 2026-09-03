"use client";

import Link from "next/link";
import { RectLogo } from "@/components/rect-logo";
import { personProfileHref } from "@/lib/dashboard/people";
import type { DmThread } from "@/lib/dashboard/dms";

type Props = {
  threads: DmThread[];
  missingTable: boolean;
  loadError: string | null;
};

function formatWhen(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MessagesListClient({
  threads,
  missingTable,
  loadError,
}: Props) {
  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-6">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Hearth
            </Link>
            <Link href="/hearing-aid" className="hover:text-white">
              Hearing Aid
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-6 px-5 py-10 sm:px-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Messages
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">
            Direct messages
          </h1>
          <p className="mt-2 text-sm text-white/45">
            Private 1:1 with people on RECT. Blocked users can’t message you.
          </p>
        </div>

        {missingTable ? (
          <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
            Run{" "}
            <code className="text-xs">20260830_direct_messages.sql</code> in
            Supabase to enable DMs.
          </p>
        ) : null}

        {loadError && !missingTable ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {loadError}
          </p>
        ) : null}

        {!missingTable && threads.length === 0 && !loadError ? (
          <div className="rounded-xl border border-dashed border-white/15 px-4 py-12 text-center">
            <p className="text-sm text-white/55">No conversations yet</p>
            <p className="mt-2 text-xs text-white/35">
              Open someone’s profile and tap Message.
            </p>
            <Link
              href="/search"
              className="mt-5 inline-block text-sm text-[#1DB954] hover:underline"
            >
              Find people →
            </Link>
          </div>
        ) : null}

        <ul className="space-y-2">
          {threads.map((t) => (
            <li key={t.conversation_id}>
              <Link
                href={`/messages/${t.conversation_id}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 transition hover:border-[#1DB954]/40"
              >
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                  {t.other_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.other_avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#1DB954]/70">
                      {(t.other_name.trim().slice(0, 2) || "DM").toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${t.unread ? "font-semibold text-white" : "font-medium text-white/90"}`}
                    >
                      {t.other_name}
                    </span>
                    <span className="shrink-0 text-[10px] text-white/35">
                      {formatWhen(t.last_at)}
                    </span>
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-xs ${t.unread ? "text-white/70" : "text-white/40"}`}
                  >
                    {t.last_body || "No messages yet"}
                  </span>
                </span>
                {t.unread ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-[#1DB954]"
                    aria-label="Unread"
                  />
                ) : null}
              </Link>
              <Link
                href={personProfileHref(t.other_id)}
                className="mt-1 ml-14 text-[10px] text-white/30 hover:text-white/55"
              >
                View profile
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

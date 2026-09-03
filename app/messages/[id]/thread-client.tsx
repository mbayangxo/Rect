"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RectLogo } from "@/components/rect-logo";
import { personProfileHref } from "@/lib/dashboard/people";
import type { DmMessage } from "@/lib/dashboard/dms";

type Props = {
  conversationId: string;
  otherId: string | null;
  otherName: string;
  otherAvatar: string | null;
  initialMessages: DmMessage[];
  missingTable: boolean;
  loadError: string | null;
  blocked: boolean;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageThreadClient({
  conversationId,
  otherId,
  otherName,
  otherAvatar,
  initialMessages,
  missingTable,
  loadError,
  blocked,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || blocked || missingTable) return;
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setPending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/dms/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: DmMessage;
      };
      if (!res.ok || !data.message) {
        setDraft(body);
        setError(data.error || "Could not send");
        return;
      }
      setMessages((prev) => [...prev, data.message!]);
      router.refresh();
    } catch (err) {
      setDraft(body);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/messages" className="text-sm text-white/45 hover:text-white">
              ←
            </Link>
            <Link href="/dashboard" className="hidden sm:block">
              <RectLogo size={28} showWordmark />
            </Link>
            {otherId ? (
              <Link
                href={personProfileHref(otherId)}
                className="flex min-w-0 items-center gap-2 hover:opacity-90"
              >
                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                  {otherAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={otherAvatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#1DB954]/70">
                      {(otherName.trim().slice(0, 2) || "DM").toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="truncate text-sm font-medium">{otherName}</span>
              </Link>
            ) : (
              <span className="truncate text-sm font-medium">{otherName}</span>
            )}
          </div>
          <Link href="/messages" className="text-sm text-white/55 hover:text-white">
            All
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-6 sm:px-6">
        {missingTable ? (
          <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
            Run direct messages SQL in Supabase.
          </p>
        ) : null}
        {loadError && !missingTable ? (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {loadError}
          </p>
        ) : null}
        {blocked ? (
          <p className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
            Messaging is unavailable with this person.
          </p>
        ) : null}

        <div className="flex-1 space-y-3 pb-4">
          {messages.length === 0 && !missingTable ? (
            <p className="py-10 text-center text-sm text-white/40">
              Say hello — first message starts the thread.
            </p>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.mine
                    ? "bg-[#1DB954] text-black"
                    : "border border-white/10 bg-white/[0.06] text-white/90"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p
                  className={`mt-1 text-[10px] ${m.mine ? "text-black/50" : "text-white/35"}`}
                >
                  {formatWhen(m.created_at)}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="sticky bottom-0 border-t border-white/10 bg-[#040d06]/95 pb-6 pt-3 backdrop-blur"
        >
          {error ? (
            <p className="mb-2 text-xs text-[#F5A623]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={2000}
              disabled={pending || blocked || missingTable}
              placeholder={blocked ? "Unavailable" : "Write a message…"}
              className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#1DB954]/50 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={pending || blocked || missingTable || !draft.trim()}
              className="self-end rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {pending ? "…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

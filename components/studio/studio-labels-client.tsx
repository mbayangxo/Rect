"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LabelMembership, RectLabel } from "@/lib/dashboard/rect-labels";

type Props = {
  label: RectLabel | null;
  roster: LabelMembership[];
  myMemberships: LabelMembership[];
  missingTable: boolean;
  userId: string;
};

export function StudioLabelsClient({
  label,
  roster,
  myMemberships,
  missingTable,
  userId,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [artistId, setArtistId] = useState("");
  const [splitPct, setSplitPct] = useState("20");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createLabel() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not create label.");
        return;
      }
      setMessage("RECT Label created.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function invite() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          artist_id: artistId.trim(),
          split_pct: Number(splitPct),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Invite failed.");
        return;
      }
      setArtistId("");
      setMessage("Invite sent — waiting for artist accept.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function respond(membershipId: string, accept: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "respond",
          membership_id: membershipId,
          accept,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not respond.");
        return;
      }
      setMessage(accept ? "Accepted." : "Declined.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const pendingForMe = [
    ...roster.filter(
      (m) => m.status === "pending" && m.awaiting_user_id === userId,
    ),
    ...myMemberships.filter(
      (m) => m.status === "pending" && m.awaiting_user_id === userId,
    ),
  ];
  // de-dupe by id
  const pendingUnique = [
    ...new Map(pendingForMe.map((m) => [m.id, m])).values(),
  ];

  return (
    <div className="space-y-10">
      {missingTable ? (
        <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          Run <code className="text-xs">20260903_rect_labels.sql</code> in RECT
          Supabase.
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-[var(--rect)]">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-[#F5A623]">{error}</p> : null}

      {!label ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
            Start a RECT Label
          </h2>
          <p className="text-sm text-white/45">
            Artists you invite must accept. You must accept if they request you.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Label name"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[var(--rect)]/50"
          />
          <button
            type="button"
            disabled={pending || missingTable || name.trim().length < 2}
            onClick={() => void createLabel()}
            className="rounded-full bg-[var(--rect)] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            Create label
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/35">
              Your label
            </p>
            <h2 className="font-[family-name:var(--font-syne)] text-xl font-semibold">
              {label.name}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              value={artistId}
              onChange={(e) => setArtistId(e.target.value)}
              placeholder="Artist user id (UUID)"
              className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[var(--rect)]/50"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={splitPct}
              onChange={(e) => setSplitPct(e.target.value)}
              className="w-24 rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm"
              title="Label split %"
            />
            <button
              type="button"
              disabled={pending || !artistId.trim()}
              onClick={() => void invite()}
              className="rounded-full bg-[var(--rect)] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
            >
              Invite
            </button>
          </div>
          <p className="text-xs text-white/35">
            Split % is the label share (artist keeps the rest). Locked after both
            accept — editable later in money tools.
          </p>
        </section>
      )}

      {pendingUnique.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Needs your accept
          </h2>
          <ul className="mt-3 space-y-2">
            {pendingUnique.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-4 py-3"
              >
                <span className="text-sm">
                  {m.label_name || "Label"} ↔ {m.artist_name || m.artist_id.slice(0, 8)}
                  <span className="text-white/35">
                    {" "}
                    · {m.revenue_split_label_pct}% label
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void respond(m.id, true)}
                    className="rounded-full bg-[var(--rect)] px-4 py-1.5 text-xs font-semibold text-black"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void respond(m.id, false)}
                    className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/50"
                  >
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {label ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Roster
          </h2>
          {roster.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">No invites yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {roster.map((m) => (
                <li
                  key={m.id}
                  className="flex justify-between rounded-xl border border-white/[0.08] px-4 py-3 text-sm"
                >
                  <span>{m.artist_name || m.artist_id.slice(0, 8)}</span>
                  <span className="text-white/40 capitalize">
                    {m.status}
                    {m.status === "accepted"
                      ? ` · ${m.revenue_split_label_pct}% label`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {myMemberships.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Labels you&apos;re on
          </h2>
          <ul className="mt-3 space-y-2">
            {myMemberships.map((m) => (
              <li
                key={m.id}
                className="flex justify-between rounded-xl border border-white/[0.08] px-4 py-3 text-sm"
              >
                <span>{m.label_name || "Label"}</span>
                <span className="text-white/40 capitalize">{m.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

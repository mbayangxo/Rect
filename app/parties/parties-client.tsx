"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ListeningParty } from "@/lib/dashboard/listening-parties";

type Props = {
  signedIn: boolean;
  parties: ListeningParty[];
  missingTable: boolean;
  loadError: string | null;
};

export function ListeningPartiesClient({
  signedIn,
  parties,
  missingTable,
  loadError,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hostParty() {
    if (!signedIn) {
      router.push("/auth/login?next=/parties");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/listening-parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Listening party",
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        party_id?: string;
        missing_table?: boolean;
      };
      if (!res.ok || !data.party_id) {
        setError(
          data.error ||
            (data.missing_table
              ? "Run 20260903_listening_parties.sql in Supabase."
              : "Could not host."),
        );
        return;
      }
      router.push(`/parties/${data.party_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function joinByCode() {
    if (!code.trim()) return;
    if (!signedIn) {
      router.push("/auth/login?next=/parties");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/listening-parties/join?code=${encodeURIComponent(code.trim())}`,
      );
      const data = (await res.json()) as {
        error?: string;
        party_id?: string;
      };
      if (!res.ok || !data.party_id) {
        setError(data.error || "Party not found.");
        return;
      }
      router.push(`/parties/${data.party_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-10">
      {missingTable ? (
        <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          Run <code className="text-xs">20260903_listening_parties.sql</code> in
          RECT Supabase to enable parties.
        </p>
      ) : null}
      {loadError ? (
        <p className="text-sm text-[#F5A623]">{loadError}</p>
      ) : null}
      {error ? <p className="text-sm text-[#F5A623]">{error}</p> : null}

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
            Host
          </h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Party name"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[var(--rect)]/50"
          />
          <button
            type="button"
            disabled={pending || missingTable}
            onClick={() => void hostParty()}
            className="w-full rounded-full bg-[var(--rect)] py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            Start party
          </button>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
            Join with code
          </h2>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Invite code"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm uppercase outline-none focus:border-[var(--rect)]/50"
          />
          <button
            type="button"
            disabled={pending || missingTable || !code.trim()}
            onClick={() => void joinByCode()}
            className="w-full rounded-full border border-white/20 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Join
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Live now
        </h2>
        {parties.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">No live parties yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {parties.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/parties/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 hover:border-[var(--rect)]/35"
                >
                  <span>
                    <span className="block font-medium">{p.title}</span>
                    <span className="text-xs text-white/35">
                      Code {p.invite_code}
                    </span>
                  </span>
                  <span className="text-xs uppercase tracking-wider text-red-300">
                    Live
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

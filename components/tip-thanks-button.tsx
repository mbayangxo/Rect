"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TIP_THANKS_MAX } from "@/lib/dashboard/tips";

type Props = {
  tipId: number;
  initialThanks: string | null;
};

export function TipThanksButton({ tipId, initialThanks }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [thanks, setThanks] = useState(initialThanks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (pending || !draft.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tips/${tipId}/thanks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        thanks_message?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not send thanks");
        return;
      }
      setThanks(data.thanks_message || draft.trim());
      setDraft("");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (thanks) {
    return (
      <p className="mt-1 text-xs text-[#1DB954]/90">
        Thanks sent: “{thanks}”
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-xs text-[#1DB954] hover:underline"
      >
        Thank tipper
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, TIP_THANKS_MAX))}
        maxLength={TIP_THANKS_MAX}
        rows={2}
        placeholder="Thanks for the support…"
        disabled={pending}
        className="w-full resize-none rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-[#1DB954]/50 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !draft.trim()}
          onClick={() => void send()}
          className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
        >
          {pending ? "…" : "Send"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-white/45 hover:text-white"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

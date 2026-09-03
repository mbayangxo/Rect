"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  personId: string;
  dmsReady: boolean;
  loginNext?: string;
  className?: string;
  label?: string;
};

export function MessagePersonButton({
  personId,
  dmsReady,
  loginNext,
  className = "mt-3",
  label = "Message",
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (!dmsReady || pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: personId }),
      });
      const data = (await res.json()) as {
        error?: string;
        conversation_id?: string;
      };
      if (res.status === 401) {
        const next = loginNext || `/people/${personId}`;
        window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
        return;
      }
      if (!res.ok || !data.conversation_id) {
        setError(data.error || "Could not open messages");
        return;
      }
      router.push(`/messages/${data.conversation_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (!dmsReady) return null;

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void open()}
        className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/80 hover:border-[#1DB954]/50 hover:text-white disabled:opacity-50"
      >
        {pending ? "…" : label}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  personId: string;
  initialBlocked: boolean;
  blocksReady: boolean;
  loginNext?: string;
  className?: string;
};

export function PeopleBlockButton({
  personId,
  initialBlocked,
  blocksReady,
  loginNext,
  className = "mt-3",
}: Props) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!blocksReady || pending) return;
    setError(null);
    setPending(true);
    const prev = blocked;
    setBlocked(!prev);
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
      if (res.status === 401) {
        setBlocked(prev);
        const next = loginNext || `/people/${personId}`;
        window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
        return;
      }
      if (!res.ok || data.error) {
        setBlocked(prev);
        setError(data.error || "Could not update block");
        return;
      }
      setBlocked(Boolean(data.blocked));
      router.refresh();
    } catch (e) {
      setBlocked(prev);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (!blocksReady) return null;

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void toggle()}
        className="text-xs text-white/40 hover:text-white/70 disabled:opacity-50"
      >
        {pending ? "…" : blocked ? "Unblock" : "Block"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  /** Compact for hub-style placements */
  compact?: boolean;
  className?: string;
};

export function BecomeArtistButton({ compact = false, className = "" }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/become-artist", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        studio_href?: string;
        authenticated?: boolean;
      };
      if (res.status === 401) {
        window.location.href = "/auth/login?next=/for-artists";
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || "Could not open Studio");
        return;
      }
      router.push(data.studio_href || "/studio");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void upgrade()}
        className={
          compact
            ? "rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
            : "w-full rounded-full bg-[#1DB954] py-3.5 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
        }
      >
        {pending ? "Opening Studio…" : "Become an artist"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

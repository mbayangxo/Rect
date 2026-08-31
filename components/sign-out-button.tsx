"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  afterHref?: string;
};

export function SignOutButton({ afterHref = "/auth/login" }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* still leave */
    }
    router.push(afterHref);
    router.refresh();
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      className="rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-white/70 hover:border-[#1DB954] hover:text-[#1DB954] disabled:opacity-50"
    >
      {pending ? "Logging out…" : "Logout"}
    </button>
  );
}

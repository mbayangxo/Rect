"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
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

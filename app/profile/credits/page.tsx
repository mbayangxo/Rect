import Link from "next/link";
import { redirect } from "next/navigation";
import { PlayPackCheckout } from "@/components/play-pack-checkout";
import { RectLogo } from "@/components/rect-logo";
import {
  loadPendingPackPurchases,
  loadPlayCreditBalance,
} from "@/lib/dashboard/credits";
import { loadPlayPacks } from "@/lib/dashboard/play-packs";
import { packCountryFromTaste, type ListenerTaste } from "@/lib/dashboard/taste";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default async function ProfileCreditsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/profile/credits");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { data: profile } = await supabase
    .from("users")
    .select("countries, genres")
    .eq("id", user.id)
    .maybeSingle();

  const taste: ListenerTaste = {
    countries: [
      ...new Set([
        ...asStringArray(profile?.countries),
        ...asStringArray(meta.countries),
      ]),
    ],
    genres: [
      ...new Set([
        ...asStringArray(profile?.genres),
        ...asStringArray(meta.genres),
      ]),
    ],
    languages: [],
    listening_times: [],
  };

  const packCountry = packCountryFromTaste(taste);

  const [packsRes, creditsRes, pendingRes] = await Promise.all([
    loadPlayPacks(supabase, packCountry),
    loadPlayCreditBalance(supabase),
    loadPendingPackPurchases(supabase),
  ]);

  const creditsReady = !creditsRes.missingTable && packsRes.ok;

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-3 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/profile" className="hover:text-white">
              You
            </Link>
            <span className="text-[#1DB954]">Credits</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            JOKO · mobile money
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Add play credits
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Pay with Wave, Orange Money, MTN MoMo, or any local mobile money.
            No bank account or credit card — credits land on your account as
            soon as JOKO confirms payment.
          </p>
        </div>

        {!packsRes.ok ? (
          <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
            {packsRes.error}
          </p>
        ) : (
          <PlayPackCheckout
            packs={packsRes.packs}
            country={packCountry}
            initialCredits={creditsRes.credits}
            creditsReady={creditsReady}
            initialPending={pendingRes.purchases}
            loginNext="/profile/credits"
          />
        )}
      </div>
    </main>
  );
}

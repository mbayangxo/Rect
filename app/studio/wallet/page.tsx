import Link from "next/link";
import { StudioWalletDashboard } from "@/components/studio/studio-wallet-dashboard";
import { loadArtistWallet } from "@/lib/dashboard/artist-wallet";
import { loadOwnedLabel } from "@/lib/dashboard/rect-labels";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioWalletPage() {
  const { supabase, userId } = await requireStudioArtist("/studio/wallet");
  const [wallet, owned] = await Promise.all([
    loadArtistWallet(supabase, userId),
    loadOwnedLabel(supabase, userId),
  ]);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
        Money · Artist wallets
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Business & Personal
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Two artist wallets — <span className="text-white/70">Business</span>{" "}
        (catalog & store) and <span className="text-white/70">Personal</span>{" "}
        (tips). Label money is separate
        {owned.label ? (
          <>
            {" "}
            ·{" "}
            <Link
              href="/studio/label/wallet"
              className="text-[var(--rect)] hover:underline"
            >
              Label wallet →
            </Link>
          </>
        ) : (
          " · create a RECT Label to unlock Label wallet"
        )}
        .
      </p>
      <div className="mt-8">
        <StudioWalletDashboard initial={wallet} />
      </div>
    </>
  );
}

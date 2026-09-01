import { StudioWalletDashboard } from "@/components/studio/studio-wallet-dashboard";
import { loadArtistWallet } from "@/lib/dashboard/artist-wallet";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioWalletPage() {
  const { supabase, userId } = await requireStudioArtist("/studio/wallet");
  const wallet = await loadArtistWallet(supabase, userId);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Wallet
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        RECT earnings
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Real-time balance from streams, downloads, merch, fan club, and JOKO tips —
        payout requests stay <span className="text-white/70">pending settlement</span>{" "}
        until JOKO marks them paid.
      </p>
      <div className="mt-8">
        <StudioWalletDashboard initial={wallet} />
      </div>
    </>
  );
}

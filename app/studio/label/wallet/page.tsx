import Link from "next/link";
import { StudioLabelWalletDashboard } from "@/components/studio/studio-label-wallet-dashboard";
import { loadLabelWallet } from "@/lib/dashboard/label-wallet";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

/** Label wallet — only for rect_labels owners. Hidden from fans & roster artists. */
export default async function StudioLabelWalletPage() {
  const { supabase, userId } = await requireStudioArtist("/studio/label/wallet");
  const wallet = await loadLabelWallet(supabase, userId);

  if (!wallet) {
    return (
      <>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
          Label · Wallet
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
          Label wallet
        </h1>
        <p className="mt-3 max-w-lg text-sm text-white/45">
          You don&apos;t own a RECT Label yet. Create one under RECT Label —
          roster artists only see their own Business / Personal wallets, never
          the label wallet.
        </p>
        <Link
          href="/studio/label"
          className="mt-6 inline-flex rounded-full bg-[var(--rect)] px-5 py-2.5 text-sm font-semibold text-black"
        >
          Open RECT Label →
        </Link>
      </>
    );
  }

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
        Label · Wallet
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        {wallet.labelName}
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Label wallet — roster split earnings only. Separate from your artist
        Business and Personal wallets. Not visible to fans or roster artists.
      </p>
      <div className="mt-8">
        <StudioLabelWalletDashboard initial={wallet} />
      </div>
    </>
  );
}

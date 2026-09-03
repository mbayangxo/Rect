import { StudioAccountingDashboard } from "@/components/studio/studio-accounting-dashboard";
import { loadArtistAccounting } from "@/lib/dashboard/artist-accounting";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioAccountingPage() {
  const { supabase, userId } = await requireStudioArtist("/studio/accounting");
  const statement = await loadArtistAccounting(supabase, userId);

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
        Accounting
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Monthly statement
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-white/45">
        On-platform ledger by kind for {statement.monthLabel}. Writer shares are
        calculated from RECT stream credits — DSP royalties arrive via Taali
        statements separately.
      </p>
      <div className="mt-8">
        <StudioAccountingDashboard initial={statement} />
      </div>
    </>
  );
}

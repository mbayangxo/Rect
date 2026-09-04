import Link from "next/link";
import { StudioLabelsClient } from "@/components/studio/studio-labels-client";
import {
  loadArtistLabelMemberships,
  loadLabelMemberships,
  loadOwnedLabel,
} from "@/lib/dashboard/rect-labels";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

export default async function StudioLabelsPage() {
  const { supabase, userId } = await requireStudioArtist("/studio/label");
  const owned = await loadOwnedLabel(supabase, userId);
  const asArtist = await loadArtistLabelMemberships(supabase, userId);
  let roster: Awaited<ReturnType<typeof loadLabelMemberships>>["members"] = [];
  if (owned.label) {
    roster = (await loadLabelMemberships(supabase, owned.label.id)).members;
  }

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
        RECT Label
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight sm:text-3xl">
        Labels & roster
      </h1>
      <p className="mt-2 text-sm text-white/45">
        Mutual accept only — both label and artist must say yes. Roster split %
        credits the <span className="text-white/70">Label wallet</span> (owners
        only) — never fans or regular artist Business/Personal wallets.
      </p>
      {owned.label ? (
        <Link
          href="/studio/label/wallet"
          className="mt-4 inline-flex text-sm text-[var(--rect)] hover:underline"
        >
          Open Label wallet →
        </Link>
      ) : null}
      <div className="mt-8">
        <StudioLabelsClient
          label={owned.label}
          roster={roster}
          myMemberships={asArtist.members}
          missingTable={owned.missingTable || asArtist.missingTable}
          userId={userId}
        />
      </div>
    </>
  );
}

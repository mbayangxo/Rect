import Link from "next/link";
import {
  loadLabelMemberships,
  loadOwnedLabel,
} from "@/lib/dashboard/rect-labels";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Label rollup strip for studio analytics — accepted roster stream totals.
 */
export async function loadLabelRollup(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<{
  ready: boolean;
  labelName: string | null;
  artistCount: number;
  streamsAllTime: number;
  missingTable: boolean;
}> {
  const owned = await loadOwnedLabel(supabase, ownerId);
  if (owned.missingTable) {
    return {
      ready: false,
      labelName: null,
      artistCount: 0,
      streamsAllTime: 0,
      missingTable: true,
    };
  }
  if (!owned.label) {
    return {
      ready: false,
      labelName: null,
      artistCount: 0,
      streamsAllTime: 0,
      missingTable: false,
    };
  }

  const { members } = await loadLabelMemberships(supabase, owned.label.id);
  const accepted = members.filter((m) => m.status === "accepted");
  const artistIds = accepted.map((m) => m.artist_id);
  if (artistIds.length === 0) {
    return {
      ready: true,
      labelName: owned.label.name,
      artistCount: 0,
      streamsAllTime: 0,
      missingTable: false,
    };
  }

  const admin = createAdminClient();
  const db = admin ?? supabase;
  const { data: tracks } = await db
    .from("tracks")
    .select("id")
    .in("artist_id", artistIds);
  const trackIds = (tracks ?? []).map((t) => String(t.id));
  let streamsAllTime = 0;
  if (trackIds.length > 0) {
    const { count } = await db
      .from("plays")
      .select("id", { count: "exact", head: true })
      .in("track_id", trackIds);
    streamsAllTime = count ?? 0;
  }

  return {
    ready: true,
    labelName: owned.label.name,
    artistCount: accepted.length,
    streamsAllTime,
    missingTable: false,
  };
}

export function LabelRollupPanel({
  rollup,
}: {
  rollup: Awaited<ReturnType<typeof loadLabelRollup>>;
}) {
  if (rollup.missingTable) {
    return (
      <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
        Run 20260903_rect_labels.sql to enable label rollup.
      </p>
    );
  }
  if (!rollup.ready) {
    return (
      <p className="text-sm text-white/40">
        No RECT Label yet.{" "}
        <Link href="/studio/label" className="text-[var(--rect)] hover:underline">
          Create one →
        </Link>
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wider text-white/40">
        Label rollup · {rollup.labelName}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-2xl font-semibold">{rollup.artistCount}</p>
          <p className="text-xs text-white/40">Accepted artists</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">
            {rollup.streamsAllTime.toLocaleString()}
          </p>
          <p className="text-xs text-white/40">Roster streams</p>
        </div>
        <div className="flex items-end">
          <Link
            href="/studio/label"
            className="text-sm text-[var(--rect)] hover:underline"
          >
            Manage roster →
          </Link>
        </div>
      </div>
    </div>
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadArtistWallet } from "@/lib/dashboard/artist-wallet";
import { loadWriterSplitsForTracks } from "@/lib/dashboard/writer-splits";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackTitle, type TrackRow } from "@/lib/tracks";

export type AccountingKindRow = {
  kind: string;
  label: string;
  creditXof: number;
  debitXof: number;
  netXof: number;
  entries: number;
};

export type WriterOwedRow = {
  writerName: string;
  sharePercent: number;
  trackId: string;
  trackTitle: string;
  trackEarningsXof: number;
  owedXof: number;
};

export type ArtistAccountingStatement = {
  monthLabel: string;
  monthStartIso: string;
  kindRows: AccountingKindRow[];
  totalNetXof: number;
  writerRows: WriterOwedRow[];
  ledgerCsvReady: boolean;
  walletReady: boolean;
  error: string | null;
  note: string;
};

const KIND_LABELS: Record<string, string> = {
  stream: "Streams (RECT)",
  download: "Downloads",
  merch: "Merch",
  fan_club: "Fan club",
  ticket: "Tickets",
  tip: "Tips (JOKO)",
  payout: "Payouts requested",
  adjustment: "Adjustments",
};

function monthBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const label = start.toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start, end, label };
}

export async function loadArtistAccounting(
  supabase: SupabaseClient,
  artistId: string,
): Promise<ArtistAccountingStatement> {
  const { start, end, label } = monthBounds();
  const note =
    "RECT on-platform earnings only. DSP store royalties and statements come through Taali when Delivery is live.";

  const wallet = await loadArtistWallet(supabase, artistId);
  if (!wallet.ready) {
    return {
      monthLabel: label,
      monthStartIso: start.toISOString(),
      kindRows: [],
      totalNetXof: 0,
      writerRows: [],
      ledgerCsvReady: false,
      walletReady: false,
      error: wallet.error,
      note,
    };
  }

  const byKind = new Map<
    string,
    { credit: number; debit: number; entries: number }
  >();

  for (const row of wallet.ledger) {
    const at = new Date(row.createdAt).getTime();
    if (at < start.getTime() || at >= end.getTime()) continue;
    const cur = byKind.get(row.kind) ?? { credit: 0, debit: 0, entries: 0 };
    if (row.amountXof >= 0) cur.credit += row.amountXof;
    else cur.debit += Math.abs(row.amountXof);
    cur.entries += 1;
    byKind.set(row.kind, cur);
  }

  const kindRows: AccountingKindRow[] = [...byKind.entries()]
    .map(([kind, v]) => ({
      kind,
      label: KIND_LABELS[kind] ?? kind,
      creditXof: v.credit,
      debitXof: v.debit,
      netXof: v.credit - v.debit,
      entries: v.entries,
    }))
    .sort((a, b) => Math.abs(b.netXof) - Math.abs(a.netXof));

  const totalNetXof = kindRows.reduce((s, r) => s + r.netXof, 0);

  const admin = createAdminClient();
  const db = admin ?? supabase;
  const { data: tracks } = await db
    .from("tracks")
    .select("id, title, artist_id")
    .eq("artist_id", artistId);

  const trackList = (tracks ?? []) as TrackRow[];
  const trackIds = trackList.map((t) => t.id);
  const splits = await loadWriterSplitsForTracks(db, trackIds);

  // Approximate writer share of stream credits this month from wallet stream total
  const streamNet =
    kindRows.find((r) => r.kind === "stream")?.netXof ??
    kindRows.find((r) => r.kind === "play")?.netXof ??
    0;

  const writerRows: WriterOwedRow[] = [];
  if (streamNet > 0 && trackIds.length > 0) {
    // Equal weight across tracks with splits for statement transparency
    const withSplits = trackIds.filter(
      (id) => (splits.byTrackId[id] ?? []).length > 0,
    );
    const perTrack =
      withSplits.length > 0 ? streamNet / withSplits.length : 0;
    for (const tid of withSplits) {
      const writers = splits.byTrackId[tid] ?? [];
      const t = trackList.find((x) => x.id === tid);
      for (const w of writers) {
        writerRows.push({
          writerName: w.writer_name,
          sharePercent: w.share_percent,
          trackId: tid,
          trackTitle: t ? trackTitle(t) : "Track",
          trackEarningsXof: Math.round(perTrack),
          owedXof: Math.round((perTrack * w.share_percent) / 100),
        });
      }
    }
  }

  return {
    monthLabel: label,
    monthStartIso: start.toISOString(),
    kindRows,
    totalNetXof,
    writerRows,
    ledgerCsvReady: wallet.ledger.length > 0,
    walletReady: true,
    error: null,
    note,
  };
}

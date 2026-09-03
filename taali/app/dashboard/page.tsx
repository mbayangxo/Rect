import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function loadCounts() {
  const admin = createAdminClient();
  if (!admin) {
    return {
      configured: false,
      releases: 0,
      deliveries: 0,
      validated: 0,
      pending: 0,
    };
  }

  const [releasesRes, deliveriesRes] = await Promise.all([
    admin.from("releases").select("id, status, validation_status"),
    admin.from("deliveries").select("id, status"),
  ]);

  const releases = releasesRes.data ?? [];
  const deliveries = deliveriesRes.data ?? [];

  return {
    configured: true,
    releases: releases.length,
    deliveries: deliveries.length,
    validated: releases.filter((r) => r.validation_status === "passed").length,
    pending: deliveries.filter((d) =>
      ["pending", "queued", "processing", "not_configured"].includes(
        String(d.status),
      ),
    ).length,
  };
}

export default async function DashboardOverviewPage() {
  const counts = await loadCounts();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Overview</h1>
        <p className="mt-2 text-sm text-taali-muted">
          Taali Phase 1 — catalog intake, validation, and delivery queue.
        </p>
      </div>

      {!counts.configured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Supabase is not configured. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code>, apply migrations, then run{" "}
          <code>npm run probe:taali</code>.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Releases" value={counts.releases} />
        <StatCard label="Validated" value={counts.validated} />
        <StatCard label="Deliveries" value={counts.deliveries} />
        <StatCard label="Pending queue" value={counts.pending} accent />
      </div>

      <div className="rounded-xl border border-taali-border bg-taali-surface p-6">
        <h2 className="text-lg font-medium text-white">Quick actions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <ActionLink href="/dashboard/releases/new" label="Create release" />
          <ActionLink href="/dashboard/releases" label="Browse releases" />
          <ActionLink href="/dashboard/delivery" label="Delivery center" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-taali-border bg-taali-surface p-5">
      <p className="text-sm text-taali-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold ${accent ? "text-taali-accent" : "text-white"}`}
      >
        {value}
      </p>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-taali-border px-4 py-2 text-sm text-zinc-200 transition hover:border-taali-accent hover:text-taali-accent"
    >
      {label}
    </Link>
  );
}

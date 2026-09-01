import { createAdminClient } from "@/lib/supabase/admin";
import type { DeliveryRow } from "@/lib/taali/types";

export const dynamic = "force-dynamic";

type ProviderRow = {
  id: string;
  name: string;
  slug: string;
  configured: boolean;
};

export default async function DeliveryCenterPage() {
  const admin = createAdminClient();
  let deliveries: DeliveryRow[] = [];
  let providers: ProviderRow[] = [];
  let error: string | null = null;

  if (!admin) {
    error = "Supabase is not configured.";
  } else {
    const [deliveriesRes, providersRes] = await Promise.all([
      admin
        .from("deliveries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
      admin.from("delivery_providers").select("*").order("name"),
    ]);

    if (deliveriesRes.error) error = deliveriesRes.error.message;
    else deliveries = (deliveriesRes.data ?? []) as DeliveryRow[];

    if (!providersRes.error) {
      providers = (providersRes.data ?? []) as ProviderRow[];
    }
  }

  const configuredProviders = providers.filter((p) => p.configured);
  const notConfiguredProviders = providers.filter((p) => !p.configured);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Delivery center</h1>
        <p className="mt-1 text-sm text-taali-muted">
          Phase 1 queues deliveries honestly — live DSP connectors are not wired
          yet.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <ProviderPanel
          title="Configured providers"
          empty="No providers are configured yet."
          providers={configuredProviders}
          tone="ok"
        />
        <ProviderPanel
          title="Not configured"
          empty="All providers are pending setup — submissions will record as not_configured."
          providers={notConfiguredProviders}
          tone="muted"
        />
      </section>

      <section className="rounded-xl border border-taali-border bg-taali-surface">
        <div className="border-b border-taali-border px-4 py-3">
          <h2 className="text-sm font-medium text-white">Recent deliveries</h2>
        </div>
        {deliveries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-taali-muted">
            No deliveries queued yet. Submit a validated release via the API.
          </p>
        ) : (
          <div className="divide-y divide-taali-border">
            {deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">{delivery.provider_id}</p>
                  <p className="text-taali-muted">
                    {delivery.destinations.join(", ") || "No destinations"}
                  </p>
                </div>
                <StatusPill status={delivery.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProviderPanel({
  title,
  empty,
  providers,
  tone,
}: {
  title: string;
  empty: string;
  providers: ProviderRow[];
  tone: "ok" | "muted";
}) {
  return (
    <div className="rounded-xl border border-taali-border bg-taali-surface p-5">
      <h2 className="text-sm font-medium text-white">{title}</h2>
      <ul className="mt-4 space-y-2">
        {providers.length === 0 ? (
          <li className="text-sm text-taali-muted">{empty}</li>
        ) : (
          providers.map((provider) => (
            <li
              key={provider.id}
              className="flex items-center justify-between rounded-lg border border-taali-border bg-background/50 px-3 py-2 text-sm"
            >
              <span className="text-zinc-200">{provider.name}</span>
              <span
                className={
                  tone === "ok" ? "text-taali-accent" : "text-taali-muted"
                }
              >
                {tone === "ok" ? "ready" : "not_configured"}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const accent =
    status === "delivered" || status === "queued" || status === "processing";
  const warning = status === "not_configured" || status === "failed";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        accent
          ? "bg-taali-accent/15 text-taali-accent"
          : warning
            ? "bg-amber-500/15 text-amber-300"
            : "bg-zinc-800 text-zinc-300"
      }`}
    >
      {status}
    </span>
  );
}

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReleaseRow } from "@/lib/taali/types";

export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  const admin = createAdminClient();
  let releases: ReleaseRow[] = [];
  let error: string | null = null;

  if (!admin) {
    error = "Supabase is not configured.";
  } else {
    const { data, error: dbError } = await admin
      .from("releases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (dbError) error = dbError.message;
    else releases = (data ?? []) as ReleaseRow[];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Releases</h1>
          <p className="mt-1 text-sm text-taali-muted">
            Catalog packages received from RECT or created via API.
          </p>
        </div>
        <Link
          href="/dashboard/releases/new"
          className="rounded-lg bg-taali-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-taali-accent-dim"
        >
          New release
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-taali-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-taali-surface text-taali-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Validation</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {releases.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-taali-muted"
                >
                  No releases yet.{" "}
                  <Link
                    href="/dashboard/releases/new"
                    className="text-taali-accent hover:underline"
                  >
                    Create one
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              releases.map((release) => (
                <tr
                  key={release.id}
                  className="border-t border-taali-border bg-taali-surface/40"
                >
                  <td className="px-4 py-3 text-white">{release.title}</td>
                  <td className="px-4 py-3 capitalize text-zinc-300">
                    {release.release_type}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={release.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {release.validation_status || "pending"}
                  </td>
                  <td className="px-4 py-3 text-taali-muted">
                    {new Date(release.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const accent = value === "validated" || value === "submitted";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        accent
          ? "bg-taali-accent/15 text-taali-accent"
          : "bg-zinc-800 text-zinc-300"
      }`}
    >
      {value}
    </span>
  );
}

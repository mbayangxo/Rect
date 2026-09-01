import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a] px-6">
      <div className="max-w-2xl text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-taali-accent">
          Distribution rail
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Taali — upload once, deliver everywhere
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-taali-muted">
          Package releases from RECT, validate metadata, and queue delivery to
          DSPs. One upload on RECT, one handoff to Taali.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-full bg-taali-accent px-8 py-3 text-sm font-semibold text-black transition hover:bg-taali-accent-dim"
          >
            Open dashboard
          </Link>
          <Link
            href="/api/v1/health"
            className="rounded-full border border-taali-border px-8 py-3 text-sm font-medium text-zinc-300 transition hover:border-taali-accent hover:text-white"
          >
            API health
          </Link>
        </div>
      </div>
    </div>
  );
}

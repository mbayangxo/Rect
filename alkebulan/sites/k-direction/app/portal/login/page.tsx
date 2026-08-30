import { loginPortal } from "@/lib/portal-actions";

export const metadata = { title: "Portal login" };

export default async function PortalLoginPage({
  searchParams,
}: PageProps<"/portal/login">) {
  const params = await searchParams;
  const error = params.error;
  const next = typeof params.next === "string" ? params.next : "/portal";

  return (
    <main className="mx-auto grid max-w-md gap-6 py-16">
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Portal</h1>
      <p className="text-white/70">Sign in to edit artists, events, blogs, jobs, and inquiries.</p>
      {error ? (
        <p role="alert" className="text-pink">
          That password is wrong.
        </p>
      ) : null}
      <form action={loginPortal} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <label className="grid gap-2 text-sm uppercase tracking-[0.16em]">
          Password
          <input
            name="password"
            type="password"
            required
            className="normal-case border border-white/30 bg-transparent px-3 py-3"
          />
        </label>
        <button className="bg-lime px-6 py-3 font-display text-2xl tracking-[0.12em] text-ink uppercase">
          Enter
        </button>
      </form>
    </main>
  );
}

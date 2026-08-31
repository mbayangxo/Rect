import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-ink px-4 py-24 text-center">
      <h1 className="font-display text-6xl tracking-[0.12em] text-lime uppercase">
        Not found
      </h1>
      <p className="mt-4 text-white/70">That page is not on K-Direction.</p>
      <Link
        href="/"
        className="mt-8 bg-lime px-6 py-3 font-display text-2xl tracking-[0.14em] text-ink uppercase"
      >
        Home
      </Link>
    </main>
  );
}

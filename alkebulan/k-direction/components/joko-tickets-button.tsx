export function JokoTicketsButton({ href }: { href: string | null }) {
  if (!href) {
    return (
      <p className="mt-8 max-w-xl text-lg">
        Tickets are sold on Joko. The listing will show here when it is live.
      </p>
    );
  }

  return (
    <p className="mt-8">
      <a
        href={href}
        className="inline-block bg-ink px-8 py-3 font-display text-2xl tracking-[0.12em] text-lime uppercase"
        target="_blank"
        rel="noreferrer"
      >
        Buy tickets on Joko
      </a>
    </p>
  );
}

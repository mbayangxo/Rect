import Link from "next/link";

type LogoProps = {
  href?: string | null;
  size?: "nav" | "hero";
  tone?: "light" | "dark";
};

export function Logo({ href = "/", size = "nav", tone = "light" }: LogoProps) {
  const color = tone === "light" ? "text-white" : "text-ink";
  const wordmark = (
    <span
      className={`block font-display leading-none tracking-[0.12em] ${color} ${
        size === "hero"
          ? "text-[clamp(4.5rem,14vw,11rem)]"
          : "text-[1.35rem] sm:text-2xl"
      }`}
    >
      <span className="block">K</span>
      <span className="block">DIRECTION</span>
      {size === "hero" ? (
        <span
          aria-hidden="true"
          className="block scale-y-[-1] opacity-40"
        >
          DIRECTION
        </span>
      ) : null}
    </span>
  );

  if (!href) {
    return wordmark;
  }

  return (
    <Link href={href} className="inline-block outline-offset-4">
      <span className="sr-only">K-Direction home</span>
      {wordmark}
    </Link>
  );
}

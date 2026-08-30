import Image from "next/image";
import Link from "next/link";

type HomeCollageProps = {
  label: string;
  artist: {
    slug: string;
    displayName: string;
    portrait: string;
    portraitAlt: string;
  } | null;
};

export function HomeCollage({ artist, label }: HomeCollageProps) {
  return (
    <div className="relative mx-auto h-[34rem] w-full max-w-xl sm:h-[40rem] lg:h-[44rem] lg:max-w-none">
      <div className="absolute top-[8%] left-[4%] hidden h-40 w-28 -rotate-12 border-[10px] border-white bg-pink sm:block" />
      <div className="absolute right-[6%] bottom-[10%] hidden h-36 w-36 rotate-6 border-[10px] border-ink bg-lime sm:block" />
      <Link
        href="/news"
        className="absolute top-[6%] right-[10%] w-[42%] min-w-[9.5rem] rotate-[8deg] border-[10px] border-white bg-ink shadow-2xl outline-offset-4"
      >
        <span className="flex aspect-[4/5] items-end bg-pink p-3 font-display text-3xl leading-none tracking-[0.08em] text-ink sm:text-5xl">
          News
        </span>
      </Link>
      <Link
        href="/about"
        className="absolute bottom-[6%] left-[6%] w-[38%] min-w-[9rem] -rotate-[7deg] border-[10px] border-lime bg-ink p-4 shadow-2xl outline-offset-4"
      >
        <span className="font-display text-2xl leading-none tracking-[0.1em] text-lime sm:text-4xl">
          {label}
        </span>
      </Link>
      {artist ? (
        <Link
          href={`/artists/${artist.slug}`}
          className="absolute top-[18%] left-[22%] w-[58%] min-w-[13rem] -rotate-[5deg] border-[10px] border-ink bg-ink shadow-2xl outline-offset-4"
        >
          <figure>
            <Image
              src={artist.portrait}
              alt={artist.portraitAlt}
              width={800}
              height={1000}
              priority
              className="aspect-[4/5] w-full object-cover"
            />
            <figcaption className="bg-ink px-3 py-2 text-center font-display text-xl tracking-[0.16em] text-lime uppercase sm:text-2xl">
              {artist.displayName}
            </figcaption>
          </figure>
        </Link>
      ) : null}
    </div>
  );
}

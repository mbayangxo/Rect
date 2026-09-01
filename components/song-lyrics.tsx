type Props = {
  lyrics: string;
  title?: string;
};

/** Fan-facing lyrics panel — preserves line breaks from plain text. */
export function SongLyrics({ lyrics, title }: Props) {
  const text = lyrics.trim();
  if (!text) return null;

  return (
    <section className="mt-8 border-t border-white/[0.08] pt-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
        Lyrics{title ? ` · ${title}` : ""}
      </h2>
      <div className="mt-4 whitespace-pre-wrap font-[family-name:var(--font-syne)] text-sm leading-7 text-white/75">
        {text}
      </div>
    </section>
  );
}

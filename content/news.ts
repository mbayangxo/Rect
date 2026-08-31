export type NewsPost = {
  slug: string;
  title: string;
  date: string;
  dateLabel: string;
  excerpt: string;
  body: string[];
  artistSlug: string;
};

export const news: NewsPost[] = [
  {
    slug: "may-lecor-drops-her-debut-single",
    title: "May L'ecor drops her debut single.",
    date: "2023-08-11",
    dateLabel: "Aug 11, 2023",
    excerpt: "The single — Interview with Bloombay magazine.",
    body: [
      "The single -------------",
      "Interview with Bloombay magazine.",
    ],
    artistSlug: "may-lecor",
  },
];

export function getPost(slug: string) {
  return news.find((post) => post.slug === slug);
}

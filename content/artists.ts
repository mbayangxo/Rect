export type Artist = {
  slug: string;
  name: string;
  displayName: string;
  portrait: string;
  portraitAlt: string;
  debut: string;
};

export const artists: Artist[] = [
  {
    slug: "may-lecor",
    name: "May L'ecor",
    displayName: "MAY L'ECOR",
    portrait: "/artists/may-lecor.jpg",
    portraitAlt: "May L'ecor",
    debut: "Debut single announced August 11, 2023.",
  },
];

export function getArtist(slug: string) {
  return artists.find((artist) => artist.slug === slug);
}

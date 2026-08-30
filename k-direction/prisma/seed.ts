import { getPrisma } from "../lib/db";
import { artists } from "../content/artists";
import { news } from "../content/news";
import { site } from "../content/site";

async function main() {
  const prisma = getPrisma();

  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {
      name: site.name,
      legal: site.legal,
      mission: site.mission,
      bookingsEmail: site.emails.bookings,
      inquiriesEmail: site.emails.inquiries,
    },
    create: {
      id: "default",
      name: site.name,
      legal: site.legal,
      mission: site.mission,
      bookingsEmail: site.emails.bookings,
      inquiriesEmail: site.emails.inquiries,
    },
  });

  for (const artist of artists) {
    await prisma.artist.upsert({
      where: { slug: artist.slug },
      update: {
        name: artist.name,
        displayName: artist.displayName,
        portrait: artist.portrait,
        portraitAlt: artist.portraitAlt,
        debut: artist.debut,
      },
      create: artist,
    });
  }

  for (const post of news) {
    const artist = await prisma.artist.findUnique({
      where: { slug: post.artistSlug },
    });
    await prisma.newsPost.upsert({
      where: { slug: post.slug },
      update: {
        title: post.title,
        publishedAt: new Date(`${post.date}T12:00:00.000Z`),
        excerpt: post.excerpt,
        body: JSON.stringify(post.body),
        artistId: artist?.id ?? null,
      },
      create: {
        slug: post.slug,
        title: post.title,
        publishedAt: new Date(`${post.date}T12:00:00.000Z`),
        excerpt: post.excerpt,
        body: JSON.stringify(post.body),
        artistId: artist?.id ?? null,
      },
    });
  }
}

main()
  .then(async () => {
    await getPrisma().$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await getPrisma().$disconnect();
    process.exit(1);
  });

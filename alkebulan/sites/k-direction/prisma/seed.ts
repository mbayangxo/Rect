import { getPrisma } from "../lib/db";
import { artists } from "../content/artists";
import { news } from "../content/news";
import { site } from "../content/site";

async function main() {
  const prisma = getPrisma();

  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: site.name,
      legal: site.legal,
      mission: site.mission,
      bookingsEmail: site.emails.bookings,
      inquiriesEmail: site.emails.inquiries,
      inquiryDestination: "portal",
    },
  });

  for (const artist of artists) {
    await prisma.artist.upsert({
      where: { slug: artist.slug },
      update: {},
      create: artist,
    });
  }

  for (const post of news) {
    const artist = await prisma.artist.findUnique({
      where: { slug: post.artistSlug },
    });
    await prisma.newsPost.upsert({
      where: { slug: post.slug },
      update: {},
      create: {
        slug: post.slug,
        title: post.title,
        publishedAt: new Date(`${post.date}T12:00:00.000Z`),
        excerpt: post.excerpt,
        body: JSON.stringify(post.body),
        artistId: artist?.id ?? null,
        published: true,
      },
    });
  }

  await prisma.job.upsert({
    where: { slug: "label-assistant" },
    update: {},
    create: {
      slug: "label-assistant",
      title: "Label assistant",
      description:
        "Help run day-to-day label work: scheduling, assets, and artist support.",
      location: "Remote",
      published: true,
    },
  });
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

-- K-Direction schema for Supabase/Postgres.
-- Not applied from this repo yet. Local/dev still uses Prisma SQLite.
-- Apply in the Supabase SQL editor when you attach a Kebu/K-Direction project.

create table if not exists "SiteSettings" (
  id text primary key default 'default',
  name text not null,
  legal text not null,
  mission text not null,
  "bookingsEmail" text not null,
  "inquiriesEmail" text not null,
  "inquiryDestination" text not null default 'portal',
  "kebuUrl" text,
  "jokoUrl" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "Artist" (
  id text primary key,
  slug text not null unique,
  name text not null,
  "displayName" text not null,
  portrait text not null,
  "portraitAlt" text not null,
  debut text not null,
  bio text not null default '',
  "kebuUrl" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "NewsPost" (
  id text primary key,
  slug text not null unique,
  title text not null,
  "publishedAt" timestamptz not null,
  excerpt text not null,
  body text not null,
  "coverImage" text,
  published boolean not null default true,
  "artistId" text references "Artist"(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "Event" (
  id text primary key,
  slug text not null unique,
  title text not null,
  venue text,
  city text,
  "startsAt" timestamptz not null,
  description text not null default '',
  image text,
  "ticketUrl" text,
  published boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "Job" (
  id text primary key,
  slug text not null unique,
  title text not null,
  description text not null,
  location text not null default '',
  published boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "JobApplication" (
  id text primary key,
  "jobId" text not null references "Job"(id) on delete cascade,
  "firstName" text not null,
  "lastName" text not null,
  email text not null,
  note text not null default '',
  "resumePath" text not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists "Inquiry" (
  id text primary key,
  "firstName" text not null,
  "lastName" text not null,
  email text not null,
  message text not null,
  "readAt" timestamptz,
  "createdAt" timestamptz not null default now()
);

create index if not exists "Artist_slug_idx" on "Artist"(slug);
create index if not exists "NewsPost_publishedAt_idx" on "NewsPost"("publishedAt");
create index if not exists "NewsPost_artistId_idx" on "NewsPost"("artistId");
create index if not exists "NewsPost_published_idx" on "NewsPost"(published);
create index if not exists "Event_startsAt_idx" on "Event"("startsAt");
create index if not exists "Event_published_idx" on "Event"(published);
create index if not exists "Event_slug_idx" on "Event"(slug);
create index if not exists "Job_published_idx" on "Job"(published);
create index if not exists "Job_slug_idx" on "Job"(slug);
create index if not exists "JobApplication_jobId_idx" on "JobApplication"("jobId");
create index if not exists "JobApplication_createdAt_idx" on "JobApplication"("createdAt");
create index if not exists "JobApplication_email_idx" on "JobApplication"(email);
create index if not exists "Inquiry_createdAt_idx" on "Inquiry"("createdAt");
create index if not exists "Inquiry_email_idx" on "Inquiry"(email);

alter table "Artist" enable row level security;
alter table "NewsPost" enable row level security;
alter table "Event" enable row level security;
alter table "Job" enable row level security;
alter table "JobApplication" enable row level security;
alter table "Inquiry" enable row level security;
alter table "SiteSettings" enable row level security;

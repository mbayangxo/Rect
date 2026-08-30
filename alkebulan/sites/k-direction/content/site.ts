export const site = {
  name: "K-DIRECTION",
  legal: "K-DIRECTION CORP.",
  mission: "A recording label focused on cultivating and supporting talent.",
  emails: {
    bookings: "Bookings@k-direction.com",
    inquiries: "mgmt@k-direction.com",
  },
} as const;

export const nav = [
  { href: "/artists", label: "Artist" },
  { href: "/events", label: "Events" },
  { href: "/news", label: "News" },
  { href: "/contact", label: "Contact" },
  { href: "/about", label: "About us" },
  { href: "/careers", label: "Careers" },
] as const;

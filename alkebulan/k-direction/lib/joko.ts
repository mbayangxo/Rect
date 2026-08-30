export function jokoTicketHref(
  eventUrl?: string | null,
  siteUrl?: string | null,
) {
  const event = eventUrl?.trim();
  if (event) {
    return event;
  }
  const site = siteUrl?.trim();
  return site || null;
}

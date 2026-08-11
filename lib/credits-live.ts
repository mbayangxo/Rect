/** Client-only live credit balance (player -> shell meter). */

export const RECT_CREDITS_EVENT = "rect:credits-remaining";

export function publishCreditsRemaining(balance: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(RECT_CREDITS_EVENT, { detail: { balance } }),
  );
}

export function subscribeCreditsRemaining(
  handler: (balance: number) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<{ balance?: unknown }>).detail;
    if (typeof detail?.balance === "number" && Number.isFinite(detail.balance)) {
      handler(Math.max(0, Math.floor(detail.balance)));
    }
  };

  window.addEventListener(RECT_CREDITS_EVENT, onEvent);
  return () => window.removeEventListener(RECT_CREDITS_EVENT, onEvent);
}

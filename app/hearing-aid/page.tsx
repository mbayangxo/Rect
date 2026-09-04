import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy path — social inbox now lives at /inbox.
 * Hearing Aids (podcasts) are at /hearing-aids under Wave.
 */
export default function LegacyHearingAidRedirect() {
  redirect("/inbox");
}

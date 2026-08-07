import type { Metadata } from "next";
import { CulturalOnboarding } from "@/components/cultural-onboarding";

export const metadata: Metadata = {
  title: "Join RECT SOUND",
  description: "Join RECT SOUND — a world of music.",
};

/** Cultural onboarding entry — dashboard redirects here when logged out. */
export default function OnboardingPage() {
  return (
    <main className="min-h-dvh bg-[#040d06]">
      <CulturalOnboarding />
    </main>
  );
}

import type { Metadata } from "next";
import { CulturalOnboarding } from "@/components/cultural-onboarding";

export const metadata: Metadata = {
  title: "Join RECT SOUND",
  description: "Music for everyone. Build Your Soundprint.",
};

export default function SignupPage() {
  return (
    <main className="min-h-dvh bg-[#040d06]">
      <CulturalOnboarding />
    </main>
  );
}

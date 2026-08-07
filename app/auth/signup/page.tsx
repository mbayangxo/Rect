import type { Metadata } from "next";
import { CulturalOnboarding } from "@/components/cultural-onboarding";

export const metadata: Metadata = {
  title: "RECT — Join",
  description: "Africa's music. Your world.",
};

export default function SignupPage() {
  return (
    <main className="min-h-dvh bg-[#040d06]">
      <CulturalOnboarding />
    </main>
  );
}

import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding-flow";

export const metadata: Metadata = {
  title: "RECT — Join",
  description: "Africa's music. Your world.",
};

export default function SignupPage() {
  return <OnboardingFlow />;
}

import { redirect } from "next/navigation";

export default function LegacyArtistSignupRedirect() {
  redirect("/artist/signup");
}

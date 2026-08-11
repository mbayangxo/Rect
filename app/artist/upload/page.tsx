import { redirect } from "next/navigation";

/** Upload lives in Artist Studio. */
export default function ArtistUploadRedirect() {
  redirect("/studio");
}

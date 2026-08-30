import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StudioIndexPage() {
  redirect("/studio/upload");
}

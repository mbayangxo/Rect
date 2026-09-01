import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy path — Hearing Aid is the listener activity hub. */
export default function ListenerInboxRedirect() {
  redirect("/hearing-aid");
}

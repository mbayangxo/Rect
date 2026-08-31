import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getSettings } from "@/lib/catalog";

const EMAIL =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 80;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 4000;

type ContactBody = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  message?: unknown;
  company?: unknown;
};

function asTrimmed(value: unknown, max: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

export async function POST(request: Request) {
  let payload: ContactBody;
  try {
    payload = (await request.json()) as ContactBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (asTrimmed(payload.company, 200)) {
    return NextResponse.json({ ok: true });
  }

  const firstName = asTrimmed(payload.firstName, MAX_NAME);
  const lastName = asTrimmed(payload.lastName, MAX_NAME);
  const email = asTrimmed(payload.email, MAX_EMAIL).toLowerCase();
  const message = asTrimmed(payload.message, MAX_MESSAGE);

  if (!email || !EMAIL.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ ok: false, error: "Enter a message." }, { status: 400 });
  }

  try {
    await getSettings();
    await getPrisma().inquiry.create({
      data: { firstName, lastName, email, message },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("contact insert failed", error);
    return NextResponse.json(
      { ok: false, error: "Could not save your message. Try again." },
      { status: 500 },
    );
  }
}

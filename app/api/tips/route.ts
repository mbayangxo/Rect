import { NextResponse } from "next/server";

/**
 * Legacy free tip endpoint — disabled.
 * All tips must go through JOKO: POST /api/tips/pay
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Free tips are disabled. Use /api/tips/pay with Wave, Orange Money, MTN, or JOKO wallet.",
      code: "use_joko_pay",
      pay_path: "/api/tips/pay",
    },
    { status: 410 },
  );
}

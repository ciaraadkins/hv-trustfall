import { NextResponse } from "next/server"
import { overallStats } from "@/lib/server/store"

export const dynamic = "force-dynamic"

/** The overall Humans vs AI score, from the local round log. */
export async function GET() {
  return NextResponse.json(overallStats())
}

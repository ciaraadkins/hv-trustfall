import { NextResponse } from "next/server"
import { overallStats } from "@/lib/server/store"

export const dynamic = "force-dynamic"

/** The overall Humans vs AI score, across every player. */
export async function GET() {
  try {
    return NextResponse.json(await overallStats())
  } catch (error) {
    console.error("Couldn't load the score", error)
    return NextResponse.json({ error: "Couldn't load the score." }, { status: 500 })
  }
}

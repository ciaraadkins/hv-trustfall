import { after } from "next/server"
import { finishRequestSchema, type FinishResponse } from "@/lib/game/schemas"
import { rememberRound } from "@/lib/server/game"
import { readRoundToken } from "@/lib/server/round-token"
import { handleGameRequest } from "@/lib/server/route"
import { overallStats, recordRound } from "@/lib/server/store"

/**
 * End a round: log it to data/rounds.jsonl, with what the AI remembered during
 * it, and reveal who the opponent was. Then, without holding up the reveal,
 * the AI that played updates its memory of the player.
 */
export async function POST(request: Request) {
  return handleGameRequest(request, finishRequestSchema, (req): FinishResponse => {
    const { opponent, memory } = readRoundToken(req.roundToken, req.roundId)
    const { record, created } = recordRound({ ...req, opponent, memory })
    if (created) after(() => rememberRound(opponent, record))
    return { ...opponent, stats: overallStats() }
  })
}

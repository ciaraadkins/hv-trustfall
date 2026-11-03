import { resolveApiModel } from "@/lib/models"
import { startRequestSchema, type StartResponse } from "@/lib/game/schemas"
import { pickOpponent } from "@/lib/server/matchmaking"
import { memorySnapshot } from "@/lib/server/memory"
import { issueRoundToken } from "@/lib/server/round-token"
import { handleGameRequest } from "@/lib/server/route"
import { readRounds } from "@/lib/server/store"

/** Pick a hidden opponent for a new round, and freeze what the AI remembers for it. */
export async function POST(request: Request) {
  return handleGameRequest(request, startRequestSchema, (req): StartResponse => {
    const model = pickOpponent(readRounds().map((r) => r.provider))
    const opponent = { model, apiModel: resolveApiModel(model) }
    return { roundToken: issueRoundToken({ opponent, memory: memorySnapshot() }, req.roundId) }
  })
}

import { resolveApiModel } from "@/lib/models"
import { startRequestSchema, type StartResponse } from "@/lib/game/schemas"
import { pickOpponent } from "@/lib/server/matchmaking"
import { memorySnapshot } from "@/lib/server/memory"
import { issueRoundToken } from "@/lib/server/round-token"
import { handleGameRequest } from "@/lib/server/route"
import { opponentsFaced, touchPlayer } from "@/lib/server/store"

/** Pick a hidden opponent for a new round, and freeze what the AI remembers about this player for it. */
export async function POST(request: Request) {
  return handleGameRequest(request, startRequestSchema, async ({ roundId, playerId }): Promise<StartResponse> => {
    await touchPlayer(playerId)
    const model = pickOpponent(await opponentsFaced(playerId))
    const opponent = { model, apiModel: resolveApiModel(model) }
    const memory = await memorySnapshot(playerId)
    return { roundToken: issueRoundToken({ playerId, opponent, memory }, roundId) }
  })
}

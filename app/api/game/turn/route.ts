import { turnRequestSchema } from "@/lib/game/schemas"
import { takeAiTurn } from "@/lib/server/game"
import { playerContext } from "@/lib/server/memory"
import { readRoundToken } from "@/lib/server/round-token"
import { handleGameRequest } from "@/lib/server/route"

export async function POST(request: Request) {
  return handleGameRequest(request, turnRequestSchema, (req) => {
    const { opponent, memory } = readRoundToken(req.roundToken, req.roundId)
    return takeAiTurn(req, opponent, playerContext(memory))
  })
}

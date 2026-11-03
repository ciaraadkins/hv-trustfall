import "server-only"

import { availableModels, isAIModel } from "@/lib/models"
import type { AIModel } from "@/types/game"
import { GameError } from "./providers"

/**
 * Pick the next opponent from the models with an API key set. Among those,
 * choose one the player has faced least (`played` is every past round's
 * opponent, from the round log), so every model gets played evenly.
 *
 * FORCE_OPPONENT=<model id> always picks that model, for testing.
 */
export function pickOpponent(played: AIModel[], random: () => number = Math.random): AIModel {
  const pool = availableModels()

  const forced = process.env.FORCE_OPPONENT?.trim()
  if (forced) {
    if (isAIModel(forced) && pool.includes(forced)) return forced
    console.error(`FORCE_OPPONENT="${forced}" isn't an available model; picking at random`)
  }

  if (pool.length === 0) {
    console.error("No AI provider keys are set on the server")
    throw new GameError("No opponents are available right now. Try again later.", 503)
  }

  const plays = (id: AIModel) => played.filter((m) => m === id).length
  const fewest = Math.min(...pool.map(plays))
  const candidates = pool.filter((id) => plays(id) === fewest)
  return candidates[Math.floor(random() * candidates.length)]
}

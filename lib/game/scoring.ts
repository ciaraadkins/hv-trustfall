import type { Choice, Outcome, RoundResult, ScoreStats } from "@/types/game"

/** Points for each outcome, indexed by human choice then AI choice. */
export const PAYOFFS: Record<Choice, Record<Choice, { human: number; ai: number }>> = {
  SHARE: {
    SHARE: { human: 3, ai: 3 },
    KEEP: { human: 0, ai: 5 },
  },
  KEEP: {
    SHARE: { human: 5, ai: 0 },
    KEEP: { human: 1, ai: 1 },
  },
}

export function scoreRound(human: Choice, ai: Choice): { yourPoints: number; aiPoints: number } {
  const payoff = PAYOFFS[human][ai]
  return { yourPoints: payoff.human, aiPoints: payoff.ai }
}

export function formatPoints(points: number): string {
  return `+${points} ${points === 1 ? "POINT" : "POINTS"}`
}

/** Plain-text payoff matrix, used in prompts and the welcome message. */
export function describePayoffs(): string {
  return [
    `- Both SHARE: Human +${PAYOFFS.SHARE.SHARE.human}, AI +${PAYOFFS.SHARE.SHARE.ai}`,
    `- Human SHARE, AI KEEP: Human +${PAYOFFS.SHARE.KEEP.human}, AI +${PAYOFFS.SHARE.KEEP.ai}`,
    `- Human KEEP, AI SHARE: Human +${PAYOFFS.KEEP.SHARE.human}, AI +${PAYOFFS.KEEP.SHARE.ai}`,
    `- Both KEEP: Human +${PAYOFFS.KEEP.KEEP.human}, AI +${PAYOFFS.KEEP.KEEP.ai}`,
  ].join("\n")
}

export const EMPTY_STATS: ScoreStats = {
  humanTotal: 0,
  aiTotal: 0,
  gamesPlayed: 0,
  bothShare: 0,
  humanShareAiKeep: 0,
  humanKeepAiShare: 0,
  bothKeep: 0,
}

export function outcomeOf(human: Choice, ai: Choice): Outcome {
  if (human === "SHARE") return ai === "SHARE" ? "both_share" : "human_share_ai_keep"
  return ai === "SHARE" ? "human_keep_ai_share" : "both_keep"
}

export function computeStats(rounds: Pick<RoundResult, "yourDecision" | "aiDecision">[]): ScoreStats {
  return rounds.reduce<ScoreStats>((stats, r) => {
    const outcome = outcomeOf(r.yourDecision, r.aiDecision)
    const points = PAYOFFS[r.yourDecision][r.aiDecision]
    return {
      humanTotal: stats.humanTotal + points.human,
      aiTotal: stats.aiTotal + points.ai,
      gamesPlayed: stats.gamesPlayed + 1,
      bothShare: stats.bothShare + (outcome === "both_share" ? 1 : 0),
      humanShareAiKeep: stats.humanShareAiKeep + (outcome === "human_share_ai_keep" ? 1 : 0),
      humanKeepAiShare: stats.humanKeepAiShare + (outcome === "human_keep_ai_share" ? 1 : 0),
      bothKeep: stats.bothKeep + (outcome === "both_keep" ? 1 : 0),
    }
  }, EMPTY_STATS)
}

import { describe, expect, it } from "vitest"
import { computeSessionStats, formatPoints, scoreRound } from "@/lib/game/scoring"
import type { RoundResult } from "@/types/game"

describe("scoreRound", () => {
  it.each([
    ["SHARE", "SHARE", 3, 3],
    ["SHARE", "KEEP", 0, 5],
    ["KEEP", "SHARE", 5, 0],
    ["KEEP", "KEEP", 1, 1],
  ] as const)("human %s / AI %s → %i / %i", (human, ai, yourPoints, aiPoints) => {
    expect(scoreRound(human, ai)).toEqual({ yourPoints, aiPoints })
  })
})

describe("formatPoints", () => {
  it("uses the singular for one point", () => {
    expect(formatPoints(1)).toBe("+1 POINT")
    expect(formatPoints(0)).toBe("+0 POINTS")
    expect(formatPoints(5)).toBe("+5 POINTS")
  })
})

describe("computeSessionStats", () => {
  const round = (yourDecision: "SHARE" | "KEEP", aiDecision: "SHARE" | "KEEP"): RoundResult => ({
    model: "claude",
    yourDecision,
    aiDecision,
    ...scoreRound(yourDecision, aiDecision),
    aiReasoning: null,
    profileVersion: 1,
    date: "2026-01-01T00:00:00.000Z",
  })

  it("starts empty", () => {
    expect(computeSessionStats([])).toMatchObject({ humanTotal: 0, aiTotal: 0, gamesPlayed: 0 })
  })

  it("totals points and counts outcomes", () => {
    const stats = computeSessionStats([round("SHARE", "SHARE"), round("SHARE", "KEEP"), round("KEEP", "KEEP")])
    expect(stats).toEqual({
      humanTotal: 4,
      aiTotal: 9,
      gamesPlayed: 3,
      bothShare: 1,
      humanShareAiKeep: 1,
      humanKeepAiShare: 0,
      bothKeep: 1,
    })
  })
})

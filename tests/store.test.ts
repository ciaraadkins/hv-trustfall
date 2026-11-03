import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  opponentsFaced,
  overallStats,
  readRounds,
  recentRounds,
  recordRound,
  touchPlayer,
  type FinishedRound,
} from "@/lib/server/store"
import type { Choice } from "@/types/game"
import { OTHER_PLAYER, PLAYER, setupTestDb } from "./db"

setupTestDb()

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  await touchPlayer(PLAYER)
  await touchPlayer(OTHER_PLAYER)
})

const START = Date.UTC(2026, 9, 30, 12, 0, 0)
let n = 0
const round = (humanDecision: Choice, aiDecision: Choice, overrides: Partial<FinishedRound> = {}): FinishedRound => ({
  roundId: `r${++n}`,
  playerId: PLAYER,
  opponent: { model: "grok", apiModel: "grok-4.20-0309-non-reasoning" },
  messages: [
    { sender: "SYSTEM", content: "welcome", timestamp: START },
    { sender: "YOU", content: "I'll share", timestamp: START + 12_000 },
    { sender: "AI", content: "me too", timestamp: START + 20_000 },
  ],
  humanDecision,
  aiDecision,
  aiLockInReason: "They seem honest.",
  memory: { profileVersion: null, noteIds: [] },
  ...overrides,
})

describe("rounds", () => {
  it("starts empty", async () => {
    expect(await readRounds()).toEqual([])
    expect(await overallStats()).toMatchObject({ humanTotal: 0, aiTotal: 0, gamesPlayed: 0 })
  })

  it("logs a round with the player, model, outcome, scores, and transcript", async () => {
    const { record } = await recordRound(round("SHARE", "KEEP"), new Date(START + 60_000))
    const expected = {
      playerId: PLAYER,
      date: "2026-10-30T12:01:00.000Z",
      startedAt: "2026-10-30T12:00:00.000Z",
      durationSeconds: 60,
      provider: "grok",
      modelName: "GROK",
      apiModel: "grok-4.20-0309-non-reasoning",
      humanDecision: "SHARE",
      aiDecision: "KEEP",
      outcome: "human_share_ai_keep",
      humanPoints: 0,
      aiPoints: 5,
      scoreBefore: { humans: 0, ai: 0, rounds: 0 },
      scoreAfter: { humans: 0, ai: 5, rounds: 1 },
      humanMessageCount: 1,
      aiMessageCount: 1,
      aiLockInReason: "They seem honest.",
      memory: { profileVersion: null, noteIds: [] },
      transcript: [
        { sender: "HUMAN", text: "I'll share", at: "2026-10-30T12:00:12.000Z", secondsIntoRound: 12 },
        { sender: "AI", text: "me too", at: "2026-10-30T12:00:20.000Z", secondsIntoRound: 20 },
      ],
    }
    expect(record).toMatchObject(expected)
    // And it reads back from the database the same.
    expect(await readRounds()).toEqual([record])
  })

  it("keeps one overall score across every player", async () => {
    await recordRound(round("SHARE", "SHARE"))
    const { record } = await recordRound(round("KEEP", "SHARE", { playerId: OTHER_PLAYER }))
    expect(record.scoreBefore).toEqual({ humans: 3, ai: 3, rounds: 1 })
    expect(record.scoreAfter).toEqual({ humans: 8, ai: 3, rounds: 2 })
    expect(await overallStats()).toMatchObject({ humanTotal: 8, aiTotal: 3, gamesPlayed: 2, bothShare: 1, humanKeepAiShare: 1 })
  })

  it("keeps each player's history separate", async () => {
    await recordRound(round("SHARE", "SHARE"))
    await recordRound(round("KEEP", "KEEP", { playerId: OTHER_PLAYER, opponent: { model: "claude", apiModel: "x" } }))
    await recordRound(round("KEEP", "SHARE"))
    expect((await readRounds(PLAYER)).map((r) => r.humanDecision)).toEqual(["SHARE", "KEEP"])
    expect((await recentRounds(PLAYER, 1)).map((r) => r.humanDecision)).toEqual(["KEEP"])
    expect(await opponentsFaced(OTHER_PLAYER)).toEqual(["claude"])
    expect(await readRounds()).toHaveLength(3)
  })

  it("logs a retried round only once", async () => {
    const first = round("KEEP", "KEEP")
    expect((await recordRound(first)).created).toBe(true)
    expect((await recordRound(first)).created).toBe(false)
    expect(await readRounds()).toHaveLength(1)
  })

  it("gives concurrent rounds consecutive running scores", async () => {
    await Promise.all([1, 2, 3, 4].map(() => recordRound(round("SHARE", "SHARE"))))
    const rounds = await readRounds()
    expect(rounds.map((r) => r.scoreAfter.rounds).sort()).toEqual([1, 2, 3, 4])
  })
})

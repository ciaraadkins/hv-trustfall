import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { overallStats, readRounds, recordRound, type FinishedRound } from "@/lib/server/store"
import type { Choice } from "@/types/game"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "trustfall-"))
  process.env.TRUSTFALL_DATA_DIR = dir
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.TRUSTFALL_DATA_DIR
})

const START = Date.UTC(2026, 9, 30, 12, 0, 0)
let n = 0
const round = (humanDecision: Choice, aiDecision: Choice, overrides: Partial<FinishedRound> = {}): FinishedRound => ({
  roundId: `r${++n}`,
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

describe("round log", () => {
  it("starts empty", () => {
    expect(readRounds()).toEqual([])
    expect(overallStats()).toMatchObject({ humanTotal: 0, aiTotal: 0, gamesPlayed: 0 })
  })

  it("logs a round with the model, outcome, scores, and transcript", () => {
    const { record } = recordRound(round("SHARE", "KEEP"), new Date(START + 60_000))
    expect(record).toMatchObject({
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
    })
    expect(record.transcript).toEqual([
      { sender: "HUMAN", text: "I'll share", at: "2026-10-30T12:00:12.000Z", secondsIntoRound: 12 },
      { sender: "AI", text: "me too", at: "2026-10-30T12:00:20.000Z", secondsIntoRound: 20 },
    ])
    // One JSON object per line.
    expect(readFileSync(path.join(dir, "rounds.jsonl"), "utf8").trim().split("\n")).toHaveLength(1)
  })

  it("records the overall score at the time each round was played", () => {
    recordRound(round("SHARE", "SHARE"))
    const { record } = recordRound(round("KEEP", "SHARE"))
    expect(record.scoreBefore).toEqual({ humans: 3, ai: 3, rounds: 1 })
    expect(record.scoreAfter).toEqual({ humans: 8, ai: 3, rounds: 2 })
    expect(overallStats()).toMatchObject({ humanTotal: 8, aiTotal: 3, gamesPlayed: 2, bothShare: 1, humanKeepAiShare: 1 })
  })

  it("logs a retried round only once", () => {
    const first = round("KEEP", "KEEP")
    expect(recordRound(first).created).toBe(true)
    expect(recordRound(first).created).toBe(false)
    expect(readRounds()).toHaveLength(1)
  })

  it("skips a line it can't read instead of failing", () => {
    recordRound(round("SHARE", "SHARE"))
    appendFileSync(path.join(dir, "rounds.jsonl"), "{not json\n")
    expect(readRounds()).toHaveLength(1)
  })
})

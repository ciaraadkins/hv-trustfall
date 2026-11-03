import "server-only"

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { MODELS } from "@/lib/models"
import { STRATEGIC_PROFILE_VERSION } from "@/lib/game/prompts"
import { computeStats, outcomeOf, scoreRound } from "@/lib/game/scoring"
import type { Choice, MemorySnapshot, Message, RoundRecord, ScoreStats } from "@/types/game"
import type { Opponent } from "./providers"

/**
 * The game's local backend: plain files in data/ (or TRUSTFALL_DATA_DIR).
 *
 * - rounds.jsonl: one RoundRecord per line, appended when a round finishes.
 *   The source of truth for scores, matchmaking, and the AI's view of the player.
 * - memory/: the AI's memory of the player (see memory.ts).
 */

/** A path inside the data folder. */
export const dataPath = (...parts: string[]) =>
  path.join(process.env.TRUSTFALL_DATA_DIR?.trim() || path.join(process.cwd(), "data"), ...parts)

/** Every record in a JSON Lines file, skipping lines that don't parse. */
export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return []
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T]
      } catch {
        // A hand-edited or half-written line shouldn't take the game down.
        console.error(`Skipping an unreadable line in ${path.basename(file)}`)
        return []
      }
    })
}

export function appendJsonl(file: string, record: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(record)}\n`)
}

export function writeText(file: string, text: string) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}

const roundsFile = () => dataPath("rounds.jsonl")

export const readRounds = () => readJsonl<RoundRecord>(roundsFile())

export function overallStats(rounds: RoundRecord[] = readRounds()): ScoreStats {
  return computeStats(rounds.map((r) => ({ yourDecision: r.humanDecision, aiDecision: r.aiDecision })))
}

export type FinishedRound = {
  roundId: string
  opponent: Opponent
  messages: Message[]
  humanDecision: Choice
  aiDecision: Choice
  aiLockInReason: string | null
  memory: MemorySnapshot
}

function buildRecord(round: FinishedRound, before: ScoreStats, now: Date): RoundRecord {
  const { yourPoints, aiPoints } = scoreRound(round.humanDecision, round.aiDecision)
  const startedAtMs = round.messages.find((m) => m.sender === "SYSTEM")?.timestamp ?? round.messages[0]?.timestamp ?? now.getTime()
  const chat = round.messages.filter((m) => m.sender !== "SYSTEM")

  return {
    roundId: round.roundId,
    date: now.toISOString(),
    startedAt: new Date(startedAtMs).toISOString(),
    durationSeconds: Math.round((now.getTime() - startedAtMs) / 1000),
    provider: round.opponent.model,
    modelName: MODELS[round.opponent.model].displayName,
    apiModel: round.opponent.apiModel,
    humanDecision: round.humanDecision,
    aiDecision: round.aiDecision,
    outcome: outcomeOf(round.humanDecision, round.aiDecision),
    humanPoints: yourPoints,
    aiPoints,
    scoreBefore: { humans: before.humanTotal, ai: before.aiTotal, rounds: before.gamesPlayed },
    scoreAfter: {
      humans: before.humanTotal + yourPoints,
      ai: before.aiTotal + aiPoints,
      rounds: before.gamesPlayed + 1,
    },
    humanMessageCount: chat.filter((m) => m.sender === "YOU").length,
    aiMessageCount: chat.filter((m) => m.sender === "AI").length,
    aiLockInReason: round.aiLockInReason,
    strategyVersion: STRATEGIC_PROFILE_VERSION,
    memory: round.memory,
    transcript: chat.map((m) => ({
      sender: m.sender === "YOU" ? "HUMAN" : "AI",
      text: m.content,
      at: new Date(m.timestamp).toISOString(),
      secondsIntoRound: Math.round((m.timestamp - startedAtMs) / 1000),
    })),
  }
}

/** Log a finished round. Recording the same round again (a retried request) returns the first record. */
export function recordRound(round: FinishedRound, now = new Date()): { record: RoundRecord; created: boolean } {
  const rounds = readRounds()
  const existing = rounds.find((r) => r.roundId === round.roundId)
  if (existing) return { record: existing, created: false }

  const record = buildRecord(round, overallStats(rounds), now)
  appendJsonl(roundsFile(), record)
  return { record, created: true }
}

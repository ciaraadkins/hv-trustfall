import "server-only"

import { MODELS } from "@/lib/models"
import { STRATEGIC_PROFILE_VERSION } from "@/lib/game/prompts"
import { EMPTY_STATS, outcomeOf, scoreRound } from "@/lib/game/scoring"
import type { AIModel, Choice, MemorySnapshot, Message, Outcome, RoundRecord, ScoreStats } from "@/types/game"
import { lock, sql, transaction, type Db } from "./db"
import type { Opponent } from "./providers"

/**
 * Players and their rounds, in Postgres (see db.ts). The rounds table is the
 * source of truth for the overall score, matchmaking, and the AI's view of
 * each player.
 */

/** Note a player's visit, creating them the first time. */
export async function touchPlayer(playerId: string): Promise<void> {
  await sql(
    `INSERT INTO players (id) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`,
    [playerId],
  )
}

/** The overall Humans vs AI score, across every player. */
export async function overallStats(db?: Db): Promise<ScoreStats> {
  const rows = await sql<{ outcome: Outcome; rounds: number; humans: number; ai: number }>(
    `SELECT outcome, count(*)::int AS rounds, sum(human_points)::int AS humans, sum(ai_points)::int AS ai
     FROM rounds GROUP BY outcome`,
    [],
    db,
  )
  const count = (outcome: Outcome) => rows.find((r) => r.outcome === outcome)?.rounds ?? 0
  return {
    ...EMPTY_STATS,
    humanTotal: rows.reduce((sum, r) => sum + r.humans, 0),
    aiTotal: rows.reduce((sum, r) => sum + r.ai, 0),
    gamesPlayed: rows.reduce((sum, r) => sum + r.rounds, 0),
    bothShare: count("both_share"),
    humanShareAiKeep: count("human_share_ai_keep"),
    humanKeepAiShare: count("human_keep_ai_share"),
    bothKeep: count("both_keep"),
  }
}

/** Which model played each of a player's rounds, for even matchmaking. */
export async function opponentsFaced(playerId: string): Promise<AIModel[]> {
  const rows = await sql<{ provider: AIModel }>("SELECT provider FROM rounds WHERE player_id = $1", [playerId])
  return rows.map((r) => r.provider)
}

type RoundRow = {
  round_id: string
  seq: string
  player_id: string
  started_at: Date
  finished_at: Date
  duration_seconds: number
  provider: AIModel
  model_name: string
  api_model: string
  human_decision: Choice
  ai_decision: Choice
  outcome: Outcome
  human_points: number
  ai_points: number
  score_before: RoundRecord["scoreBefore"]
  score_after: RoundRecord["scoreAfter"]
  human_message_count: number
  ai_message_count: number
  ai_lock_in_reason: string | null
  strategy_version: number
  memory: MemorySnapshot
  transcript: RoundRecord["transcript"]
}

const toRecord = (r: RoundRow): RoundRecord => ({
  roundId: r.round_id,
  playerId: r.player_id,
  date: r.finished_at.toISOString(),
  startedAt: r.started_at.toISOString(),
  durationSeconds: r.duration_seconds,
  provider: r.provider,
  modelName: r.model_name,
  apiModel: r.api_model,
  humanDecision: r.human_decision,
  aiDecision: r.ai_decision,
  outcome: r.outcome,
  humanPoints: r.human_points,
  aiPoints: r.ai_points,
  scoreBefore: r.score_before,
  scoreAfter: r.score_after,
  humanMessageCount: r.human_message_count,
  aiMessageCount: r.ai_message_count,
  aiLockInReason: r.ai_lock_in_reason,
  strategyVersion: r.strategy_version,
  memory: r.memory,
  transcript: r.transcript,
})

/** Rounds, oldest first: one player's, or (for the local DATA page) everyone's. */
export async function readRounds(playerId?: string): Promise<RoundRecord[]> {
  const rows = playerId
    ? await sql<RoundRow>("SELECT * FROM rounds WHERE player_id = $1 ORDER BY seq", [playerId])
    : await sql<RoundRow>("SELECT * FROM rounds ORDER BY seq")
  return rows.map(toRecord)
}

/** A player's most recent rounds, oldest first. */
export async function recentRounds(playerId: string, limit: number): Promise<RoundRecord[]> {
  const rows = await sql<RoundRow>(
    "SELECT * FROM (SELECT * FROM rounds WHERE player_id = $1 ORDER BY seq DESC LIMIT $2) r ORDER BY seq",
    [playerId, limit],
  )
  return rows.map(toRecord)
}

export type FinishedRound = {
  roundId: string
  playerId: string
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
    playerId: round.playerId,
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
export async function recordRound(round: FinishedRound, now = new Date()): Promise<{ record: RoundRecord; created: boolean }> {
  return transaction(async (client) => {
    // One round at a time, so each round's running score follows the last one's.
    await lock(client, "rounds")
    const [existing] = await sql<RoundRow>("SELECT * FROM rounds WHERE round_id = $1", [round.roundId], client)
    if (existing) return { record: toRecord(existing), created: false }

    const r = buildRecord(round, await overallStats(client), now)
    await sql(
      `INSERT INTO rounds (round_id, player_id, started_at, finished_at, duration_seconds, provider, model_name,
         api_model, human_decision, ai_decision, outcome, human_points, ai_points, score_before, score_after,
         human_message_count, ai_message_count, ai_lock_in_reason, strategy_version, memory, transcript)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        r.roundId, r.playerId, r.startedAt, r.date, r.durationSeconds, r.provider, r.modelName, r.apiModel,
        r.humanDecision, r.aiDecision, r.outcome, r.humanPoints, r.aiPoints, JSON.stringify(r.scoreBefore),
        JSON.stringify(r.scoreAfter), r.humanMessageCount, r.aiMessageCount, r.aiLockInReason, r.strategyVersion,
        JSON.stringify(r.memory), JSON.stringify(r.transcript),
      ],
      client,
    )
    return { record: r, created: true }
  })
}

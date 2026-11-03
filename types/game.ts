export type AIModel = "claude" | "openai" | "gemini" | "grok" | "deepseek"

export type Choice = "SHARE" | "KEEP"

type Sender = "SYSTEM" | "YOU" | "AI"

export type Message = {
  sender: Sender
  content: string
  timestamp: number
}

export type RoundResult = {
  /** Who the AI was, revealed once the round is scored. */
  model: AIModel
  /** The exact provider model version that played. */
  apiModel: string
  yourDecision: Choice
  aiDecision: Choice
  yourPoints: number
  aiPoints: number
  /** The AI's private reason for its lock-in. Not shown in the UI; kept for later analysis. */
  aiReasoning: string | null
  /** Which version of the AI's strategy profile this round was played under. */
  profileVersion: number
  date: string
}

/** All-time totals and outcome counts, from the local round log. */
export type ScoreStats = {
  humanTotal: number
  aiTotal: number
  gamesPlayed: number
  bothShare: number
  humanShareAiKeep: number
  humanKeepAiShare: number
  bothKeep: number
}

/** Outcome of a round, from the human's side first. */
export type Outcome = "both_share" | "human_share_ai_keep" | "human_keep_ai_share" | "both_keep"

/**
 * A row of the rounds table: everything about a finished round, kept flat
 * where possible so it's easy to analyze.
 */
export type RoundRecord = {
  roundId: string
  /** The player's anonymous ID (later, tied to their account). */
  playerId: string
  /** When the round finished (ISO 8601). */
  date: string
  /** When the welcome message appeared (ISO 8601). */
  startedAt: string
  durationSeconds: number
  /** The model family: claude, openai, gemini, grok, deepseek. */
  provider: AIModel
  /** Display name of the model family, e.g. GROK. */
  modelName: string
  /** The exact provider model version. */
  apiModel: string
  humanDecision: Choice
  aiDecision: Choice
  outcome: Outcome
  humanPoints: number
  aiPoints: number
  /** Overall Humans vs AI score when the round was played... */
  scoreBefore: { humans: number; ai: number; rounds: number }
  /** ...and once it was counted. */
  scoreAfter: { humans: number; ai: number; rounds: number }
  humanMessageCount: number
  aiMessageCount: number
  /** The AI's private reason for its lock-in. */
  aiLockInReason: string | null
  strategyVersion: number
  /** Exactly what the AI remembered about the player during this round. */
  memory: MemorySnapshot
  transcript: { sender: "HUMAN" | "AI"; text: string; at: string; secondsIntoRound: number }[]
}

/**
 * The AI's memory as of a round's start, frozen for the whole round: the
 * profile version (null before the first one) and the notes it read on top.
 */
export type MemorySnapshot = { profileVersion: number | null; noteIds: number[] }

/** A row of the notes table: the AI's note on the player after a round. Never edited. */
export type NoteRecord = {
  playerId: string
  /** 1, 2, 3, ... in the order written, per player. */
  noteId: number
  addedAt: string
  roundId: string
  /** Who wrote it. Never shown to the AI. */
  provider: AIModel
  apiModel: string
  humanDecision: Choice
  aiDecision: Choice
  /** "failed" keeps a record of a note that couldn't be written. */
  status: "ok" | "failed"
  note: string | null
  error?: string
}

/**
 * A row of the profiles table: a version of the AI's consolidated read on the
 * player, rewritten from the previous version plus the newest notes.
 */
export type ProfileRecord = {
  playerId: string
  version: number
  createdAt: string
  provider: AIModel
  apiModel: string
  /** Every note up to this one is folded into this version. */
  coversNotesThrough: number
  /** The notes added in this update. */
  newNoteIds: number[]
  profile: string
}

export type AIModel = "claude" | "openai"

export type Choice = "SHARE" | "KEEP"

type Sender = "SYSTEM" | "YOU" | "AI"

export type Message = {
  sender: Sender
  content: string
  timestamp: number
}

export type RoundResult = {
  model: AIModel
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

/** In-session totals and outcome counts, sent to the server to build prompts. */
export type SessionStats = {
  humanTotal: number
  aiTotal: number
  gamesPlayed: number
  bothShare: number
  humanShareAiKeep: number
  humanKeepAiShare: number
  bothKeep: number
}

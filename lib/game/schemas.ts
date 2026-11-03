import { z } from "zod"
import { PACES } from "./timing"
import type { AIModel, ScoreStats } from "@/types/game"

const choice = z.enum(["SHARE", "KEEP"])

/** Why the client is asking the AI to act. */
const TRIGGERS = ["human_message", "human_quiet", "follow_up", "human_locked_in", "human_finished"] as const
export type Trigger = (typeof TRIGGERS)[number]

const roundId = z.string().min(1).max(100)
/** Encrypted by the server; only the server can tell which model it names. */
const roundToken = z.string().min(1).max(1000)
const messages = z
  .array(
    z.object({
      sender: z.enum(["SYSTEM", "YOU", "AI"]),
      content: z.string().max(2000),
      timestamp: z.number(),
    }),
  )
  .max(20)

export const startRequestSchema = z.object({ roundId })

export type StartRequest = z.infer<typeof startRequestSchema>
export type StartResponse = { roundToken: string }

/** The finished round, sent once both sides have locked in, to be logged and revealed. */
export const finishRequestSchema = z.object({
  roundId,
  roundToken,
  messages,
  humanDecision: choice,
  aiDecision: choice,
  aiLockInReason: z.string().max(2000).nullable(),
})

export type FinishRequest = z.infer<typeof finishRequestSchema>
/** Who the opponent was, and the overall score now that the round is counted. */
export type FinishResponse = { model: AIModel; apiModel: string; stats: ScoreStats }

export const turnRequestSchema = z.object({
  roundToken,
  roundId,
  messages,
  /** Client clock when the request was sent, for "how long ago" in the prompt. */
  now: z.number(),
  trigger: z.enum(TRIGGERS),
  humanLockedIn: z.boolean(),
  aiLockIn: choice.nullable(),
  /** The AI has to lock in on this turn (the human is waiting, or the AI is out of messages). */
  mustLockIn: z.boolean(),
})

export type TurnRequest = z.infer<typeof turnRequestSchema>

export type TurnResponse = {
  message: string | null
  pace: (typeof PACES)[number]
  lockIn: z.infer<typeof choice> | null
  /** The AI's private reason for locking in; never shown to the human. Set only with `lockIn`. */
  lockInReason: string | null
  followUp: boolean
}

const decisionSchema = z.object({
  reasoning: z.string(),
  decision: choice,
})

export type DecisionOutput = z.infer<typeof decisionSchema>

/** JSON Schema sent to the providers for a forced SHARE/KEEP decision. */
export const DECISION_JSON_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string", description: "One or two sentences on why." },
    decision: { type: "string", enum: ["SHARE", "KEEP"] },
  },
  required: ["reasoning", "decision"],
  additionalProperties: false,
} as const

const turnOutputSchema = z.object({
  message: z.string(),
  pace: z.enum(PACES),
  lockIn: z.enum(["SHARE", "KEEP", "NONE"]),
  lockInReason: z.string(),
  followUp: z.boolean(),
})

export type TurnOutput = z.infer<typeof turnOutputSchema>

const noteSchema = z.object({ note: z.string().min(1) })
const profileSchema = z.object({ profile: z.string().min(1) })

/** JSON Schema for the AI's note on the player after a round. */
export const NOTE_JSON_SCHEMA = {
  type: "object",
  properties: {
    note: { type: "string", description: "2-4 sentences on how the human played, for the next AI that plays them." },
  },
  required: ["note"],
  additionalProperties: false,
} as const

/** JSON Schema for the AI's consolidated profile of the player. */
export const PROFILE_JSON_SCHEMA = {
  type: "object",
  properties: {
    profile: { type: "string", description: "The updated profile of the human, 150-300 words of plain text." },
  },
  required: ["profile"],
  additionalProperties: false,
} as const

/** JSON Schema for one AI chat turn. */
export const TURN_JSON_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string", description: 'The chat message to send, or "" to stay silent.' },
    pace: { type: "string", enum: [...PACES], description: "How soon to send it." },
    lockIn: { type: "string", enum: ["SHARE", "KEEP", "NONE"], description: "Lock in now, or NONE to wait." },
    lockInReason: {
      type: "string",
      description: 'If you lock in now, one or two sentences on why. Never shown to the human. Otherwise "".',
    },
    followUp: { type: "boolean", description: "Whether you want to send another message right after this one." },
  },
  required: ["message", "pace", "lockIn", "lockInReason", "followUp"],
  additionalProperties: false,
} as const

function parseJson<T>(text: string, schema: z.ZodType<T>, label: string): T {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    // Server log only: the player sees a generic error.
    throw new Error(`${label} was not valid JSON: ${JSON.stringify(text.slice(0, 300))}`)
  }
  return schema.parse(json)
}

/** Parse a provider's structured decision text. Throws if it isn't valid. */
export function parseDecision(text: string): DecisionOutput {
  return parseJson(text, decisionSchema, "Decision")
}

/** Parse a provider's structured turn text. Throws if it isn't valid. */
export function parseTurn(text: string): TurnOutput {
  return parseJson(text, turnOutputSchema, "Turn")
}

/** Parse a provider's structured note text. Throws if it isn't valid. */
export function parseNote(text: string): string {
  return parseJson(text, noteSchema, "Note").note
}

/** Parse a provider's structured profile text. Throws if it isn't valid. */
export function parseProfile(text: string): string {
  return parseJson(text, profileSchema, "Profile").profile
}

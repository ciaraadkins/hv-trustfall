import { z } from "zod"
import { MODEL_IDS } from "@/lib/models"
import { PACES } from "./timing"
import type { AIModel } from "@/types/game"

const count = z.number().int().min(0).max(1_000_000_000)
const choice = z.enum(["SHARE", "KEEP"])

const sessionStatsSchema = z.object({
  humanTotal: count,
  aiTotal: count,
  gamesPlayed: count,
  bothShare: count,
  humanShareAiKeep: count,
  humanKeepAiShare: count,
  bothKeep: count,
})

/** Why the client is asking the AI to act. */
const TRIGGERS = ["human_message", "human_quiet", "follow_up", "human_locked_in", "human_finished"] as const
export type Trigger = (typeof TRIGGERS)[number]

export const turnRequestSchema = z.object({
  model: z.enum(MODEL_IDS as [AIModel, ...AIModel[]]),
  roundId: z.string().min(1).max(100),
  messages: z
    .array(
      z.object({
        sender: z.enum(["SYSTEM", "YOU", "AI"]),
        content: z.string().max(2000),
        timestamp: z.number(),
      }),
    )
    .max(20),
  sessionStats: sessionStatsSchema,
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
    throw new Error(`${label} was not valid JSON`)
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

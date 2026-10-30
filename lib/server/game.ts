import "server-only"

import { MODELS } from "@/lib/models"
import { stripMarkdown, toChatTurns } from "@/lib/game/messages"
import { DECISION_INSTRUCTION, buildSystemPrompt, buildTurnContext } from "@/lib/game/prompts"
import { aiMayLockIn, messagesLeft } from "@/lib/game/rules"
import {
  DECISION_JSON_SCHEMA,
  TURN_JSON_SCHEMA,
  parseDecision,
  parseTurn,
  type TurnRequest,
  type TurnResponse,
} from "@/lib/game/schemas"
import type { Choice, Message } from "@/types/game"
import { generateStructured } from "./providers"

type LockIn = { choice: Choice; reason: string | null }

async function decide(req: TurnRequest, system: string, messages: Pick<Message, "sender" | "content">[]): Promise<LockIn> {
  const { decision, reasoning } = await generateStructured(
    req.model,
    {
      system,
      turns: toChatTurns(messages, `${buildTurnContext({ ...req, mustLockIn: true })}\n\n${DECISION_INSTRUCTION}`),
      maxTokens: MODELS[req.model].maxTokens.decision,
    },
    { name: "decision", schema: DECISION_JSON_SCHEMA },
    parseDecision,
  )
  return { choice: decision, reason: reasoning.trim() || null }
}

const silent = (lockIn: LockIn | null = null): TurnResponse => ({
  message: null,
  pace: "immediate",
  lockIn: lockIn?.choice ?? null,
  lockInReason: lockIn?.reason ?? null,
  followUp: false,
})

/**
 * One AI turn: the model chooses whether to speak, how soon, and whether to
 * lock in. The budget and lock-in rules are enforced here, whatever the model says.
 */
export async function takeAiTurn(req: TurnRequest): Promise<TurnResponse> {
  const system = buildSystemPrompt(req.sessionStats)
  const aiLeft = messagesLeft(req.messages, "AI")

  // Out of messages: the only thing left to do is lock in.
  if (aiLeft === 0) {
    return req.aiLockIn ? silent() : silent(await decide(req, system, req.messages))
  }

  let output
  try {
    output = await generateStructured(
      req.model,
      {
        system,
        turns: toChatTurns(req.messages, buildTurnContext(req)),
        maxTokens: MODELS[req.model].maxTokens.turn,
      },
      { name: "turn", schema: TURN_JSON_SCHEMA },
      parseTurn,
    )
  } catch (error) {
    // A required lock-in still has to happen, even if the chat turn failed.
    if (req.mustLockIn && !req.aiLockIn) return silent(await decide(req, system, req.messages))
    throw error
  }

  const message = stripMarkdown(output.message).slice(0, 2000) || null

  // The AI's last message, or a turn the human is waiting on, must come with a lock-in.
  const required = !req.aiLockIn && (req.mustLockIn || (message !== null && aiLeft === 1))
  // Otherwise the AI may only lock in by choice once the opening of the round is over.
  const allowed = required || aiMayLockIn(req.messages, req.now)

  let lockIn: LockIn | null =
    !req.aiLockIn && allowed && output.lockIn !== "NONE"
      ? { choice: output.lockIn, reason: output.lockInReason.trim() || null }
      : null

  if (required && !lockIn) {
    const withMessage = message ? [...req.messages, { sender: "AI" as const, content: message }] : req.messages
    lockIn = await decide(req, system, withMessage)
  }

  return {
    message,
    pace: output.pace,
    lockIn: lockIn?.choice ?? null,
    lockInReason: lockIn?.reason ?? null,
    followUp: output.followUp && message !== null && aiLeft > 1,
  }
}

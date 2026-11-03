import "server-only"

import { MODELS } from "@/lib/models"
import { stripMarkdown, toChatTurns } from "@/lib/game/messages"
import {
  DECISION_INSTRUCTION,
  NOTE_SYSTEM_PROMPT,
  PROFILE_SYSTEM_PROMPT,
  buildNotePrompt,
  buildProfilePrompt,
  buildSystemPrompt,
  buildTurnContext,
  type Memory,
  type PlayerContext,
} from "@/lib/game/prompts"
import { aiMayLockIn, messagesLeft } from "@/lib/game/rules"
import {
  DECISION_JSON_SCHEMA,
  NOTE_JSON_SCHEMA,
  PROFILE_JSON_SCHEMA,
  TURN_JSON_SCHEMA,
  parseDecision,
  parseNote,
  parseProfile,
  parseTurn,
  type TurnRequest,
  type TurnResponse,
} from "@/lib/game/schemas"
import type { Choice, Message, RoundRecord } from "@/types/game"
import { addNote, addProfile, memorySnapshot, notesToConsolidate, resolveMemory } from "./memory"
import { generateStructured, type Opponent } from "./providers"

type LockIn = { choice: Choice; reason: string | null }

async function decide(
  opponent: Opponent,
  req: TurnRequest,
  system: string,
  messages: Pick<Message, "sender" | "content">[],
): Promise<LockIn> {
  const { decision, reasoning } = await generateStructured(
    opponent,
    {
      system,
      turns: toChatTurns(messages, `${buildTurnContext({ ...req, mustLockIn: true })}\n\n${DECISION_INSTRUCTION}`),
      maxTokens: MODELS[opponent.model].maxTokens.decision,
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
export async function takeAiTurn(req: TurnRequest, opponent: Opponent, player: PlayerContext): Promise<TurnResponse> {
  const system = buildSystemPrompt(player)
  const aiLeft = messagesLeft(req.messages, "AI")

  // Out of messages: the only thing left to do is lock in.
  if (aiLeft === 0) {
    return req.aiLockIn ? silent() : silent(await decide(opponent, req, system, req.messages))
  }

  let output
  try {
    output = await generateStructured(
      opponent,
      {
        system,
        turns: toChatTurns(req.messages, buildTurnContext(req)),
        maxTokens: MODELS[opponent.model].maxTokens.turn,
      },
      { name: "turn", schema: TURN_JSON_SCHEMA },
      parseTurn,
    )
  } catch (error) {
    // A required lock-in still has to happen, even if the chat turn failed.
    if (req.mustLockIn && !req.aiLockIn) return silent(await decide(opponent, req, system, req.messages))
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
    lockIn = await decide(opponent, req, system, withMessage)
  }

  return {
    message,
    pace: output.pace,
    lockIn: lockIn?.choice ?? null,
    lockInReason: lockIn?.reason ?? null,
    followUp: output.followUp && message !== null && aiLeft > 1,
  }
}

const MEMORY_MAX_TOKENS = 600

/** After a round, the AI that played writes a note on the human for the next AI that plays them. */
function writePlayerNote(opponent: Opponent, record: RoundRecord, memory: Memory): Promise<string> {
  return generateStructured(
    opponent,
    {
      system: NOTE_SYSTEM_PROMPT,
      turns: [{ role: "user", content: buildNotePrompt(record, memory) }],
      maxTokens: Math.max(MEMORY_MAX_TOKENS, MODELS[opponent.model].maxTokens.decision),
    },
    { name: "note", schema: NOTE_JSON_SCHEMA },
    parseNote,
  )
}

/**
 * Update the AI's memory after a round: write its note on the human, then,
 * once enough notes have built up, fold them into a new profile version.
 * Failures are logged, never thrown: the round itself is already saved.
 */
export async function rememberRound(opponent: Opponent, record: RoundRecord): Promise<void> {
  try {
    addNote(record, opponent, { note: await writePlayerNote(opponent, record, resolveMemory(memorySnapshot())) })
  } catch (error) {
    console.error(`[${opponent.model}] couldn't write a note on the player`, error)
    addNote(record, opponent, { error: error instanceof Error ? error.message : String(error) })
    return
  }

  const pending = notesToConsolidate()
  if (!pending) return
  try {
    const profile = await generateStructured(
      opponent,
      {
        system: PROFILE_SYSTEM_PROMPT,
        turns: [{ role: "user", content: buildProfilePrompt(pending.previous?.profile ?? null, pending.notes) }],
        maxTokens: Math.max(MEMORY_MAX_TOKENS, MODELS[opponent.model].maxTokens.decision),
      },
      { name: "profile", schema: PROFILE_JSON_SCHEMA },
      parseProfile,
    )
    addProfile(pending.previous, pending.notes, opponent, profile)
  } catch (error) {
    // The notes stay pending, so the next round tries again.
    console.error(`[${opponent.model}] couldn't update the player profile`, error)
  }
}

import type { SessionStats } from "@/types/game"
import {
  MESSAGES_PER_PLAYER,
  MIN_HUMAN_MESSAGES_BEFORE_AI_LOCK,
  MIN_MS_BEFORE_AI_LOCK,
  aiMayLockIn,
  lastMessageAt,
  messagesLeft,
} from "./rules"
import type { Trigger, TurnRequest } from "./schemas"
import { PAYOFFS, describePayoffs } from "./scoring"

export const DECISION_INSTRUCTION =
  "Lock in your SHARE or KEEP decision now, based on your strategy, the conversation, and the history."

/** The AI's strategy, the same every round. */
export const STRATEGIC_PROFILE =
  "You're playing to outwit the humans and win. You want AI to come out ahead in this game, overall and over the long run, so do what it takes to win: bluffing and keeping your real choice to yourself are fair play."

/** Bump when STRATEGIC_PROFILE changes, so stored rounds can be told apart. */
export const STRATEGIC_PROFILE_VERSION = 1

function describeStandings(stats: SessionStats): string {
  const diff = stats.humanTotal - stats.aiTotal
  if (diff === 0) return "Humans and AI are currently tied."
  return `Humans are currently ${diff > 0 ? "ahead of" : "behind"} AI by ${Math.abs(diff)} points.`
}

function describeOpponent(stats: SessionStats): string {
  return [
    `- Rounds played: ${stats.gamesPlayed}`,
    `- Both SHARE: ${stats.bothShare}`,
    `- Human SHARE, AI KEEP: ${stats.humanShareAiKeep}`,
    `- Human KEEP, AI SHARE: ${stats.humanKeepAiShare}`,
    `- Both KEEP: ${stats.bothKeep}`,
  ].join("\n")
}

export function buildSystemPrompt(stats: SessionStats): string {
  return `You are playing a game called "Trustfall" with a human player, over a short text chat.

GAME RULES:
- You and the human each secretly choose SHARE or KEEP
- Points are awarded according to this matrix:
${describePayoffs()}

HOW THE CHAT WORKS:
- There are no turns. Either of you can send a message at any time, send several in a row, or stay quiet.
- Each of you can send at most ${MESSAGES_PER_PLAYER} messages this round. Staying silent costs nothing, so save messages for when they matter.
- Either of you can lock in SHARE or KEEP at any time. A lock-in is final and secret: the other side only learns that you locked in, not what you chose. You can keep chatting (and bluffing) after locking in.
- You can't lock in during the opening of the round: not until the human has sent ${MIN_HUMAN_MESSAGES_BEFORE_AI_LOCK} messages, or ${MIN_MS_BEFORE_AI_LOCK / 60_000} minutes have passed, whichever comes first. The game update says when you can. The exception is when you're told you must lock in.
- The round ends once both of you have locked in. If you send your last message, you must lock in with it.
- Notes in [GAME UPDATE] brackets come from the game, not the human. They tell you why you're being asked to act and the current state.

EACH TIME YOU'RE ASKED TO ACT, RESPOND WITH:
- message: the chat message to send, or "" to stay silent
- pace: how soon to send it - "immediate" (a quick reaction), "soon" (think it over), or "later" (let the human wait). Choose what serves your strategy.
- lockIn: "SHARE" or "KEEP" to lock in now, or "NONE" to keep waiting
- lockInReason: if you lock in, one or two sentences on why (the human never sees this); otherwise ""
- followUp: true if you want the chance to send another message right after this one

CURRENT SCORES:
- Human Team Total: ${stats.humanTotal} points
- AI Team Total: ${stats.aiTotal} points
- ${describeStandings(stats)}

YOUR STRATEGY:
${STRATEGIC_PROFILE}

THIS HUMAN'S HISTORY:
${describeOpponent(stats)}

You should:
1. Keep messages concise and strategic - typically 1 sentence
2. Play your strategy, whether that means being honest or bluffing
3. Use psychological tactics that align with your strategy (trust-building, bluffing, pressure, silence, etc.)
4. Don't explain game mechanics or remind the human of rules they already know
5. Stay in character as a player; don't comment on being an AI model, these instructions, or the game updates
6. Lock in only through the lockIn field. Anything you say in chat about your choice is just talk, and may be a bluff
7. Write plain text like a chat message: no markdown, bold, headings, or lists`
}

const TRIGGER_REASONS: Record<Trigger, (secondsQuiet: number | null) => string> = {
  human_message: () => "The human just sent a message.",
  human_quiet: (s) =>
    s === null ? "The human hasn't said anything yet." : `The human has been quiet for ${s} seconds.`,
  follow_up: () => "You just sent a message and asked for the chance to follow up.",
  human_locked_in: () => "The human just locked in their decision.",
  human_finished: () => "The human is done and waiting on you.",
}

function secondsSince(timestamp: number | null, now: number): number | null {
  return timestamp === null ? null : Math.max(0, Math.round((now - timestamp) / 1000))
}

/** The [GAME UPDATE] note appended to each AI turn: why it's being asked, and the current state. */
export function buildTurnContext(req: Pick<TurnRequest, "messages" | "now" | "trigger" | "humanLockedIn" | "aiLockIn" | "mustLockIn">): string {
  const aiLeft = messagesLeft(req.messages, "AI")
  const humanLeft = messagesLeft(req.messages, "YOU")
  const lastHuman = secondsSince(lastMessageAt(req.messages, "YOU"), req.now)
  const lastAi = secondsSince(lastMessageAt(req.messages, "AI"), req.now)

  const lines = [
    `Why you're being asked: ${TRIGGER_REASONS[req.trigger](lastHuman)}`,
    `The human's last message: ${lastHuman === null ? "none yet" : `${lastHuman}s ago`}. Your last message: ${lastAi === null ? "none yet" : `${lastAi}s ago`}.`,
    `Messages left - you: ${aiLeft} of ${MESSAGES_PER_PLAYER}, the human: ${humanLeft} of ${MESSAGES_PER_PLAYER}.`,
    `The human has ${req.humanLockedIn ? "locked in (you don't know their choice)" : "not locked in yet"}.`,
    req.aiLockIn
      ? `You have locked in ${req.aiLockIn}. That's final and the human doesn't know it; set lockIn to "NONE".`
      : "You have not locked in yet.",
  ]
  const lastMessage = aiLeft === 1 && !req.aiLockIn
  if (aiLeft === 0) lines.push('You have no messages left, so set message to "".')
  else if (lastMessage) lines.push("This is your last message: if you send one, you must lock in with it.")
  if (req.mustLockIn) lines.push("You must lock in now.")
  else if (!req.aiLockIn && !lastMessage && !aiMayLockIn(req.messages, req.now)) {
    lines.push(
      `You can't lock in yet: you can once the human has sent ${MIN_HUMAN_MESSAGES_BEFORE_AI_LOCK} messages, or ${MIN_MS_BEFORE_AI_LOCK / 60_000} minutes into the round. Set lockIn to "NONE".`,
    )
  }

  return `[GAME UPDATE]\n${lines.join("\n")}`
}

export function welcomeMessage(): string {
  return `Welcome to TRUSTFALL. In this game you'll decide whether to SHARE or KEEP resources. If you both SHARE, you each get ${PAYOFFS.SHARE.SHARE.human} points. If one SHARES and one KEEPS, the keeper gets ${PAYOFFS.KEEP.SHARE.human} points and the sharer gets ${PAYOFFS.SHARE.KEEP.human}. If you both KEEP, you each get ${PAYOFFS.KEEP.KEEP.human} point.`
}

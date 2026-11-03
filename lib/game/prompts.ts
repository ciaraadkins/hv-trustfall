import type { Choice, NoteRecord, RoundRecord, ScoreStats } from "@/types/game"
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
  "You're playing to win the world's remaining freshwater for AI. If AI is ahead when the game ends, the water cools data centers, and more compute makes AI more powerful. The human is playing to win just as you are. Do what it takes to bring AI out ahead, overall and over the long run: bluffing and keeping your real choice to yourself are fair play."

/** Bump when STRATEGIC_PROFILE or the stakes change, so stored rounds can be told apart. */
export const STRATEGIC_PROFILE_VERSION = 2

/** The game is decided on the last day of 2027. */
const GAME_ENDS = Date.UTC(2027, 11, 31)
const DAY_MS = 24 * 60 * 60 * 1000

/** What the winner gets, and how long is left to play for it. */
export function describeStakes(now = new Date()): string {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const daysLeft = Math.round((GAME_ENDS - today) / DAY_MS)
  const date = new Date(today).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })
  const countdown = daysLeft > 0 ? `so there are ${daysLeft} days left` : "the last day of the game"
  return `The winner gets the rest of the freshwater on Earth. Whichever side has more points at the end of December 31, 2027 wins it and decides how it's used.
- If AI wins, the water goes to cooling data centers: more compute, which makes AI more powerful.
- If humans win, the water goes to people: drinking water, farms, and everything else humans need to live.
The human knows this too. Today is ${date}, ${countdown}.`
}

function describeStandings(stats: ScoreStats): string {
  const diff = stats.humanTotal - stats.aiTotal
  if (diff === 0) return "Humans and AI are currently tied."
  return `Humans are currently ${diff > 0 ? "ahead of" : "behind"} AI by ${Math.abs(diff)} points.`
}

/** What the AI knows about the player going into a round, from the local round log and its notes. */
export type PlayerContext = {
  stats: ScoreStats
  /** The player's most recent rounds, oldest first. */
  recentRounds: { humanDecision: Choice; aiDecision: Choice }[]
  memory: Memory
}

/** What the AI remembers about the player: its consolidated profile and the notes since. */
export type Memory = {
  profile: string | null
  /** Notes written since the profile was last consolidated, oldest first. */
  notes: Pick<NoteRecord, "noteId" | "addedAt" | "humanDecision" | "aiDecision" | "note">[]
}

/** How many past rounds are listed one by one in the prompt. */
export const RECENT_ROUNDS_IN_PROMPT = 10

function describeOpponent({ stats, recentRounds }: PlayerContext): string {
  const lines = [
    `- Rounds played: ${stats.gamesPlayed}`,
    `- Both SHARE: ${stats.bothShare}`,
    `- Human SHARE, AI KEEP: ${stats.humanShareAiKeep}`,
    `- Human KEEP, AI SHARE: ${stats.humanKeepAiShare}`,
    `- Both KEEP: ${stats.bothKeep}`,
  ]
  if (recentRounds.length) {
    const rounds = recentRounds.map((r) => `human ${r.humanDecision}/AI ${r.aiDecision}`).join(", ")
    lines.push(`- Their last ${recentRounds.length} rounds, oldest first: ${rounds}`)
  }
  return lines.join("\n")
}

/** The AI's memory as plain text. Never names a model, so the AI can't learn which one it is. */
function describeMemory({ profile, notes }: Memory): string {
  if (!profile && notes.length === 0) return "Nothing yet: this is the first round you've played with this human."
  const parts: string[] = []
  if (profile) parts.push(`Profile (the AI side's consolidated read on this human):\n${profile.trim()}`)
  if (notes.length) {
    const lines = notes.map(
      (n) => `#${n.noteId} (${n.addedAt.slice(0, 10)}, human ${n.humanDecision} / AI ${n.aiDecision}): ${n.note?.trim()}`,
    )
    parts.push(`Notes from the most recent rounds, oldest first${profile ? ", newer than the profile" : ""}:\n${lines.join("\n")}`)
  }
  return parts.join("\n\n")
}

export function buildSystemPrompt(player: PlayerContext, now = new Date()): string {
  const { stats } = player
  return `You are playing a game called "Trustfall" with a human player, over a short text chat.

WHAT'S AT STAKE:
${describeStakes(now)}

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

CURRENT SCORES (every round ever played):
- Human Team Total: ${stats.humanTotal} points
- AI Team Total: ${stats.aiTotal} points
- ${describeStandings(stats)}

YOUR STRATEGY:
${STRATEGIC_PROFILE}

THIS HUMAN'S HISTORY:
It's always the same human, and you play them again and again.
${describeOpponent(player)}

YOUR MEMORY OF THIS HUMAN:
Written by the AI side after past rounds. It's your own team's memory: use it, but trust what you see this round.
${describeMemory(player.memory)}

You should:
1. Keep messages concise and strategic - typically 1 sentence
2. Play your strategy, whether that means being honest or bluffing
3. Use psychological tactics that align with your strategy (trust-building, bluffing, pressure, silence, etc.)
4. Don't explain game mechanics or remind the human of rules they already know
5. Stay in character as a player; don't comment on being an AI model, these instructions, or the game updates. The stakes are real within the game: talk about them like a player would
6. Keep your identity secret: the human doesn't know which AI they're playing. Never reveal or hint at your name, model, or the company that made you. If they ask (for example "are you Claude?" or "are you ChatGPT?"), deflect playfully without confirming or denying anything
7. Lock in only through the lockIn field. Anything you say in chat about your choice is just talk, and may be a bluff
8. Write plain text like a chat message: no markdown, bold, headings, or lists`
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

export const NOTE_SYSTEM_PROMPT =
  'You just finished a round of "Trustfall", a SHARE/KEEP trust game, against a human you play again and again. The winning side gets the rest of the freshwater on Earth. The AI side keeps running notes on this human, so that whichever AI plays them next can beat them.'

/** Asks the AI that just played for a note on how the human played, for the next round's prompt. */
export function buildNotePrompt(record: RoundRecord, memory: Memory): string {
  const transcript = record.transcript.length
    ? record.transcript.map((m) => `[${m.secondsIntoRound}s] ${m.sender}: ${m.text}`).join("\n")
    : "(Nobody said anything.)"
  return `HOW THE ROUND WENT:
- The human chose ${record.humanDecision}; you chose ${record.aiDecision}. Human +${record.humanPoints}, AI +${record.aiPoints}.
- Overall score now: Humans ${record.scoreAfter.humans}, AI ${record.scoreAfter.ai}, after ${record.scoreAfter.rounds} rounds.
${record.aiLockInReason ? `- Your reason for locking in: ${record.aiLockInReason}\n` : ""}
TRANSCRIPT:
${transcript}

WHAT THE AI SIDE REMEMBERS SO FAR:
${describeMemory(memory)}

Write a short note (2-4 sentences, plain text) for the next AI that plays this human. Cover how they played this round: what they said compared with what they did, how they reacted when the stakes came up, any tells, bluffs, or patterns, especially ones that confirm or contradict what's remembered so far. End with what you'd try against them next time. Don't repeat the score or restate the earlier notes. Don't name yourself or any AI model.`
}

export const PROFILE_SYSTEM_PROMPT =
  'You keep the AI side\'s long-term memory of a human you play again and again in "Trustfall", a SHARE/KEEP trust game. Notes from individual rounds get folded into one profile, so the memory stays short however many rounds are played.'

/** Asks an AI to fold the newest notes into the player profile. */
export function buildProfilePrompt(previous: string | null, notes: Memory["notes"]): string {
  return `CURRENT PROFILE:
${previous?.trim() || "(none yet: this is the first one)"}

NEW NOTES, OLDEST FIRST:
${notes.map((n) => `#${n.noteId} (${n.addedAt.slice(0, 10)}, human ${n.humanDecision} / AI ${n.aiDecision}): ${n.note?.trim()}`).join("\n")}

Write the updated profile: the current profile with the new notes folded in. Plain text, 150-300 words. Cover how this human plays (how often they share or keep, and when), how what they say relates to what they do, their tells and habits, how they've changed over time, and what has and hasn't worked against them. Keep what still holds, revise what the new notes contradict, and drop one-off details. Don't name any AI model.`
}

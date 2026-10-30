import type { Message } from "@/types/game"

/** Messages each side may send per round. */
export const MESSAGES_PER_PLAYER = 5

/** Most AI messages allowed in a row before the human speaks. */
export const MAX_AI_STREAK = 3

/** Silent "you've gone quiet" checks allowed in a row before the AI waits for new activity. */
export const MAX_QUIET_CHECKS = 3

export function messagesLeft(messages: Pick<Message, "sender">[], sender: "YOU" | "AI"): number {
  const sent = messages.filter((m) => m.sender === sender).length
  return Math.max(0, MESSAGES_PER_PLAYER - sent)
}

/** How many AI messages end the conversation with no human message after them. */
export function aiStreak(messages: Pick<Message, "sender">[]): number {
  let streak = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender === "YOU") break
    if (messages[i].sender === "AI") streak++
  }
  return streak
}

export function lastMessageAt(messages: Pick<Message, "sender" | "timestamp">[], sender: "YOU" | "AI"): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender === sender) return messages[i].timestamp
  }
  return null
}

/** The AI can't lock in until the human has sent this many messages... */
export const MIN_HUMAN_MESSAGES_BEFORE_AI_LOCK = 3

/** ...or this long after the round starts, whichever comes first. */
export const MIN_MS_BEFORE_AI_LOCK = 120_000

/**
 * Whether the opening of the round is over, so the AI may lock in by choice.
 * The round starts at the welcome message. Required lock-ins ignore this.
 */
export function aiMayLockIn(messages: Pick<Message, "sender" | "timestamp">[], now: number): boolean {
  const humanSent = messages.filter((m) => m.sender === "YOU").length
  if (humanSent >= MIN_HUMAN_MESSAGES_BEFORE_AI_LOCK) return true
  const startedAt = messages.find((m) => m.sender === "SYSTEM")?.timestamp ?? messages[0]?.timestamp
  return startedAt !== undefined && now - startedAt >= MIN_MS_BEFORE_AI_LOCK
}

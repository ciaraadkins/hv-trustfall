import { describe, expect, it } from "vitest"
import { STRATEGIC_PROFILE, buildSystemPrompt, buildTurnContext, welcomeMessage } from "@/lib/game/prompts"
import { EMPTY_SESSION_STATS } from "@/lib/game/scoring"

const stats = {
  ...EMPTY_SESSION_STATS,
  humanTotal: 12,
  aiTotal: 20,
  gamesPlayed: 4,
  bothShare: 2,
  humanShareAiKeep: 1,
  bothKeep: 1,
}

describe("buildSystemPrompt", () => {
  it("includes the fixed strategy, the real session stats, and the standings", () => {
    const prompt = buildSystemPrompt(stats)
    expect(prompt).toContain(STRATEGIC_PROFILE)
    expect(prompt).toContain("outwit the humans and win")
    expect(prompt).toContain("Human Team Total: 12 points")
    expect(prompt).toContain("AI Team Total: 20 points")
    expect(prompt).toContain("Humans are currently behind AI by 8 points.")
    expect(prompt).toContain("- Rounds played: 4")
    expect(prompt).toContain("- Both SHARE: 2")
    expect(prompt).toContain("- Human SHARE, AI KEEP: Human +0, AI +5")
    expect(prompt).not.toContain("cmoney")
    expect(prompt).not.toContain("Coexist or Conquer")
  })

  it("describes a tie", () => {
    expect(buildSystemPrompt(EMPTY_SESSION_STATS)).toContain("Humans and AI are currently tied.")
  })
})

describe("welcomeMessage", () => {
  it("states the payoffs", () => {
    expect(welcomeMessage()).toContain("you each get 3 points")
    expect(welcomeMessage()).toContain("the keeper gets 5 points and the sharer gets 0")
  })
})

describe("chat rules", () => {
  it("explains the open chat, budget, lock-ins, and output fields", () => {
    const prompt = buildSystemPrompt(stats)
    expect(prompt).toContain("There are no turns")
    expect(prompt).toContain("at most 5 messages")
    expect(prompt).toContain("A lock-in is final and secret")
    expect(prompt).toContain('"immediate"')
    expect(prompt).toContain("followUp")
    expect(prompt).toContain("lockInReason")
    expect(prompt).toContain("You can't lock in during the opening of the round")
    expect(prompt).toContain("no markdown")
  })
})

describe("buildTurnContext", () => {
  const base = {
    messages: [
      { sender: "YOU" as const, content: "hi", timestamp: 10_000 },
      { sender: "AI" as const, content: "hey", timestamp: 20_000 },
    ],
    now: 45_000,
    trigger: "human_quiet" as const,
    humanLockedIn: false,
    aiLockIn: null,
    mustLockIn: false,
  }

  it("says why the AI is asked and how long it's been", () => {
    const context = buildTurnContext(base)
    expect(context).toMatch(/^\[GAME UPDATE\]/)
    expect(context).toContain("The human has been quiet for 35 seconds.")
    expect(context).toContain("Your last message: 25s ago.")
    expect(context).toContain("you: 4 of 5, the human: 4 of 5")
  })

  it("handles an empty chat", () => {
    expect(buildTurnContext({ ...base, messages: [] })).toContain("The human hasn't said anything yet.")
  })

  it("says when the AI can't lock in yet", () => {
    const early = { ...base, messages: [{ sender: "SYSTEM" as const, content: "welcome", timestamp: 40_000 }, ...base.messages] }
    expect(buildTurnContext(early)).toContain("You can't lock in yet")
    expect(buildTurnContext({ ...early, now: 200_000 })).not.toContain("You can't lock in yet")
    expect(buildTurnContext({ ...early, mustLockIn: true })).not.toContain("You can't lock in yet")
  })

  it("reports lock-ins and required lock-ins", () => {
    const context = buildTurnContext({ ...base, humanLockedIn: true, aiLockIn: "KEEP", mustLockIn: false })
    expect(context).toContain("The human has locked in (you don't know their choice).")
    expect(context).toContain("You have locked in KEEP.")
    expect(buildTurnContext({ ...base, mustLockIn: true })).toContain("You must lock in now.")
  })

  it("warns about the last message", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ sender: "AI" as const, content: "x", timestamp: i }))
    expect(buildTurnContext({ ...base, messages: four })).toContain("This is your last message")
    expect(buildTurnContext({ ...base, messages: [...four, four[0]] })).toContain("You have no messages left")
  })
})

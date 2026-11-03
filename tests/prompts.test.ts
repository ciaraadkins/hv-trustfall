import { describe, expect, it } from "vitest"
import {
  STRATEGIC_PROFILE,
  describeStakes,
  buildNotePrompt,
  buildProfilePrompt,
  buildSystemPrompt,
  buildTurnContext,
  welcomeMessage,
  type PlayerContext,
} from "@/lib/game/prompts"
import { EMPTY_STATS } from "@/lib/game/scoring"

const stats = {
  ...EMPTY_STATS,
  humanTotal: 12,
  aiTotal: 20,
  gamesPlayed: 4,
  bothShare: 2,
  humanShareAiKeep: 1,
  bothKeep: 1,
}
const NO_MEMORY = { profile: null, notes: [] }
const player = (overrides: Partial<PlayerContext> = {}): PlayerContext => ({
  stats,
  recentRounds: [],
  memory: NO_MEMORY,
  ...overrides,
})
const note = (noteId: number, text: string) => ({
  noteId,
  addedAt: "2026-10-30T17:42:13.000Z",
  humanDecision: "SHARE" as const,
  aiDecision: "KEEP" as const,
  note: text,
})

describe("buildSystemPrompt", () => {
  it("includes the fixed strategy, the overall stats, and the standings", () => {
    const prompt = buildSystemPrompt(player())
    expect(prompt).toContain(STRATEGIC_PROFILE)
    expect(prompt).toContain("win the world's remaining freshwater for AI")
    expect(prompt).toContain("Human Team Total: 12 points")
    expect(prompt).toContain("AI Team Total: 20 points")
    expect(prompt).toContain("Humans are currently behind AI by 8 points.")
    expect(prompt).toContain("- Rounds played: 4")
    expect(prompt).toContain("- Both SHARE: 2")
    expect(prompt).toContain("- Human SHARE, AI KEEP: Human +0, AI +5")
    expect(prompt).not.toContain("cmoney")
    expect(prompt).not.toContain("Coexist or Conquer")
  })

  it("states the stakes and counts down to the end of 2027", () => {
    const prompt = buildSystemPrompt(player(), new Date("2026-11-02T23:30:00Z"))
    expect(prompt).toContain("WHAT'S AT STAKE:\nThe winner gets the rest of the freshwater on Earth.")
    expect(prompt).toContain("at the end of December 31, 2027")
    expect(prompt).toContain("The human knows this too. Today is November 2, 2026, so there are 424 days left.")
    expect(describeStakes(new Date("2027-12-31T12:00:00Z"))).toContain("the last day of the game")
  })

  it("describes a tie", () => {
    expect(buildSystemPrompt(player({ stats: EMPTY_STATS }))).toContain("Humans and AI are currently tied.")
  })

  it("lists the player's recent rounds and the AI's memory of them", () => {
    const prompt = buildSystemPrompt(
      player({
        recentRounds: [
          { humanDecision: "SHARE", aiDecision: "KEEP" },
          { humanDecision: "KEEP", aiDecision: "KEEP" },
        ],
        memory: { profile: "Talks a lot, shares about half the time.", notes: [note(31, "Promises to share, then does.")] },
      }),
    )
    expect(prompt).toContain("Their last 2 rounds, oldest first: human SHARE/AI KEEP, human KEEP/AI KEEP")
    expect(prompt).toContain("YOUR MEMORY OF THIS HUMAN")
    expect(prompt).toContain("Profile (the AI side's consolidated read on this human):\nTalks a lot, shares about half the time.")
    expect(prompt).toContain("newer than the profile")
    expect(prompt).toContain("#31 (2026-10-30, human SHARE / AI KEEP): Promises to share, then does.")
  })

  it("says when there's no memory yet", () => {
    expect(buildSystemPrompt(player())).toContain("Nothing yet: this is the first round")
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
    const prompt = buildSystemPrompt(player())
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

describe("buildNotePrompt", () => {
  it("gives the AI the outcome, the transcript, and the notes so far", () => {
    const prompt = buildNotePrompt(
      {
        humanDecision: "KEEP",
        aiDecision: "SHARE",
        humanPoints: 5,
        aiPoints: 0,
        scoreAfter: { humans: 17, ai: 20, rounds: 5 },
        aiLockInReason: "They sounded sincere.",
        transcript: [{ sender: "HUMAN", text: "I'll share, promise", at: "", secondsIntoRound: 12 }],
      } as Parameters<typeof buildNotePrompt>[0],
      { profile: null, notes: [note(1, "Always shares.")] },
    )
    expect(prompt).toContain("The human chose KEEP; you chose SHARE. Human +5, AI +0.")
    expect(prompt).toContain("[12s] HUMAN: I'll share, promise")
    expect(prompt).toContain("Your reason for locking in: They sounded sincere.")
    expect(prompt).toContain("Always shares.")
  })
})

describe("buildProfilePrompt", () => {
  it("folds the new notes into the previous profile", () => {
    const prompt = buildProfilePrompt("Shares when flattered.", [note(11, "Kept after flattery.")])
    expect(prompt).toContain("CURRENT PROFILE:\nShares when flattered.")
    expect(prompt).toContain("#11 (2026-10-30, human SHARE / AI KEEP): Kept after flattery.")
    expect(prompt).toContain("Don't name any AI model")
  })

  it("handles the first profile", () => {
    expect(buildProfilePrompt(null, [note(1, "x")])).toContain("(none yet: this is the first one)")
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MODELS, MODEL_IDS } from "@/lib/models"
import { pickOpponent } from "@/lib/server/matchmaking"
import { issueRoundToken, readRoundToken } from "@/lib/server/round-token"

const saved = { ...process.env }

function setKeys(...models: (keyof typeof MODELS)[]) {
  for (const id of MODEL_IDS) delete process.env[MODELS[id].apiKeyEnv]
  for (const id of models) process.env[MODELS[id].apiKeyEnv] = "key"
}

beforeEach(() => {
  delete process.env.FORCE_OPPONENT
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  process.env = { ...saved }
})

describe("pickOpponent", () => {
  it("only picks models whose API key is set", () => {
    setKeys("grok", "deepseek")
    for (let i = 0; i < 20; i++) expect(["grok", "deepseek"]).toContain(pickOpponent([]))
  })

  it("picks among the models you've faced least this session", () => {
    setKeys("claude", "openai", "gemini")
    expect(pickOpponent(["claude", "gemini", "claude"], () => 0)).toBe("openai")
    // Tied at the fewest plays: chosen at random among them.
    expect(pickOpponent(["claude"], () => 0)).toBe("openai")
    expect(pickOpponent(["claude"], () => 0.99)).toBe("gemini")
  })

  it("honors FORCE_OPPONENT for testing", () => {
    setKeys("claude", "grok")
    process.env.FORCE_OPPONENT = "grok"
    expect(pickOpponent(["grok", "grok"])).toBe("grok")
  })

  it("ignores a FORCE_OPPONENT without a key", () => {
    setKeys("claude")
    process.env.FORCE_OPPONENT = "grok"
    expect(pickOpponent([])).toBe("claude")
  })

  it("fails clearly when no provider keys are set", () => {
    setKeys()
    expect(() => pickOpponent([])).toThrow("No opponents are available")
  })
})

describe("round token", () => {
  const opponent = { model: "grok" as const, apiModel: "grok-4.7" }
  const setup = { playerId: "00000000-0000-4000-8000-000000000001", opponent, memory: { profileVersion: 2, noteIds: [21, 22] } }

  beforeEach(() => {
    process.env.ROUND_TOKEN_SECRET = "test-secret"
  })

  it("round-trips the player, the opponent, and the AI's memory snapshot without exposing them", () => {
    const token = issueRoundToken(setup, "r1")
    expect(token).not.toMatch(/grok/i)
    expect(readRoundToken(token, "r1")).toEqual(setup)
  })

  it("rejects a token from another round", () => {
    const token = issueRoundToken(setup, "r1")
    expect(() => readRoundToken(token, "r2")).toThrow("expired")
  })

  it("rejects an expired token", () => {
    const token = issueRoundToken(setup, "r1", 0)
    expect(() => readRoundToken(token, "r1", 25 * 60 * 60 * 1000)).toThrow("expired")
  })

  it("rejects a tampered token, or one signed with another secret", () => {
    const token = issueRoundToken(setup, "r1")
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA")
    expect(() => readRoundToken(tampered, "r1")).toThrow("expired")

    process.env.ROUND_TOKEN_SECRET = "other-secret"
    expect(() => readRoundToken(token, "r1")).toThrow("expired")
  })

  it("fails clearly when the secret isn't set", () => {
    delete process.env.ROUND_TOKEN_SECRET
    expect(() => issueRoundToken(setup, "r1")).toThrow("isn't set up")
  })
})

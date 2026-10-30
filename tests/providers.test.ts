import { beforeEach, describe, expect, it, vi } from "vitest"
import Anthropic from "@anthropic-ai/sdk"
import { DECISION_JSON_SCHEMA, parseDecision } from "@/lib/game/schemas"
import { GameError, generateStructured } from "@/lib/server/providers"

const generateDecision = (model: "claude" | "openai", req: Parameters<typeof generateStructured>[1]) =>
  generateStructured(model, req, { name: "decision", schema: DECISION_JSON_SCHEMA }, parseDecision)

const { create } = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    constructor(readonly status: number) {
      super(`status ${status}`)
    }
  }
  class Anthropic {
    static APIError = APIError
    messages = { create }
  }
  return { default: Anthropic }
})

const request = { system: "sys", turns: [{ role: "user" as const, content: "hi" }], maxTokens: 300 }
const text = (value: string, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text: value }] })

describe("Claude provider", () => {
  beforeEach(() => {
    create.mockReset()
    process.env.ANTHROPIC_API_KEY = "test-key"
    delete process.env.CLAUDE_MODEL
  })

  it("sends a structured-output decision request with thinking off", async () => {
    create.mockResolvedValueOnce(text('{"reasoning":"r","decision":"KEEP"}'))
    await expect(generateDecision("claude", request)).resolves.toEqual({ reasoning: "r", decision: "KEEP" })

    const params = create.mock.calls[0][0]
    expect(params.model).toBe("claude-sonnet-5-5")
    expect(params.thinking).toEqual({ type: "between_tools" })
    expect(params.output_config.format.type).toBe("json_schema")
    expect(params.max_tokens).toBe(300)
  })

  it("honors the CLAUDE_MODEL override", async () => {
    process.env.CLAUDE_MODEL = "claude-haiku-4-5"
    create.mockResolvedValueOnce(text('{"reasoning":"r","decision":"KEEP"}'))
    await generateDecision("claude", request)
    const params = create.mock.calls[0][0]
    expect(params.model).toBe("claude-haiku-4-5")
    // Haiku takes neither the thinking setting nor effort.
    expect(params.thinking).toBeUndefined()
    expect(params.output_config.effort).toBeUndefined()
  })

  it("retries a malformed decision once, then succeeds", async () => {
    create.mockResolvedValueOnce(text("SHARE")).mockResolvedValueOnce(text('{"reasoning":"r","decision":"SHARE"}'))
    await expect(generateDecision("claude", request)).resolves.toMatchObject({ decision: "SHARE" })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("throws after two bad decisions instead of picking a random move", async () => {
    create.mockResolvedValue(text("I won't SHARE"))
    await expect(generateDecision("claude", request)).rejects.toBeInstanceOf(GameError)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("doesn't retry a rejected API key, and says which key", async () => {
    create.mockRejectedValue(new (Anthropic as unknown as { APIError: new (s: number) => Error }).APIError(401))
    await expect(generateDecision("claude", request)).rejects.toThrow("ANTHROPIC_API_KEY was rejected")
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("fails clearly when the key isn't set", async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateDecision("claude", request)).rejects.toThrow("ANTHROPIC_API_KEY is not set")
    expect(create).not.toHaveBeenCalled()
  })

  it("treats a refusal as an error", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] })
    await expect(generateDecision("claude", request)).rejects.toThrow("declined")
  })
})

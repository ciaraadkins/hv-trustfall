import type { AIModel } from "@/types/game"

/**
 * anthropic: the Anthropic SDK. openai: the OpenAI Responses API.
 * openai-compatible: Chat Completions against another provider's `baseURL`.
 */
type Provider = "anthropic" | "openai" | "openai-compatible"

/**
 * strict-schema: the provider enforces the JSON schema.
 * json-object: the provider only guarantees a JSON object, so the schema goes in the prompt.
 */
type JsonMode = "strict-schema" | "json-object"

export type ModelConfig = {
  id: AIModel
  provider: Provider
  /** Default provider model ID; override with `envVar` on the server. */
  apiModel: string
  envVar: string
  apiKeyEnv: string
  /** openai-compatible only. */
  baseURL?: string
  jsonMode: JsonMode
  /** openai-compatible only: sent as `reasoning_effort`, to keep short chat turns fast. */
  reasoningEffort?: "none" | "low"
  /** Shown only after the reveal. */
  displayName: string
  maxTokens: { turn: number; decision: number }
}

export const MODELS: Record<AIModel, ModelConfig> = {
  claude: {
    id: "claude",
    provider: "anthropic",
    apiModel: "claude-sonnet-5-5",
    envVar: "CLAUDE_MODEL",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    jsonMode: "strict-schema",
    displayName: "CLAUDE",
    // Thinking is turned off for Claude, so these budgets are output only (a 1-sentence message plus JSON).
    maxTokens: { turn: 300, decision: 300 },
  },
  openai: {
    id: "openai",
    provider: "openai",
    apiModel: "gpt-6-sol",
    envVar: "OPENAI_MODEL",
    apiKeyEnv: "OPENAI_API_KEY",
    jsonMode: "strict-schema",
    displayName: "CHATGPT",
    // Reasoning tokens count against max_output_tokens, so leave headroom beyond the short JSON reply.
    maxTokens: { turn: 1000, decision: 1000 },
  },
  gemini: {
    id: "gemini",
    provider: "openai-compatible",
    apiModel: "gemini-3.8-flash",
    envVar: "GEMINI_MODEL",
    apiKeyEnv: "GEMINI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    jsonMode: "strict-schema",
    // Thinking takes a turn from ~2.5s to ~6s, so it's off, like Claude's.
    reasoningEffort: "none",
    displayName: "GEMINI",
    maxTokens: { turn: 600, decision: 600 },
  },
  grok: {
    id: "grok",
    provider: "openai-compatible",
    // Grok 4.7 always reasons (6-15s a turn); this model doesn't (~1s).
    apiModel: "grok-4.20-0309-non-reasoning",
    envVar: "GROK_MODEL",
    apiKeyEnv: "XAI_API_KEY",
    baseURL: "https://api.x.ai/v1",
    jsonMode: "strict-schema",
    displayName: "GROK",
    maxTokens: { turn: 600, decision: 600 },
  },
  deepseek: {
    id: "deepseek",
    provider: "openai-compatible",
    apiModel: "deepseek-flash",
    envVar: "DEEPSEEK_MODEL",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com",
    jsonMode: "json-object",
    // Thinking can use up the whole budget and leave an empty reply, so it's off.
    reasoningEffort: "none",
    displayName: "DEEPSEEK",
    maxTokens: { turn: 600, decision: 600 },
  },
}

export const MODEL_IDS = Object.keys(MODELS) as AIModel[]

/** What the opponent is called until the reveal. */
export const OPPONENT_NAME = "AI"

export function isAIModel(value: unknown): value is AIModel {
  return typeof value === "string" && value in MODELS
}

/** Server-side: the provider model ID, honoring env overrides. */
export function resolveApiModel(id: AIModel): string {
  const config = MODELS[id]
  return process.env[config.envVar]?.trim() || config.apiModel
}

/** Server-side: models whose API key is set, so a missing key never breaks a round. */
export function availableModels(): AIModel[] {
  return MODEL_IDS.filter((id) => Boolean(process.env[MODELS[id].apiKeyEnv]?.trim()))
}

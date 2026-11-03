import type { ScoreStats } from "@/types/game"
import type {
  FinishRequest,
  FinishResponse,
  StartRequest,
  StartResponse,
  TurnRequest,
  TurnResponse,
} from "./schemas"

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error
    throw new Error("Network error. Check your connection and try again.")
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status}).`)
  }
  return data as T
}

const post = <T>(path: string, payload: unknown, signal?: AbortSignal) =>
  call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal })

export const requestStart = (payload: StartRequest) => post<StartResponse>("/api/game/start", payload)

export const requestTurn = (payload: TurnRequest, signal?: AbortSignal) =>
  post<TurnResponse>("/api/game/turn", payload, signal)

export const requestFinish = (payload: FinishRequest) => post<FinishResponse>("/api/game/finish", payload)

export const requestStats = () => call<ScoreStats>("/api/game/stats", { cache: "no-store" })

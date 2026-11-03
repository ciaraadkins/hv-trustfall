import "server-only"

import { NextResponse } from "next/server"
import type { z } from "zod"
import { GameError } from "./providers"

/** Validate a game request body against `schema`, run the handler, and map errors to JSON responses. */
export async function handleGameRequest<S extends z.ZodTypeAny, T>(
  request: Request,
  schema: S,
  handler: (req: z.infer<S>) => T | Promise<T>,
) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", issues: parsed.error.issues }, { status: 400 })
  }

  try {
    return NextResponse.json(await handler(parsed.data))
  } catch (error) {
    if (error instanceof GameError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Unexpected game route error", error)
    return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 })
  }
}

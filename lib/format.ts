import type { Choice } from "@/types/game"

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
})

/** "Oct 30, 2026, 5:42:13 PM", in the local time zone. */
export const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso))

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`
}

export const choiceColor = (choice: Choice) => (choice === "SHARE" ? "text-[#33FF33]" : "text-[#FF5555]")

/** Round IDs are UUIDs; the first block is enough to tell them apart at a glance. */
export const shortId = (roundId: string) => roundId.split("-")[0]

import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import OpenHashTarget from "@/components/open-hash-target"
import { MODELS, MODEL_IDS } from "@/lib/models"
import { LOCAL_PAGES } from "@/lib/site"
import { choiceColor, formatDateTime, formatDuration } from "@/lib/format"
import { readNoteLog } from "@/lib/server/memory"
import { overallStats, readRounds } from "@/lib/server/store"
import type { NoteRecord, RoundRecord } from "@/types/game"

export const dynamic = "force-dynamic"

const COLUMNS = "grid grid-cols-[2.5rem_11rem_6.5rem_4.5rem_4.5rem_5.5rem_6.5rem_4.5rem_5rem_1rem] gap-x-3 items-center"

/** Every logged round, newest first. Each row opens to show the transcript. */
export default function DataPage() {
  if (!LOCAL_PAGES) notFound()
  const rounds = readRounds()
  const stats = overallStats(rounds)
  const notesByRound = new Map(readNoteLog().map((note) => [note.roundId, note]))

  return (
    <main className="min-h-screen bg-[#121212] text-[#33FF33] relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-scanline pointer-events-none"></div>
      <OpenHashTarget />

      <div className="container mx-auto max-w-6xl px-4 py-12 z-10 relative font-mono">
        <h1 className="text-3xl font-bold mb-2">DATA</h1>
        <p className="text-sm text-[#ccc] mb-6">
          Every round, newest first. Click a round for the transcript. Saved in <code>data/rounds.jsonl</code>.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            ["HUMANS", stats.humanTotal, "text-[#33FF33]"],
            ["AI", stats.aiTotal, "text-[#FF5555]"],
            ["ROUNDS", stats.gamesPlayed, "text-[#00FFFF]"],
            ["BOTH SHARED", stats.bothShare, "text-[#00FFFF]"],
          ].map(([label, value, color]) => (
            <div key={label} className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-4 text-center">
              <div className="text-xs mb-1">{label}</div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#ccc] mb-8">
          Rounds per model:{" "}
          {MODEL_IDS.map((id) => `${MODELS[id].displayName} ${rounds.filter((r) => r.provider === id).length}`).join(" · ")}
        </p>

        {rounds.length === 0 ? (
          <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 text-center text-[#ccc]">
            No rounds yet. Play one and it&apos;ll show up here.
          </div>
        ) : (
          <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg overflow-x-auto">
            <div className="min-w-[60rem] text-sm">
              <div className={`${COLUMNS} px-4 py-3 border-b border-[#33FF33]/30 text-xs text-[#00FFFF]`}>
                <span>#</span>
                <span>DATE</span>
                <span>MODEL</span>
                <span>YOU</span>
                <span>AI</span>
                <span>POINTS</span>
                <span>SCORE BEFORE</span>
                <span>MSGS</span>
                <span>LENGTH</span>
                <span></span>
              </div>

              {rounds
                .map((round, index) => ({ round, number: index + 1 }))
                .reverse()
                .map(({ round, number }) => (
                  <details key={round.roundId} id={`round-${round.roundId}`} className="group border-b border-[#33FF33]/10 last:border-b-0">
                    <summary className={`${COLUMNS} px-4 py-2 cursor-pointer list-none hover:bg-[#33FF33]/5 [&::-webkit-details-marker]:hidden`}>
                      <span className="text-[#666]">{number}</span>
                      <span className="text-[#ccc]">{formatDateTime(round.date)}</span>
                      <span className="text-[#00FFFF]">{round.modelName}</span>
                      <span className={choiceColor(round.humanDecision)}>{round.humanDecision}</span>
                      <span className={choiceColor(round.aiDecision)}>{round.aiDecision}</span>
                      <span>
                        {round.humanPoints} / {round.aiPoints}
                      </span>
                      <span className="text-[#ccc]">
                        {round.scoreBefore.humans} – {round.scoreBefore.ai}
                      </span>
                      <span className="text-[#ccc]">
                        {round.humanMessageCount} / {round.aiMessageCount}
                      </span>
                      <span className="text-[#ccc]">{formatDuration(round.durationSeconds)}</span>
                      <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                    </summary>

                    <div className="px-4 pb-4 pt-2 bg-[#191919] space-y-3">
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#ccc]">
                        <span>
                          ROUND <span className="text-[#33FF33]">{round.roundId}</span>
                        </span>
                        <span>
                          MODEL <span className="text-[#33FF33]">{round.apiModel}</span>
                        </span>
                        <span>STARTED {formatDateTime(round.startedAt)}</span>
                        <span>
                          SCORE AFTER {round.scoreAfter.humans} – {round.scoreAfter.ai}
                        </span>
                        <span>STRATEGY v{round.strategyVersion}</span>
                      </div>

                      <MemoryUsed round={round} />

                      {round.aiLockInReason && (
                        <p className="text-sm">
                          <span className="text-[#FFAA55]">AI&apos;S PRIVATE REASON: </span>
                          <span className="text-[#ccc]">{round.aiLockInReason}</span>
                        </p>
                      )}

                      {round.transcript.length === 0 ? (
                        <p className="text-sm text-[#666]">Nobody said anything.</p>
                      ) : (
                        <ol className="space-y-1 text-sm">
                          {round.transcript.map((m, i) => (
                            <li key={i}>
                              <span className="text-[#666] mr-2">{m.secondsIntoRound}s</span>
                              <span className={m.sender === "HUMAN" ? "text-[#00FFFF]" : "text-[#33FF33]"}>
                                {m.sender === "HUMAN" ? "YOU" : round.modelName}:
                              </span>{" "}
                              <span className="text-[#ccc]">{m.text}</span>
                            </li>
                          ))}
                        </ol>
                      )}

                      <NoteAfter note={notesByRound.get(round.roundId)} />
                    </div>
                  </details>
                ))}
            </div>
          </div>
        )}

        <p className="text-xs text-[#666] mt-4">
          Points and messages are YOU / AI. Times are in your local time zone.
        </p>
      </div>
    </main>
  )
}

/** What the AI remembered during the round: a profile version and notes, linked to the memory tab. */
function MemoryUsed({ round }: { round: RoundRecord }) {
  const { profileVersion, noteIds } = round.memory ?? { profileVersion: null, noteIds: [] }
  const empty = profileVersion === null && noteIds.length === 0
  return (
    <p className="text-sm">
      <span className="text-[#FFAA55]">AI KNEW GOING IN: </span>
      {empty ? (
        <span className="text-[#ccc]">nothing yet (no memory)</span>
      ) : (
        <span className="text-[#ccc]">
          {profileVersion !== null && (
            <Link href={`/memory#profile-${profileVersion}`} className="text-[#00FFFF] hover:underline">
              profile v{profileVersion}
            </Link>
          )}
          {profileVersion !== null && noteIds.length > 0 && " + "}
          {noteIds.length > 0 && "notes "}
          {noteIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <Link href={`/memory#note-${id}`} className="text-[#00FFFF] hover:underline">
                #{id}
              </Link>
            </span>
          ))}
        </span>
      )}
    </p>
  )
}

/** The note the AI wrote after the round, if it has. */
function NoteAfter({ note }: { note: NoteRecord | undefined }) {
  return (
    <div className="text-sm border-t border-[#33FF33]/10 pt-3">
      <span className="text-[#FFAA55]">AI&apos;S NOTE AFTERWARDS: </span>
      {!note ? (
        <span className="text-[#666]">not written yet</span>
      ) : note.status === "failed" ? (
        <span className="text-[#FF5555]">couldn&apos;t be written ({note.error})</span>
      ) : (
        <>
          <Link href={`/memory#note-${note.noteId}`} className="text-[#00FFFF] hover:underline">
            #{note.noteId}
          </Link>{" "}
          <span className="text-[#ccc]">{note.note}</span>
        </>
      )}
    </div>
  )
}

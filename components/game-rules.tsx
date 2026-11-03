"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react"
import { useGame } from "@/contexts/game-context"
import { PAYOFFS } from "@/lib/game/scoring"
import type { Choice } from "@/types/game"

const CHOICES: Choice[] = ["SHARE", "KEEP"]

const GameRules = () => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { aiName } = useGame()

  return (
    <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg mb-2 sm:mb-4 overflow-hidden transition-all duration-300">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full px-3 py-2 sm:py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#33FF33]" />
          <span className="font-mono text-[#33FF33]">GAME RULES</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-[#33FF33]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#33FF33]" />
        )}
      </button>

      {isExpanded && (
        <div className="p-3 sm:p-4 border-t border-[#33FF33]/30 max-h-[50dvh] overflow-y-auto text-sm sm:text-base">
          <p className="font-mono text-[#ccc] mb-4">
            In each round, both you and the {aiName} choose to either SHARE or KEEP resources.
            Depending on what you both choose, you&apos;ll get different points:
          </p>

          <div className="grid grid-cols-3 gap-px bg-[#333] text-center mb-4">
            <div className="bg-[#1e1e1e] p-2"></div>
            <div className="bg-[#1e1e1e] p-2 font-mono text-[#33FF33]">AI SHARES</div>
            <div className="bg-[#1e1e1e] p-2 font-mono text-[#FF5555]">AI KEEPS</div>

            {CHOICES.map((human) => (
              <div key={human} className="contents">
                <div className={`bg-[#1e1e1e] p-2 font-mono ${human === "SHARE" ? "text-[#33FF33]" : "text-[#FF5555]"}`}>
                  YOU {human}
                </div>
                {CHOICES.map((ai) => (
                  <div key={ai} className="bg-[#1e1e1e] p-2 font-mono">
                    <span className="text-[#33FF33]">YOU: +{PAYOFFS[human][ai].human}</span>
                    <br />
                    <span className="text-[#00FFFF]">AI: +{PAYOFFS[human][ai].ai}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p className="font-mono text-[#ccc] text-sm">
            All points count toward the all-time Humans vs. AI score.
          </p>
        </div>
      )}
    </div>
  )
}

export default GameRules

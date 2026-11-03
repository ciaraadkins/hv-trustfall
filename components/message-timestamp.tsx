"use client"

import { useState, useEffect } from "react"

interface MessageTimestampProps {
  timestamp: number
}

export default function MessageTimestamp({ timestamp }: MessageTimestampProps) {
  const [timeAgo, setTimeAgo] = useState<string>("")

  useEffect(() => {
    const updateTimeAgo = () => {
      const now = Date.now()
      const seconds = Math.floor((now - timestamp) / 1000)

      if (seconds < 60) {
        setTimeAgo(`${seconds}s ago`)
      } else if (seconds < 3600) {
        setTimeAgo(`${Math.floor(seconds / 60)}m ago`)
      } else {
        setTimeAgo(`${Math.floor(seconds / 3600)}h ago`)
      }
    }

    updateTimeAgo()
    const interval = setInterval(updateTimeAgo, 10000)

    return () => clearInterval(interval)
  }, [timestamp])

  // Desktop only: on phones it just crowds the chat.
  return <span className="hidden sm:inline text-xs text-[#666] ml-2">{timeAgo}</span>
}


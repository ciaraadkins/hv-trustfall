"use client"

import { useEffect } from "react"

/** Opens and scrolls to the <details> named in the URL hash, e.g. /data#round-abc. */
export default function OpenHashTarget() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    const target = id ? document.getElementById(id) : null
    if (target instanceof HTMLDetailsElement) target.open = true
    target?.scrollIntoView({ block: "start" })
  }, [])
  return null
}

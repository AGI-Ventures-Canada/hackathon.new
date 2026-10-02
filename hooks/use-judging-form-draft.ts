"use client"

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type SetStateAction } from "react"
import { useAuth } from "@clerk/nextjs"

const memory = new Map<string, string>()
const eventName = "judging-form-draft"
const serverSnapshot = () => null

export function useJudgingFormDraft<T>(eventId: string, formId: string, initial: T) {
  const { userId } = useAuth()
  const key = userId ? `judging-form:v1:${userId}:${eventId}:${formId}` : null
  const defaults = useRef({key, value:initial})
  useEffect(() => { defaults.current = {key, value:initial} }, [key,initial])
  const read = useCallback(() => {
    if (!key) return null
    try { return localStorage.getItem(key) } catch { return memory.get(key) ?? null }
  }, [key])
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener(eventName, listener)
    window.addEventListener("storage", listener)
    return () => { window.removeEventListener(eventName,listener); window.removeEventListener("storage",listener) }
  }, [])
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot)
  const recovered = useMemo((): T | undefined => {
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw) as {value:T}
      return parsed.value
    } catch { return undefined }
  }, [raw])
  const value = recovered ?? initial
  const setValue = useCallback((update: SetStateAction<T>) => {
    if (!key) return
    let previous = defaults.current.value
    try { const stored = read(); if (stored) previous = (JSON.parse(stored) as {value:T}).value } catch { /* Keep the empty form if recovery data is damaged. */ }
    const next = typeof update === "function" ? (update as (current:T) => T)(previous) : update
    const saved = JSON.stringify({value:next})
    memory.set(key,saved)
    try { localStorage.setItem(key,saved) } catch { /* Keep the draft for this tab when browser storage is unavailable. */ }
    window.dispatchEvent(new Event(eventName))
  }, [key,read])
  const clear = useCallback(() => {
    if (!key) return
    memory.delete(key)
    try { localStorage.removeItem(key) } catch { /* The tab copy has been cleared. */ }
    window.dispatchEvent(new Event(eventName))
  }, [key])
  return [value, setValue, clear, Boolean(raw)] as const
}

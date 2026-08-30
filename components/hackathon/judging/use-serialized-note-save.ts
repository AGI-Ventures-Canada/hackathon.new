"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type NoteSaveState = {
  saved: string
  pending: string | null
  pipeline: Promise<boolean> | null
  generation: number
}

export function useSerializedNoteSave(
  save: (value: string) => Promise<void>,
  delayMs = 1_000,
) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const stateRef = useRef<NoteSaveState>({
    saved: "",
    pending: null,
    pipeline: null,
    generation: 0,
  })
  const saveRef = useRef(save)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  const runQueue = useCallback((): Promise<boolean> => {
    const state = stateRef.current
    if (state.pipeline) return state.pipeline
    const generation = state.generation
    const work = (async () => {
      while (stateRef.current.generation === generation) {
        const current = stateRef.current
        const value = current.pending
        if (value === null) return true
        current.pending = null
        if (value === current.saved) continue
        if (mountedRef.current) {
          setSaving(true)
          setSaveError(false)
        }
        try {
          await saveRef.current(value)
        } catch {
          if (stateRef.current.generation !== generation) return false
          if (stateRef.current.pending === null) stateRef.current.pending = value
          if (mountedRef.current) setSaveError(true)
          return false
        }
        if (stateRef.current.generation !== generation) return false
        stateRef.current.saved = value
      }
      return false
    })()
    const pipeline = work.finally(() => {
      if (
        stateRef.current.generation === generation &&
        stateRef.current.pipeline === pipeline
      ) {
        stateRef.current.pipeline = null
        if (mountedRef.current) setSaving(false)
      }
    })
    state.pipeline = pipeline
    return pipeline
  }, [])

  const reset = useCallback((savedValue: string) => {
    clearTimeout(timeoutRef.current)
    const generation = stateRef.current.generation + 1
    stateRef.current = {
      saved: savedValue,
      pending: null,
      pipeline: null,
      generation,
    }
    if (mountedRef.current) {
      setSaving(false)
      setSaveError(false)
    }
  }, [])

  const stage = useCallback((value: string) => {
    clearTimeout(timeoutRef.current)
    stateRef.current.pending = value
  }, [])

  const schedule = useCallback((value: string) => {
    stage(value)
    timeoutRef.current = setTimeout(() => {
      void runQueue()
    }, delayMs)
  }, [delayMs, runQueue, stage])

  const flush = useCallback((value?: string): Promise<boolean> => {
    clearTimeout(timeoutRef.current)
    if (value !== undefined) stateRef.current.pending = value
    return runQueue()
  }, [runQueue])

  useEffect(() => () => {
    mountedRef.current = false
    clearTimeout(timeoutRef.current)
  }, [runQueue])

  return {
    saving,
    saveError,
    reset,
    stage,
    schedule,
    flush,
  }
}

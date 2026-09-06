"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { reconcileReviewResponse, reviewResponseSchema, type ReviewResponse, type ReviewSnapshot } from "@/lib/utils/judging-review"

type SaveStatus = "loading" | "saved" | "saving" | "offline" | "error" | "conflict" | "closed"
type Recovery = { revision: number; criteriaVersion: string; response: ReviewResponse }

export function useJudgingReview(slug: string, targetId: string, ballot = false) {
  const router = useRouter()
  const endpoint = `/api/public/hackathons/${slug}/judging/${ballot ? "pick-reviews" : "reviews"}/${targetId}`
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null)
  const [response, setResponse] = useState<ReviewResponse | null>(null)
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const snapshotRef = useRef<ReviewSnapshot | null>(null)
  const responseRef = useRef<ReviewResponse | null>(null)
  const pendingRef = useRef(false)
  const pausedRef = useRef(false)
  const generationRef = useRef(0)
  const pipelineRef = useRef<Promise<boolean> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)
  const storageKeyRef = useRef<string | null>(null)

  const backup = useCallback(() => {
    if (!pendingRef.current) return
    const current = snapshotRef.current
    if (!current || !responseRef.current || !storageKeyRef.current) return
    try { localStorage.setItem(storageKeyRef.current, JSON.stringify({ revision: current.revision, criteriaVersion: current.criteriaVersion, response: responseRef.current } satisfies Recovery)) } catch { /* A server save remains available when browser storage is full. */ }
  }, [])

  const clearBackup = useCallback(() => {
    try { if (storageKeyRef.current) localStorage.removeItem(storageKeyRef.current) } catch { /* Storage can be disabled. */ }
  }, [])

  const request = useCallback(async (method: "GET" | "PATCH" | "POST", current?: ReviewSnapshot, value?: ReviewResponse) => {
    const result = await fetch(endpoint, {
      method,
      ...(method !== "GET" && { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: current?.revision, criteriaVersion: current?.criteriaVersion, response: value }), keepalive: method === "PATCH" }),
      cache: "no-store",
    })
    const body = await result.json()
    if (!result.ok) throw Object.assign(new Error(body.error || "Your review couldn't be saved. Try again."), { status: result.status, code: body.code })
    return body as ReviewSnapshot
  }, [endpoint])

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timeoutRef.current)
    if (pipelineRef.current) return pipelineRef.current
    if (pausedRef.current) return Promise.resolve(false)
    const work = async () => {
      while (pendingRef.current && snapshotRef.current && responseRef.current) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (mountedRef.current) setStatus("offline")
          return false
        }
        const generation = generationRef.current
        const current = snapshotRef.current
        const value = responseRef.current
        if (mountedRef.current) { setStatus("saving"); setError(null) }
        try {
          const next = await request("PATCH", current, value)
          snapshotRef.current = next
          if (mountedRef.current) setSnapshot(next)
          if (generation === generationRef.current) {
            pendingRef.current = false
            clearBackup()
            if (mountedRef.current) setStatus("saved")
          } else backup()
        } catch (cause) {
          const closed = cause instanceof Error && "code" in cause && cause.code === "judging_closed"
          const conflict = !closed && cause instanceof Error && "status" in cause && cause.status === 409
          pausedRef.current = conflict || closed
          if (closed && snapshotRef.current) {
            snapshotRef.current = { ...snapshotRef.current, canEdit: false, editReason: cause.message }
            if (mountedRef.current) setSnapshot(snapshotRef.current)
          }
          backup()
          if (mountedRef.current) { setStatus(closed ? "closed" : conflict ? "conflict" : navigator.onLine ? "error" : "offline"); setError(cause instanceof Error ? cause.message : "Your draft is saved on this device. Try again.") }
          return false
        }
      }
      return true
    }
    const pipeline = work().finally(() => { pipelineRef.current = null })
    pipelineRef.current = pipeline
    return pipeline
  }, [backup, clearBackup, request])

  const load = useCallback(async (keepChanges = false) => {
    setError(null)
    try {
      const next = await request("GET")
      if (!mountedRef.current) return
      storageKeyRef.current = `judging-review:v1:${next.judgeId}:${slug}:${ballot ? "picks" : "project"}:${targetId}`
      let recovery: Recovery | null = null
      if (!keepChanges) {
        try {
          const raw = localStorage.getItem(storageKeyRef.current)
          if (raw) {
            const value = JSON.parse(raw) as Recovery
            if (reviewResponseSchema.safeParse(value.response).success && Number.isSafeInteger(value.revision)) recovery = value
          }
        } catch { recovery = null }
      }
      const restored = keepChanges && responseRef.current ? reconcileReviewResponse(responseRef.current, next) : recovery?.response
      snapshotRef.current = next
      responseRef.current = restored ?? next.response
      setSnapshot(next)
      setResponse(responseRef.current)
      pendingRef.current = Boolean(restored)
      const conflict = !keepChanges && (Boolean(recovery && (recovery.revision !== next.revision || recovery.criteriaVersion !== next.criteriaVersion)) || Boolean(next.draftCriteriaVersion && next.draftCriteriaVersion !== next.criteriaVersion))
      pausedRef.current = conflict || !next.canEdit
      setStatus(!next.canEdit ? "closed" : conflict ? "conflict" : "saved")
      if (!next.canEdit) setError(next.editReason || "Judging is read-only right now. Your saved draft is still here.")
      else if (conflict) setError("Your saved review changed on another tab or device. Your changes are still here. Reload the latest version before saving them.")
      if (keepChanges) { pausedRef.current = !next.canEdit; backup() }
    } catch (cause) {
      if (mountedRef.current) { setStatus("error"); setError(cause instanceof Error ? cause.message : "We couldn't open this review.") }
    }
  }, [backup, ballot, request, slug, targetId])

  useEffect(() => {
    mountedRef.current = true
    void load()
    const reconnect = () => { if (!pausedRef.current) void flush() }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pendingRef.current) return
      backup()
      event.preventDefault()
    }
    window.addEventListener("online", reconnect)
    window.addEventListener("beforeunload", beforeUnload)
    return () => {
      backup()
      void flush()
      mountedRef.current = false
      clearTimeout(timeoutRef.current)
      window.removeEventListener("online", reconnect)
      window.removeEventListener("beforeunload", beforeUnload)
    }
  }, [backup, flush, load])

  const change = useCallback((next: ReviewResponse) => {
    if (!snapshotRef.current?.canEdit || submitting) return
    responseRef.current = next
    generationRef.current += 1
    pendingRef.current = true
    setResponse(next)
    backup()
    clearTimeout(timeoutRef.current)
    if (!pausedRef.current) {
      setStatus(navigator.onLine ? "saving" : "offline")
      timeoutRef.current = setTimeout(() => void flush(), 750)
    }
  }, [backup, flush, submitting])

  const submit = useCallback(async () => {
    if (submitting || !snapshotRef.current?.canEdit || !responseRef.current) return false
    setSubmitting(true)
    setError(null)
    try {
      if (!(await flush())) return false
      const current = snapshotRef.current
      const value = responseRef.current
      if (!current || !value) return false
      const next = await request("POST", current, value)
      snapshotRef.current = next
      responseRef.current = next.response
      pendingRef.current = false
      setSnapshot(next)
      setResponse(next.response)
      setStatus("saved")
      clearBackup()
      window.dispatchEvent(new Event("judging-progress-changed"))
      router.refresh()
      return true
    } catch (cause) {
      backup()
      const closed = cause instanceof Error && "code" in cause && cause.code === "judging_closed"
      const conflict = !closed && cause instanceof Error && "status" in cause && cause.status === 409
      pausedRef.current = conflict || closed
      if (closed && snapshotRef.current) {
        snapshotRef.current = { ...snapshotRef.current, canEdit: false, editReason: cause.message }
        setSnapshot(snapshotRef.current)
      }
      setStatus(closed ? "closed" : conflict ? "conflict" : "error")
      setError(cause instanceof Error ? cause.message : "Your review wasn't submitted. Try again.")
      return false
    } finally { setSubmitting(false) }
  }, [backup, clearBackup, flush, request, router, submitting])

  return { snapshot, response, status, error, submitting, change, flush, submit, reload: () => load(true) }
}

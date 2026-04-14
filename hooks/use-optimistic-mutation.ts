"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"

export interface UseOptimisticMutationOptions<TInput, TResponse> {
  fn: (input: TInput) => Promise<TResponse>
  onOptimistic?: (input: TInput) => void
  onSuccess?: (response: TResponse, input: TInput) => void
  onRevert?: (input: TInput) => void
  onError?: (error: Error, input: TInput) => void
  refreshOnSuccess?: boolean
}

export interface UseOptimisticMutationReturn<TInput> {
  execute: (input: TInput) => Promise<void>
  isPending: boolean
  error: string | null
  clearError: () => void
}

const ERROR_DISMISS_MS = 8000

export function useOptimisticMutation<TInput, TResponse = unknown>(
  options: UseOptimisticMutationOptions<TInput, TResponse>
): UseOptimisticMutationReturn<TInput> {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }, [])

  const pendingRef = useRef(false)

  const execute = useCallback(
    async (input: TInput) => {
      if (pendingRef.current) return
      const { fn, onOptimistic, onSuccess, onRevert, onError, refreshOnSuccess = true } = optionsRef.current
      pendingRef.current = true
      clearError()
      setIsPending(true)
      onOptimistic?.(input)

      try {
        const response = await fn(input)
        onSuccess?.(response, input)
        if (refreshOnSuccess) router.refresh()
      } catch (err) {
        onRevert?.(input)
        const message =
          err instanceof Error ? err.message : "Something went wrong"
        setError(message)
        onError?.(err instanceof Error ? err : new Error(message), input)
        errorTimerRef.current = setTimeout(() => {
          setError(null)
          errorTimerRef.current = null
        }, ERROR_DISMISS_MS)
      } finally {
        pendingRef.current = false
        setIsPending(false)
      }
    },
    [router, clearError]
  )

  return { execute, isPending, error, clearError }
}

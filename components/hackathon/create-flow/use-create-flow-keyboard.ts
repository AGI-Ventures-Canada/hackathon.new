"use client"

import { useEffect } from "react"

interface UseCreateFlowKeyboardOptions {
  onNext: () => void
  onSkip: () => void
  onPrimary?: () => void
  onClose: () => void
  canSkip: boolean
  disabled?: boolean
}

export function useCreateFlowKeyboard({
  onNext,
  onSkip,
  onPrimary,
  onClose,
  canSkip,
  disabled = false,
}: UseCreateFlowKeyboardOptions) {
  useEffect(() => {
    if (disabled) return

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target instanceof HTMLElement ? e.target : null
      const tag = target?.tagName
      const isTextarea = tag === "TEXTAREA"
      const isContentEditable = target?.isContentEditable
      const isButtonLike = Boolean(target?.closest(
        "button, a, select, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch']",
      ))

      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && (onPrimary || canSkip)) {
        e.preventDefault()
        if (onPrimary) onPrimary()
        else onSkip()
        return
      }

      if (
        e.key === "Enter" &&
        !isTextarea &&
        !isContentEditable &&
        !isButtonLike &&
        !e.shiftKey
      ) {
        e.preventDefault()
        onNext()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onNext, onSkip, onPrimary, onClose, canSkip, disabled])
}

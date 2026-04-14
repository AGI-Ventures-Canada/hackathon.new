"use client"

import { useState, useMemo, useCallback } from "react"

export interface UseOptimisticListOptions<T> {
  items: T[]
  getId: (item: T) => string
}

export interface UseOptimisticListReturn<T> {
  visibleItems: T[]
  hideItem: (id: string) => void
  unhideItem: (id: string) => void
  hiddenIds: ReadonlySet<string>
  addPendingItem: (item: T) => void
  removePendingItem: (id: string) => void
  pendingItems: readonly T[]
  setLocalEdit: (id: string, patch: Partial<T>) => void
  clearLocalEdit: (id: string) => void
  clearAllEdits: () => void
}

export function useOptimisticList<T>(
  options: UseOptimisticListOptions<T>
): UseOptimisticListReturn<T> {
  const { items, getId } = options

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [pendingItems, setPendingItems] = useState<T[]>([])
  const [localEdits, setLocalEdits] = useState<Map<string, Partial<T>>>(
    new Map()
  )
  const [prevItems, setPrevItems] = useState(items)

  // Reconcile optimistic state when server data changes (after router.refresh()).
  // This is React's "setState during render" pattern (equivalent to
  // getDerivedStateFromProps) — intentionally not a useEffect, which would
  // cause a one-frame flicker showing stale pending/hidden items.
  if (items !== prevItems) {
    setPrevItems(items)
    const serverIds = new Set(items.map(getId))

    const nextPending = pendingItems.filter((p) => !serverIds.has(getId(p)))
    if (nextPending.length !== pendingItems.length) {
      setPendingItems(nextPending)
    }

    let hiddenChanged = false
    for (const id of hiddenIds) {
      if (!serverIds.has(id)) {
        hiddenChanged = true
        break
      }
    }
    if (hiddenChanged) {
      const next = new Set<string>()
      for (const id of hiddenIds) {
        if (serverIds.has(id)) next.add(id)
      }
      setHiddenIds(next)
    }

    let editsChanged = false
    for (const id of localEdits.keys()) {
      if (!serverIds.has(id)) {
        editsChanged = true
        break
      }
    }
    if (editsChanged) {
      const next = new Map<string, Partial<T>>()
      for (const [id, edit] of localEdits) {
        if (serverIds.has(id)) next.set(id, edit)
      }
      setLocalEdits(next)
    }
  }

  const visibleItems = useMemo(() => {
    const serverIds = new Set(items.map(getId))
    const merged = [
      ...items,
      ...pendingItems.filter((p) => !serverIds.has(getId(p))),
    ]
    return merged
      .filter((item) => !hiddenIds.has(getId(item)))
      .map((item) => {
        const edit = localEdits.get(getId(item))
        return edit ? { ...item, ...edit } : item
      })
  }, [items, pendingItems, hiddenIds, localEdits, getId])

  const hideItem = useCallback((id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id))
  }, [])

  const unhideItem = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const addPendingItem = useCallback((item: T) => {
    setPendingItems((prev) => [...prev, item])
  }, [])

  const removePendingItem = useCallback(
    (id: string) => {
      setPendingItems((prev) => prev.filter((p) => getId(p) !== id))
    },
    [getId]
  )

  const setLocalEdit = useCallback(
    (id: string, patch: Partial<T>) => {
      setLocalEdits((prev) =>
        new Map(prev).set(id, { ...prev.get(id), ...patch })
      )
    },
    []
  )

  const clearLocalEdit = useCallback((id: string) => {
    setLocalEdits((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const clearAllEdits = useCallback(() => {
    setLocalEdits(new Map())
  }, [])

  return {
    visibleItems,
    hideItem,
    unhideItem,
    hiddenIds,
    addPendingItem,
    removePendingItem,
    pendingItems,
    setLocalEdit,
    clearLocalEdit,
    clearAllEdits,
  }
}

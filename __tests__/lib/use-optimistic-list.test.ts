import { describe, it, expect } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { useOptimisticList } from "@/hooks/use-optimistic-list"

type Item = { id: string; name: string }

const getId = (item: Item) => item.id

function setup(items: Item[] = []) {
  return renderHook(
    ({ items: i }) => useOptimisticList<Item>({ items: i, getId }),
    { initialProps: { items } }
  )
}

describe("useOptimisticList", () => {
  describe("visibleItems", () => {
    it("returns all items when no optimistic state", () => {
      const items = [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]
      const { result } = setup(items)

      expect(result.current.visibleItems).toEqual(items)
    })

    it("excludes hidden items", () => {
      const items = [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]
      const { result } = setup(items)

      act(() => result.current.hideItem("1"))

      expect(result.current.visibleItems).toEqual([{ id: "2", name: "B" }])
      expect(result.current.hiddenIds.has("1")).toBe(true)
    })

    it("includes pending items", () => {
      const items = [{ id: "1", name: "A" }]
      const { result } = setup(items)

      act(() => result.current.addPendingItem({ id: "temp", name: "New" }))

      expect(result.current.visibleItems).toEqual([
        { id: "1", name: "A" },
        { id: "temp", name: "New" },
      ])
    })

    it("applies local edits", () => {
      const items = [{ id: "1", name: "Old" }]
      const { result } = setup(items)

      act(() => result.current.setLocalEdit("1", { name: "New" }))

      expect(result.current.visibleItems).toEqual([{ id: "1", name: "New" }])
    })

    it("merges multiple local edits on the same item", () => {
      const items = [{ id: "1", name: "A" }]
      const { result } = setup(items)

      act(() => result.current.setLocalEdit("1", { name: "B" }))
      act(() =>
        result.current.setLocalEdit("1", { name: "C" } as Partial<Item>)
      )

      expect(result.current.visibleItems[0].name).toBe("C")
    })
  })

  describe("hideItem / unhideItem", () => {
    it("unhideItem restores the item", () => {
      const items = [{ id: "1", name: "A" }]
      const { result } = setup(items)

      act(() => result.current.hideItem("1"))
      expect(result.current.visibleItems).toHaveLength(0)

      act(() => result.current.unhideItem("1"))
      expect(result.current.visibleItems).toEqual([{ id: "1", name: "A" }])
    })
  })

  describe("addPendingItem / removePendingItem", () => {
    it("removePendingItem removes the item", () => {
      const { result } = setup([])

      act(() => result.current.addPendingItem({ id: "temp", name: "New" }))
      expect(result.current.visibleItems).toHaveLength(1)

      act(() => result.current.removePendingItem("temp"))
      expect(result.current.visibleItems).toHaveLength(0)
    })

    it("does not duplicate when pending item ID matches server item", () => {
      const items = [{ id: "1", name: "Server" }]
      const { result } = setup(items)

      act(() => result.current.addPendingItem({ id: "1", name: "Pending" }))

      expect(result.current.visibleItems).toHaveLength(1)
      expect(result.current.visibleItems[0].name).toBe("Server")
    })
  })

  describe("reconciliation on items prop change", () => {
    it("removes pending items that now exist in server data", () => {
      const { result, rerender } = setup([])

      act(() => result.current.addPendingItem({ id: "temp", name: "New" }))
      expect(result.current.pendingItems).toHaveLength(1)

      rerender({ items: [{ id: "temp", name: "Server version" }] })

      expect(result.current.pendingItems).toHaveLength(0)
      expect(result.current.visibleItems).toEqual([
        { id: "temp", name: "Server version" },
      ])
    })

    it("cleans up hidden IDs for items no longer in server data", () => {
      const items = [{ id: "1", name: "A" }]
      const { result, rerender } = setup(items)

      act(() => result.current.hideItem("1"))
      expect(result.current.hiddenIds.has("1")).toBe(true)

      rerender({ items: [] })

      expect(result.current.hiddenIds.has("1")).toBe(false)
    })

    it("cleans up local edits for items no longer in server data", () => {
      const items = [{ id: "1", name: "A" }]
      const { result, rerender } = setup(items)

      act(() => result.current.setLocalEdit("1", { name: "Edited" }))

      rerender({ items: [] })

      expect(result.current.visibleItems).toHaveLength(0)
    })
  })

  describe("clearLocalEdit / clearAllEdits", () => {
    it("clearLocalEdit removes edit for a single item", () => {
      const items = [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]
      const { result } = setup(items)

      act(() => {
        result.current.setLocalEdit("1", { name: "Edited A" })
        result.current.setLocalEdit("2", { name: "Edited B" })
      })

      act(() => result.current.clearLocalEdit("1"))

      expect(result.current.visibleItems[0].name).toBe("A")
      expect(result.current.visibleItems[1].name).toBe("Edited B")
    })

    it("clearAllEdits removes all edits", () => {
      const items = [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]
      const { result } = setup(items)

      act(() => {
        result.current.setLocalEdit("1", { name: "Edited A" })
        result.current.setLocalEdit("2", { name: "Edited B" })
      })

      act(() => result.current.clearAllEdits())

      expect(result.current.visibleItems).toEqual(items)
    })
  })
})

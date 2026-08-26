import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"
import {
  consumeDeliverySlot,
  createDeliveryBudget,
  hasPendingDeliveryTasks,
  hasDeliveryCapacity,
  markDeliveryTaskComplete,
  runWithinDeliveryDeadline,
  selectPendingDeliveryTasks,
} from "@/lib/services/delivery-budget"

describe("delivery budget", () => {
  beforeEach(() => resetSupabaseMocks())

  it("stops at either the recipient limit or deadline", () => {
    const budget = createDeliveryBudget(2, Date.now() + 60_000)
    expect(consumeDeliverySlot(budget)).toBe(true)
    expect(consumeDeliverySlot(budget)).toBe(true)
    expect(consumeDeliverySlot(budget)).toBe(false)

    const expired = createDeliveryBudget(2, Date.now() - 1)
    expect(hasDeliveryCapacity(expired)).toBe(false)
  })

  it("tracks stable tasks when a recipient is inserted before completed work", async () => {
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({ data: [], error: null })
      chains.push(chain)
      return chain
    })

    await expect(selectPendingDeliveryTasks(
      "winner:h1:v1",
      ["b", "c"],
      (task) => task,
      createDeliveryBudget(1, Date.now() + 60_000),
    )).resolves.toEqual({ tasks: ["b"], deferred: true })
    await markDeliveryTaskComplete("winner:h1:v1", "b")

    const completedKey = (chains[1].upsert.mock.calls[0]?.[0] as { key: string }).key
    setMockFromImplementation(() => createChainableMock({
      data: [{ key: completedKey, reset_at: Date.now() + 60_000 }],
      error: null,
    }))

    await expect(selectPendingDeliveryTasks(
      "winner:h1:v1",
      ["a", "b", "c"],
      (task) => task,
      createDeliveryBudget(2, Date.now() + 60_000),
    )).resolves.toEqual({ tasks: ["a", "c"], deferred: false })
    expect(completedKey).toMatch(/^delivery-progress:[a-f0-9]{32}:[a-f0-9]{32}$/)
    expect(completedKey).not.toContain("winner:h1:v1")
  })

  it("bounds external discovery by the delivery deadline", async () => {
    const work = mock(() => Promise.resolve("late"))
    await expect(runWithinDeliveryDeadline(
      createDeliveryBudget(1, Date.now() - 1),
      work,
    )).resolves.toEqual({ completed: false })
    expect(work).not.toHaveBeenCalled()
  })

  it("supports unbounded work and normalizes invalid recipient limits", async () => {
    expect(createDeliveryBudget(-2.4, Date.now() + 60_000).remainingRecipients).toBe(0)
    expect(createDeliveryBudget(2.9, Date.now() + 60_000).remainingRecipients).toBe(2)
    expect(hasDeliveryCapacity()).toBe(true)
    expect(consumeDeliverySlot()).toBe(true)
    await expect(runWithinDeliveryDeadline(undefined, async () => "done"))
      .resolves.toEqual({ completed: true, value: "done" })
  })

  it("handles empty selections and detects pending work", async () => {
    await expect(selectPendingDeliveryTasks(
      "empty",
      [],
      (task: string) => task,
    )).resolves.toEqual({ tasks: [], deferred: false })
    await expect(hasPendingDeliveryTasks(
      "empty",
      [],
      (task: string) => task,
    )).resolves.toBe(false)

    setMockFromImplementation(() => createChainableMock({ data: [], error: null }))
    await expect(hasPendingDeliveryTasks(
      "pending",
      ["one"],
      (task) => task,
    )).resolves.toBe(true)
  })

  it("paginates completed work and reports database failures", async () => {
    let read = 0
    setMockFromImplementation(() => {
      read++
      return createChainableMock(read === 1
        ? {
            data: Array.from({ length: 100 }, (_, index) => ({
              key: `ignored-${index}`,
              reset_at: Date.now() - 1,
            })),
            error: null,
          }
        : { data: null, error: { message: "read failed" } })
    })

    await expect(selectPendingDeliveryTasks(
      "page",
      Array.from({ length: 101 }, (_, index) => `task-${index}`),
      (task) => task,
      createDeliveryBudget(101, Date.now() + 60_000),
    )).rejects.toThrow("Failed to load email delivery progress")

    setMockFromImplementation(() => createChainableMock({
      data: null,
      error: { message: "write failed" },
    }))
    await expect(markDeliveryTaskComplete("work", "task"))
      .rejects.toThrow("Failed to save email delivery progress")
  })

  it("returns when bounded work finishes or reaches its deadline", async () => {
    await expect(runWithinDeliveryDeadline(
      createDeliveryBudget(1, Date.now() + 60_000),
      async () => "done",
    )).resolves.toEqual({ completed: true, value: "done" })

    await expect(runWithinDeliveryDeadline(
      createDeliveryBudget(1, Date.now() + 5),
      () => new Promise<string>(() => {}),
    )).resolves.toEqual({ completed: false })
  })
})

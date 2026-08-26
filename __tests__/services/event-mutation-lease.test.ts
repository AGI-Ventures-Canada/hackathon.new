import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createChainableMock,
  mockFrom,
  resetSupabaseMocks,
  setMockFromImplementation,
  type ChainableMock,
} from "../lib/supabase-mock"

const { withEventMutationLease } = await import(
  "@/lib/services/event-mutation-lease"
)

describe("event mutation lease", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("owns and releases the event lock around a mutation", async () => {
    const chains: ChainableMock[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({ data: null, error: null })
      chains.push(chain)
      return chain
    })
    const mutation = mock(() => Promise.resolve("saved"))

    await expect(withEventMutationLease("event-1", mutation)).resolves.toBe(
      "saved",
    )

    expect(mutation).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(chains[0]!.delete).toHaveBeenCalledTimes(1)
    expect(chains[0]!.eq).toHaveBeenCalledWith(
      "key",
      "event-mutation:event-1",
    )
    const insertCalls = chains[1]!.insert.mock.calls as unknown as Array<[{
      count: number
      key: string
      reset_at: number
    }]>
    const inserted = insertCalls[0]![0]
    expect(inserted.key).toBe("event-mutation:event-1")
    expect(inserted.reset_at).toBeGreaterThan(Date.now())
    expect(chains[2]!.delete).toHaveBeenCalledTimes(1)
    expect(chains[2]!.eq).toHaveBeenCalledWith("count", inserted.count)
  })

  it("returns a stable busy error when another lease owns the event", async () => {
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      return createChainableMock(
        call === 2
          ? { data: null, error: { message: "duplicate", code: "23505" } }
          : { data: null, error: null },
      )
    })
    const mutation = mock(() => Promise.resolve())

    await expect(withEventMutationLease("event-1", mutation)).rejects.toMatchObject({
      name: "EventMutationLeaseError",
      code: "event_busy",
      message: "Another event change is still being saved.",
    })
    expect(mutation).not.toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it("returns a stable unavailable error when lock storage fails", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: null,
        error: { message: "database unavailable" },
      }),
    )

    await expect(withEventMutationLease("event-1", async () => {})).rejects.toMatchObject({
      name: "EventMutationLeaseError",
      code: "lease_unavailable",
      message: "The event change lock is unavailable.",
    })
  })

  it("releases its lease when the mutation fails", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: null }),
    )

    await expect(
      withEventMutationLease("event-1", async () => {
        throw new Error("write failed")
      }),
    ).rejects.toThrow("write failed")
    expect(mockFrom).toHaveBeenCalledTimes(3)
  })
})

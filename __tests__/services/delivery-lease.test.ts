import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createChainableMock,
  mockFrom,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
} from "../lib/supabase-mock"

const { getUnresolvedEmailDecision, withDeliveryLease } = await import(
  "@/lib/services/delivery-lease"
)

describe("delivery lease", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("owns and releases a bounded delivery lease", async () => {
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({ data: null, error: null })
      chains.push(chain)
      return chain
    })
    const work = mock(() => Promise.resolve("sent"))

    await expect(withDeliveryLease("team:h1", work)).resolves.toEqual({
      acquired: true,
      value: "sent",
    })

    expect(work).toHaveBeenCalledTimes(1)
    const insert = chains[1]!.insert.mock.calls[0]![0] as {
      key: string
      count: number
      reset_at: number
    }
    expect(insert.key).toBe("delivery:team:h1")
    expect(insert.reset_at).toBeGreaterThan(Date.now())
    expect(chains[2]!.eq).toHaveBeenCalledWith("count", insert.count)
  })

  it("skips work owned by another worker and recovers storage errors", async () => {
    let call = 0
    setMockFromImplementation(() => {
      call++
      return createChainableMock(
        call === 2
          ? { data: null, error: { message: "duplicate", code: "23505" } }
          : { data: null, error: null },
      )
    })
    const work = mock(() => Promise.resolve())

    await expect(withDeliveryLease("team:h1", work)).resolves.toEqual({
      acquired: false,
    })
    expect(work).not.toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledTimes(2)

    resetSupabaseMocks()
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "offline" } }),
    )
    await expect(withDeliveryLease("team:h1", work)).rejects.toThrow(
      "delivery lock is unavailable",
    )
  })

  it("fails recipient resolution closed until the bounded retry budget is exhausted", async () => {
    setMockRpcImplementation(() => Promise.resolve({
      data: { allowed: true, remaining: 1, reset_at: Date.now() + 1_000 },
      error: null,
    }))
    await expect(getUnresolvedEmailDecision("winner:h1:v1")).resolves.toBe("retry")

    setMockRpcImplementation(() => Promise.resolve({
      data: { allowed: false, remaining: 0, reset_at: Date.now() + 1_000 },
      error: null,
    }))
    await expect(getUnresolvedEmailDecision("winner:h1:v1")).resolves.toBe("exhausted")

    setMockRpcImplementation(() => Promise.resolve({
      data: null,
      error: { message: "offline" },
    }))
    await expect(getUnresolvedEmailDecision("winner:h1:v1")).resolves.toBe("retry")
  })
})

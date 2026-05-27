import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  mockFrom,
  mockRpc,
  resetSupabaseMocks,
  setMockFromImplementation,
  createChainableMock,
} from "../lib/supabase-mock"

type RowLite = { id: string; storage_path: string }

let removeResult: {
  data: { name: string }[] | null
  error: { message: string } | null
} = { data: [], error: null }

const mockRemove = mock(() =>
  Promise.resolve({ data: removeResult.data, error: removeResult.error })
)
const mockStorageFrom = mock(() => ({ remove: mockRemove }))

mock.module("@/lib/db/client", () => ({
  supabase: () => ({
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
    storage: { from: mockStorageFrom },
  }),
}))

const { purgeExpiredExports } = await import(
  "@/lib/services/submission-exports"
)

function setSelectResult(rows: RowLite[] | null, error: { message: string } | null = null) {
  setMockFromImplementation(() =>
    createChainableMock({ data: rows, error })
  )
}

describe("purgeExpiredExports", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    removeResult = { data: [], error: null }
    mockRemove.mockClear()
    mockStorageFrom.mockClear()
  })

  it("returns zero counts when no candidates", async () => {
    setSelectResult([])
    const result = await purgeExpiredExports()
    expect(result.scanned).toBe(0)
    expect(result.storageDeleted).toBe(0)
    expect(result.rowsUpdated).toBe(0)
    expect(result.errors).toEqual([])
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("does NOT update DB when storage.remove returns an error", async () => {
    const rows: RowLite[] = [
      { id: "e1", storage_path: "h/e1/file.zip" },
      { id: "e2", storage_path: "h/e2/file.zip" },
    ]
    setSelectResult(rows)
    removeResult = { data: null, error: { message: "boom" } }

    const result = await purgeExpiredExports()

    expect(result.scanned).toBe(2)
    expect(result.storageDeleted).toBe(0)
    expect(result.rowsUpdated).toBe(0)
    expect(result.errors).toEqual(["storage_remove_failed: boom"])
    expect(mockRemove).toHaveBeenCalledTimes(1)
  })

  it("only expires rows whose storage paths were actually removed", async () => {
    const rows: RowLite[] = [
      { id: "e1", storage_path: "h/e1/file.zip" },
      { id: "e2", storage_path: "h/e2/file.zip" },
      { id: "e3", storage_path: "h/e3/file.zip" },
    ]
    setSelectResult(rows)
    removeResult = {
      data: [{ name: "h/e1/file.zip" }, { name: "h/e3/file.zip" }],
      error: null,
    }

    const result = await purgeExpiredExports()

    expect(result.scanned).toBe(3)
    expect(result.storageDeleted).toBe(2)
    expect(result.rowsUpdated).toBe(2)
    expect(result.errors).toEqual([])
  })

  it("records the select error and skips storage call", async () => {
    setSelectResult(null, { message: "select failed" })
    const result = await purgeExpiredExports()
    expect(result.errors).toEqual(["select_failed: select failed"])
    expect(mockRemove).not.toHaveBeenCalled()
  })
})

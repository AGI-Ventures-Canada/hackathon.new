import { describe, expect, it, mock } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  compensateResultPublication,
  readResultPublicationState,
  stageResultPublication,
} from "@/lib/services/result-publication"

type QueryResult = {
  data: unknown
  error: { message: string } | null
}

function query(result: QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of ["update", "select", "eq"]) {
    chain[method] = mock(() => chain)
  }
  chain.maybeSingle = mock(() => chain)
  chain.then = (resolve: (value: QueryResult) => unknown) => resolve(result)
  return chain
}

function clientWith(results: Record<string, QueryResult | Error>) {
  return {
    from: mock((table: string) => {
      const result = results[table]
      if (result instanceof Error) throw result
      return query(result ?? { data: null, error: null })
    }),
  } as unknown as SupabaseClient
}

const publishedAt = "2026-08-20T00:00:00.000Z"
const hackathon = {
  id: "hack_1",
  tenant_id: "tenant_1",
  status: "completed",
  results_published_at: publishedAt,
}

describe("result publication state", () => {
  it("stages only when at least one result row is updated", async () => {
    await expect(stageResultPublication(clientWith({
      hackathon_results: { data: [{ id: "result_1" }], error: null },
    }), "hack_1", publishedAt)).resolves.toEqual({ success: true })

    await expect(stageResultPublication(clientWith({
      hackathon_results: { data: [], error: null },
    }), "hack_1", publishedAt)).resolves.toEqual({
      success: false,
      error: "Failed to publish results",
    })

    await expect(stageResultPublication(clientWith({
      hackathon_results: { data: null, error: { message: "write failed" } },
    }), "hack_1", publishedAt)).resolves.toEqual({
      success: false,
      error: "Failed to publish results",
    })
  })

  it("compensates the exact publication and surfaces rollback failures", async () => {
    await expect(compensateResultPublication(clientWith({
      hackathon_results: { data: null, error: null },
    }), "hack_1", publishedAt)).resolves.toBeUndefined()

    await expect(compensateResultPublication(clientWith({
      hackathon_results: { data: null, error: { message: "write failed" } },
    }), "hack_1", publishedAt)).rejects.toThrow(
      "Failed to roll back result publication: write failed",
    )
  })

  it("recognizes a fully committed publication", async () => {
    await expect(readResultPublicationState(clientWith({
      hackathons: { data: hackathon, error: null },
      hackathon_results: {
        data: [
          { id: "result_1", published_at: publishedAt },
          { id: "result_2", published_at: publishedAt },
        ],
        error: null,
      },
    }), "hack_1", "tenant_1", publishedAt)).resolves.toEqual({
      state: "committed",
      hackathon,
    })
  })

  it("distinguishes a clean non-commit from ambiguous state", async () => {
    await expect(readResultPublicationState(clientWith({
      hackathons: { data: null, error: null },
      hackathon_results: { data: [{ id: "result_1", published_at: null }], error: null },
    }), "hack_1", "tenant_1", publishedAt)).resolves.toEqual({ state: "not_committed" })

    await expect(readResultPublicationState(clientWith({
      hackathons: {
        data: { ...hackathon, results_published_at: null },
        error: null,
      },
      hackathon_results: { data: [{ id: "result_1", published_at: null }], error: null },
    }), "hack_1", "tenant_1", publishedAt)).resolves.toEqual({ state: "not_committed" })

    await expect(readResultPublicationState(clientWith({
      hackathons: { data: hackathon, error: null },
      hackathon_results: { data: [{ id: "result_1", published_at: null }], error: null },
    }), "hack_1", "tenant_1", publishedAt)).resolves.toEqual({ state: "ambiguous" })
  })

  it("fails ambiguous on read errors, missing rows, or thrown queries", async () => {
    await expect(readResultPublicationState(clientWith({
      hackathons: { data: hackathon, error: { message: "read failed" } },
      hackathon_results: { data: [], error: null },
    }), "hack_1", "tenant_1", publishedAt)).resolves.toEqual({ state: "ambiguous" })

    await expect(readResultPublicationState(clientWith({
      hackathons: { data: hackathon, error: null },
      hackathon_results: { data: [], error: null },
    }), "hack_1", "tenant_1", publishedAt)).resolves.toEqual({ state: "ambiguous" })

    await expect(readResultPublicationState(clientWith({
      hackathons: new Error("connection failed"),
    }), "hack_1", "tenant_1", publishedAt)).resolves.toEqual({ state: "ambiguous" })
  })
})

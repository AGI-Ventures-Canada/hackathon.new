import { describe, expect, it } from "bun:test"
import { routeJudgeAssignments } from "@/lib/utils/judging-assignment-routing"
import type { PrizeJudgingStyle } from "@/lib/db/hackathon-types"

type Assignment = {
  id: string
  prizeId: string | null
  judgingStyle: PrizeJudgingStyle | null
}

function assignment(
  id: string,
  judgingStyle: PrizeJudgingStyle | null,
  prizeId: string | null = `${id}-prize`
): Assignment {
  return { id, judgingStyle, prizeId }
}

describe("routeJudgeAssignments", () => {
  it("routes every judge scoring style to its matching screen", () => {
    const routes = routeJudgeAssignments([
      assignment("legacy", null, null),
      assignment("weighted", "weighted_score", null),
      assignment("bucket", "bucket_sort"),
      assignment("gate", "gate_check"),
      assignment("pick", "judges_pick"),
      assignment("crowd", "crowd_vote"),
    ])

    expect(routes.scored.map((item) => item.id)).toEqual(["legacy", "weighted"])
    expect(routes.bucketGroups[0]?.[1].map((item) => item.id)).toEqual(["bucket"])
    expect(routes.gateGroups[0]?.[1].map((item) => item.id)).toEqual(["gate"])
    expect(routes.pickGroups[0]?.[1].map((item) => item.id)).toEqual(["pick"])
    expect(
      [
        ...routes.scored,
        ...routes.bucketGroups.flatMap(([, items]) => items),
        ...routes.gateGroups.flatMap(([, items]) => items),
        ...routes.pickGroups.flatMap(([, items]) => items),
      ].some((item) => item.id === "crowd")
    ).toBe(false)
  })

  it("keeps assignments grouped by prize", () => {
    const routes = routeJudgeAssignments([
      assignment("one", "bucket_sort", "prize-a"),
      assignment("two", "bucket_sort", "prize-a"),
      assignment("three", "bucket_sort", "prize-b"),
    ])

    expect(routes.bucketGroups).toHaveLength(2)
    expect(routes.bucketGroups[0]?.[0]).toBe("prize-a")
    expect(routes.bucketGroups[0]?.[1].map((item) => item.id)).toEqual(["one", "two"])
    expect(routes.bucketGroups[1]?.[0]).toBe("prize-b")
  })
})

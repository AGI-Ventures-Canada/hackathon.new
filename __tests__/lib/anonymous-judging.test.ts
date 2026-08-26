import { describe, expect, it } from "bun:test"
import {
  publicMemberNames,
  publicSubmitterName,
  publicTeamName,
} from "@/lib/utils/anonymous-judging"

describe("publicSubmitterName", () => {
  it("hides submitter identity while anonymous results are unpublished", () => {
    expect(
      publicSubmitterName(
        { anonymous_judging: true, results_published_at: null },
        "Private Team",
      ),
    ).toBe("Anonymous project")
  })

  it("keeps submitter identity hidden after results are published", () => {
    expect(
      publicSubmitterName(
        {
          anonymous_judging: true,
          results_published_at: "2026-08-25T12:00:00.000Z",
        },
        "Winning Team",
      ),
    ).toBe("Anonymous project")
  })

  it("keeps submitter identity for non-anonymous judging", () => {
    expect(
      publicSubmitterName(
        { anonymous_judging: false, results_published_at: null },
        "Open Team",
      ),
    ).toBe("Open Team")
  })

  it("hides team and member identities for anonymous judging", () => {
    const hackathon = {
      anonymous_judging: true,
      results_published_at: "2026-08-25T12:00:00.000Z",
    }

    expect(publicTeamName(hackathon, "Private Team")).toBeNull()
    expect(publicMemberNames(hackathon, ["Private Person"])).toEqual([])
  })
})

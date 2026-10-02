import { describe,expect,it } from "bun:test"
import { reviewResponseSchema,validateReviewResponse,reviewHasAnswers,reconcileReviewResponse,type ReviewSnapshot } from "@/lib/utils/judging-review"

const criterionId = "11111111-1111-4111-8111-111111111111"
const otherId = "22222222-2222-4222-8222-222222222222"
const snapshot = {
  response: { kind:"weighted_score",scores:{ [criterionId]:null },notes:"" },
  detail: { criteria:[{ id:criterionId,name:"Clarity",description:null,min_score:1,max_score:5,weight:1,category:null,currentScore:null,rubricLevels:[] }],buckets:[{ id:otherId,label:"Ready",description:null,level:1 }] },
  projects:[{ submissionId:otherId }],maxPicks:1,
} as unknown as ReviewSnapshot

describe("private judging review drafts",() => {
  it("accepts a partial draft but prevents publishing missing scores",() => {
    expect(validateReviewResponse(snapshot.response,snapshot,false)).toBeNull()
    expect(validateReviewResponse(snapshot.response,snapshot,true)).toContain("every category")
  })
  it("rejects scores for unassigned criteria even in drafts",() => {
    expect(validateReviewResponse({ kind:"weighted_score",scores:{[otherId]:4},notes:"" },snapshot,false)).toContain("changed")
  })
  it("rejects fractional, out-of-range, and unlisted rubric ratings",() => {
    for (const score of [0,6,2.5]) expect(validateReviewResponse({kind:"weighted_score",scores:{[criterionId]:score},notes:""},snapshot,true)).not.toBeNull()
    const withRubric = { ...snapshot,detail:{ ...snapshot.detail!,criteria:[{...snapshot.detail!.criteria[0],rubricLevels:[{id:otherId,level_number:1,label:"Needs work",description:null}]}] } }
    expect(validateReviewResponse({kind:"weighted_score",scores:{[criterionId]:3},notes:""},withRubric,true)).toContain("listed ratings")
  })
  it("treats a no answer as answered while leaving null unfinished",() => {
    const gate = {...snapshot,response:{kind:"gate_check",gates:{},notes:""} as const}
    expect(validateReviewResponse({kind:"gate_check",gates:{[criterionId]:false},notes:""},gate,true)).toBeNull()
    expect(validateReviewResponse({kind:"gate_check",gates:{[criterionId]:null},notes:""},gate,true)).toContain("every check")
    expect(reviewHasAnswers({kind:"gate_check",gates:{[criterionId]:false},notes:""})).toBe(true)
  })
  it("checks bucket membership before saving",() => {
    const bucket = {...snapshot,detail:{...snapshot.detail!,criteria:[]},response:{kind:"bucket_sort",bucketId:null,notes:""} as const}
    expect(validateReviewResponse({kind:"bucket_sort",bucketId:criterionId,notes:""},bucket,false)).toContain("changed")
    expect(validateReviewResponse({kind:"bucket_sort",bucketId:otherId,notes:""},bucket,true)).toBeNull()
  })
  it("allows empty pick drafts but enforces membership, uniqueness, and final choices",() => {
    const picks:ReviewSnapshot = {...snapshot,response:{kind:"judges_pick",rankedSubmissionIds:[],notes:""}}
    expect(validateReviewResponse({kind:"judges_pick",rankedSubmissionIds:[],notes:""},picks,false)).toBeNull()
    expect(validateReviewResponse({kind:"judges_pick",rankedSubmissionIds:[],notes:""},picks,true)).toContain("at least")
    expect(validateReviewResponse({kind:"judges_pick",rankedSubmissionIds:[otherId,otherId],notes:""},picks,true)).toContain("once")
    expect(validateReviewResponse({kind:"judges_pick",rankedSubmissionIds:[criterionId],notes:""},picks,true)).toContain("no longer assigned")
  })
  it("retains notes but removes obsolete choices on explicit scorecard recovery",() => {
    const latest = {...snapshot,submitted:snapshot.response}
    const recovered = reconcileReviewResponse({kind:"weighted_score",scores:{[criterionId]:3,[otherId]:5},notes:"Keep this note"},latest)
    expect(recovered).toEqual({kind:"weighted_score",scores:{[criterionId]:3},notes:"Keep this note"})
    const changed = {...latest,submitted:{kind:"gate_check",gates:{[criterionId]:null},notes:""} as const}
    expect(reconcileReviewResponse(recovered,changed)).toEqual({kind:"gate_check",gates:{[criterionId]:null},notes:"Keep this note"})
  })
  it("requires legacy bucket checks when the scorecard includes them",() => {
    const response = {kind:"bucket_sort",bucketId:otherId,notes:""} as const
    expect(validateReviewResponse(response,{...snapshot,response},true)).toContain("every check")
    expect(validateReviewResponse({...response,gates:{[criterionId]:false}},{...snapshot,response},true)).toBeNull()
  })
  it("bounds notes and validates identifiers before the database",() => {
    expect(reviewResponseSchema.safeParse({kind:"weighted_score",scores:{draft:3},notes:""}).success).toBe(false)
    expect(reviewResponseSchema.safeParse({kind:"weighted_score",scores:{},notes:"a".repeat(2001)}).success).toBe(false)
    expect(reviewHasAnswers({kind:"weighted_score",scores:{},notes:"Remember the demo"})).toBe(true)
  })
})

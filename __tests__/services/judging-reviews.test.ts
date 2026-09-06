import {beforeEach,describe,expect,it,mock} from "bun:test"
import {createChainableMock,resetSupabaseMocks,setMockFromImplementation,setMockRpcImplementation} from "../lib/supabase-mock"
import type {AssignmentDetail} from "@/lib/services/judging"
import type {ReviewResponse} from "@/lib/utils/judging-review"

const eventId = "11111111-1111-4111-8111-111111111111"
const assignmentId = "22222222-2222-4222-8222-222222222222"
const criterionId = "33333333-3333-4333-8333-333333333333"
const judgeId = "44444444-4444-4444-8444-444444444444"
const event = {id:eventId,results_published_at:null,anonymous_judging:false}
const ownership = {hackathonId:eventId,prizeId:null,submissionId:"project",isComplete:false,notes:"Submitted note"}
const detail = {id:assignmentId,notes:"Submitted note",isComplete:false,criteria:[{id:criterionId,name:"Clarity",min_score:0,max_score:10,currentScore:null,rubricLevels:[]}],existingGateResponses:[],buckets:[],existingBucketId:null,teamName:"Team"} as unknown as AssignmentDetail
const getPublicHackathon = mock(() => Promise.resolve<unknown>(event))
const verifyAssignmentOwnership = mock(() => Promise.resolve<unknown>(ownership))
const assertAssignmentWritable = mock(() => Promise.resolve({ok:true}))
const getAssignmentDetail = mock(() => Promise.resolve(detail))
const recalculateForAssignment = mock(() => Promise.resolve())
const calculatePrizeResults = mock(() => Promise.resolve())
const getActiveRoundFinalistIds = mock(() => Promise.resolve<string[] | null>(null))
const reconcileJudgingNotifications = mock(async (_eventId: string) => {})
mock.module("@/lib/services/judging-notifications", () => ({ reconcileJudgingNotifications }))
mock.module("@/lib/services/public-hackathons", () => ({getPublicHackathon}))
mock.module("@/lib/services/judging", () => ({verifyAssignmentOwnership,assertAssignmentWritable,getAssignmentDetail,recalculateForAssignment,calculatePrizeResults,getActiveRoundFinalistIds}))
mock.module("@/lib/services/judging-scope", () => ({getAssignmentScoringScope:mock(() => Promise.resolve({criteriaVersion:"v1",criteria:detail.criteria,prizeIds:[],scopeMode:"scoped"}))}))
mock.module("@/lib/services/event-mutation-lease", () => ({withEventMutationLease:(_id:string,fn:()=>Promise<unknown>) => fn()}))
const {getJudgingReview,saveJudgingReview,publishLegacyJudgingReview} = await import("@/lib/services/judging-reviews")
let draft: {revision:number,response:ReviewResponse|null,criteria_version:string}|null
let participant: {id:string}|null
let rpcCalls: Array<{name:string,args:Record<string,unknown>}>
const response:ReviewResponse = {kind:"weighted_score",scores:{[criterionId]:8},notes:"Draft note"}

beforeEach(() => {
 resetSupabaseMocks();draft=null;participant={id:judgeId};rpcCalls=[]
 reconcileJudgingNotifications.mockClear();reconcileJudgingNotifications.mockImplementation(async () => {})
 getActiveRoundFinalistIds.mockClear();getActiveRoundFinalistIds.mockResolvedValue(null)
 getPublicHackathon.mockResolvedValue(event);verifyAssignmentOwnership.mockResolvedValue(ownership);assertAssignmentWritable.mockResolvedValue({ok:true});getAssignmentDetail.mockResolvedValue(detail);recalculateForAssignment.mockClear()
 setMockFromImplementation((table) => createChainableMock({data:table === "hackathon_participants" ? participant : table === "judging_review_drafts" ? draft : null,error:null}))
 setMockRpcImplementation((name,args) => {rpcCalls.push({name,args:args ?? {}});draft={revision:Number(args?.p_expected_revision ?? 0)+1,response:args?.p_publish ? null : args?.p_response as ReviewResponse,criteria_version:"v1"};return {data:draft.revision,error:null}})
})

describe("versioned judging publication", () => {
 it("omits own-team ballot candidates and checks an eligible assignment",async () => {
   assertAssignmentWritable.mockClear()
   setMockFromImplementation((table) => createChainableMock({data:table === "hackathon_participants" ? {id:judgeId,team_id:"own-team"} : table === "prizes" ? {name:"Favorite",max_picks:2,round_id:null} : table === "judge_assignments" ? [
     {id:"own-assignment",submission:{id:"own-project",team_id:"own-team",title:"Own project"}},
     {id:"eligible-assignment",submission:{id:"eligible-project",team_id:"other-team",title:"Other project"}},
   ] : table === "judge_picks" ? [{submission_id:"own-project",rank:1,reason:null}] : null,error:null}))
   setMockRpcImplementation(() => ({data:"v1",error:null}))
   const result=await getJudgingReview("event","judge",{prizeId:criterionId})
   expect(result.projects.map((project) => project.submissionId)).toEqual(["eligible-project"])
   expect(result.submitted).toMatchObject({rankedSubmissionIds:[]})
   expect(assertAssignmentWritable).toHaveBeenCalledWith("eligible-assignment","judge",event)
 })
 it("limits an event-wide ballot to active finalists before checking access", async () => {
   getActiveRoundFinalistIds.mockResolvedValue(["finalist-project"])
   assertAssignmentWritable.mockClear()
   setMockFromImplementation((table) => createChainableMock({data:table === "hackathon_participants" ? {id:judgeId,team_id:null} : table === "prizes" ? {name:"Favorite",max_picks:2,round_id:null} : table === "judge_assignments" ? [
     {id:"previous-assignment",submission:{id:"previous-project",team_id:"previous-team",title:"Previous project"}},
     {id:"finalist-assignment",submission:{id:"finalist-project",team_id:"finalist-team",title:"Finalist project"}},
   ] : table === "judge_picks" ? [{submission_id:"previous-project",rank:1,reason:"My earlier notes"},{submission_id:"finalist-project",rank:2,reason:"My earlier notes"}] : null,error:null}))
   setMockRpcImplementation(() => ({data:"active-finalists-version",error:null}))
   const result = await getJudgingReview("event","judge",{prizeId:criterionId})
   expect(getActiveRoundFinalistIds).toHaveBeenCalledWith(eventId)
   expect(result.projects.map((project) => project.submissionId)).toEqual(["finalist-project"])
   expect(result.submitted).toEqual({kind:"judges_pick",rankedSubmissionIds:["finalist-project"],notes:"My earlier notes"})
   expect(result.criteriaVersion).toBe("active-finalists-version")
   expect(result.canEdit).toBe(true)
   expect(assertAssignmentWritable).toHaveBeenCalledTimes(1)
   expect(assertAssignmentWritable).toHaveBeenCalledWith("finalist-assignment","judge",event)
 })
 it("keeps a round-specific ballot independent from the event's current finalist pool", async () => {
   getActiveRoundFinalistIds.mockResolvedValue(["unrelated-finalist"])
   setMockFromImplementation((table) => createChainableMock({data:table === "hackathon_participants" ? {id:judgeId,team_id:null} : table === "prizes" ? {name:"First round favorite",max_picks:1,round_id:"first-round"} : table === "judge_assignments" ? [
     {id:"round-assignment",submission:{id:"round-project",team_id:"round-team",title:"Round project"}},
   ] : table === "judge_picks" ? [] : null,error:null}))
   setMockRpcImplementation(() => ({data:"v1",error:null}))
   const result = await getJudgingReview("event","judge",{prizeId:criterionId})
   expect(getActiveRoundFinalistIds).not.toHaveBeenCalled()
   expect(result.projects.map((project) => project.submissionId)).toEqual(["round-project"])
 })
 it("does not fall back to every project when the active finalist pool cannot be loaded", async () => {
   getActiveRoundFinalistIds.mockRejectedValue(new Error("Database unavailable"))
   assertAssignmentWritable.mockClear()
   setMockFromImplementation((table) => createChainableMock({data:table === "hackathon_participants" ? {id:judgeId,team_id:null} : table === "prizes" ? {name:"Favorite",max_picks:1,round_id:null} : table === "judge_assignments" ? [
     {id:"round-assignment",submission:{id:"round-project",team_id:"round-team",title:"Round project"}},
   ] : table === "judge_picks" ? [] : null,error:null}))
   setMockRpcImplementation(() => ({data:"v1",error:null}))
   await expect(getJudgingReview("event","judge",{prizeId:criterionId})).rejects.toMatchObject({code:"unavailable",status:503})
   expect(assertAssignmentWritable).not.toHaveBeenCalled()
 })
 it("loads only the authenticated judge's draft and retains published notes", async () => {
   draft={revision:2,response,criteria_version:"v1"}
   const result=await getJudgingReview("event","judge",{assignmentId})
   expect(result.response.notes).toBe("Draft note");expect(result.submitted.notes).toBe("Submitted note");expect(result.revision).toBe(2)
 })
 it("rejects malformed IDs and non-judges",async () => {
   await expect(getJudgingReview("event","judge",{assignmentId:"draft"})).rejects.toMatchObject({status:404})
   participant=null
   await expect(getJudgingReview("event","stranger",{assignmentId})).rejects.toMatchObject({status:404})
 })
 it("rejects cross-event assignment ownership",async () => {
   verifyAssignmentOwnership.mockResolvedValue({...ownership,hackathonId:"other"})
   await expect(getJudgingReview("event","judge",{assignmentId})).rejects.toMatchObject({status:404})
 })
 it("stores a partial draft without publishing or recalculating results",async () => {
   const partial:ReviewResponse={kind:"weighted_score",scores:{[criterionId]:null},notes:"In progress"}
   const result=await saveJudgingReview("event","judge",{assignmentId},{expectedRevision:0,criteriaVersion:"v1",response:partial})
   expect(rpcCalls).toHaveLength(1);expect(rpcCalls[0].args).toMatchObject({p_clerk_user_id:"judge",p_judge_id:judgeId,p_publish:false,p_assignment_id:assignmentId})
   expect(result.hasDraft).toBe(true);expect(recalculateForAssignment).not.toHaveBeenCalled()
   expect(reconcileJudgingNotifications).not.toHaveBeenCalled()
 })
 it("rejects a stale draft revision or changed scorecard before writing",async () => {
   for(const input of [{expectedRevision:2,criteriaVersion:"v1"},{expectedRevision:0,criteriaVersion:"old"}]) await expect(saveJudgingReview("event","judge",{assignmentId},{...input,response})).rejects.toMatchObject({code:"review_changed",status:409})
   expect(rpcCalls).toHaveLength(0)
 })
 it("requires every score before publication",async () => {
   await expect(saveJudgingReview("event","judge",{assignmentId},{expectedRevision:0,criteriaVersion:"v1",response:{...response,scores:{}}},true)).rejects.toMatchObject({code:"invalid_response"})
   expect(rpcCalls).toHaveLength(0)
 })
 it("rejects writes once the effective judging window closes",async () => {
   assertAssignmentWritable.mockResolvedValue({ok:false})
   await expect(saveJudgingReview("event","judge",{assignmentId},{expectedRevision:0,criteriaVersion:"v1",response})).rejects.toMatchObject({code:"judging_closed",status:409})
   expect(rpcCalls).toHaveLength(0)
 })
 it("maps a concurrent SQL revision conflict without recalculating",async () => {
   setMockRpcImplementation(() => ({data:null,error:{message:"scorecard_changed: scope changed"}}))
   await expect(saveJudgingReview("event","judge",{assignmentId},{expectedRevision:0,criteriaVersion:"v1",response},true)).rejects.toMatchObject({code:"review_changed",status:409})
   expect(recalculateForAssignment).not.toHaveBeenCalled()
   expect(reconcileJudgingNotifications).not.toHaveBeenCalled()
 })
 it("keeps a SQL window closure distinct from a scorecard conflict",async () => {
   setMockRpcImplementation(() => ({data:null,error:{message:"judging_closed"}}))
   await expect(saveJudgingReview("event","judge",{assignmentId},{expectedRevision:0,criteriaVersion:"v1",response})).rejects.toMatchObject({code:"judging_closed",status:409})
   expect(recalculateForAssignment).not.toHaveBeenCalled()
 })
 it("publishes once and recalculates only after atomic success",async () => {
   await saveJudgingReview("event","judge",{assignmentId},{expectedRevision:0,criteriaVersion:"v1",response},true)
   expect(rpcCalls[0].args.p_publish).toBe(true);expect(recalculateForAssignment).toHaveBeenCalledWith(assignmentId)
   expect(reconcileJudgingNotifications).toHaveBeenCalledWith(eventId)
 })
 it("waits for the inbox after committing, and preserves success if inbox delivery needs retry", async () => {
   reconcileJudgingNotifications.mockImplementation(async () => {
     expect(rpcCalls[0].name).toBe("save_judging_review_atomic")
     expect(rpcCalls[0].args.p_publish).toBe(true)
     throw new Error("Temporary inbox outage")
   })
   const result = await saveJudgingReview("event", "judge", { assignmentId }, { expectedRevision: 0, criteriaVersion: "v1", response }, true)
   expect(result.revision).toBe(1)
   expect(result.hasDraft).toBe(false)
   expect(rpcCalls).toHaveLength(1)
 })
 it("returns the confirmed save without depending on another post-commit read", async () => {
   getPublicHackathon.mockClear()
   setMockRpcImplementation((name, args) => {
     rpcCalls.push({ name, args: args ?? {} })
     getPublicHackathon.mockImplementation(async () => { throw new Error("Refresh unavailable") })
     return { data: 1, error: null }
   })
   const result = await saveJudgingReview("event", "judge", { assignmentId }, { expectedRevision: 0, criteriaVersion: "v1", response }, true)
   expect(result).toMatchObject({ revision: 1, response, submitted: response, isComplete: true, hasDraft: false })
   expect(result.detail).toMatchObject({ isComplete: true, notes: response.notes, criteria: [{ id: criterionId, currentScore: 8 }] })
   expect(rpcCalls).toHaveLength(1)
   expect(getPublicHackathon).toHaveBeenCalledTimes(1)
 })
 it("keeps the caller's commit revision when another tab saves before the response returns", async () => {
   setMockRpcImplementation((name, args) => {
     rpcCalls.push({ name, args: args ?? {} })
     draft = { revision: 2, response: { ...response, notes: "A newer note from another tab" }, criteria_version: "v1" }
     return { data: 1, error: null }
   })
   const result = await saveJudgingReview("event", "judge", { assignmentId }, { expectedRevision: 0, criteriaVersion: "v1", response })
   expect(result).toMatchObject({ revision: 1, response, hasDraft: true })
   await expect(saveJudgingReview("event", "judge", { assignmentId }, { expectedRevision: result.revision, criteriaVersion: result.criteriaVersion, response })).rejects.toMatchObject({ code: "review_changed", status: 409 })
   expect(rpcCalls).toHaveLength(1)
 })
 it("preserves notes from legacy clients that omit them and refuses to overwrite drafts",async () => {
   await publishLegacyJudgingReview("event","judge",{assignmentId},{kind:"weighted_score",scores:{[criterionId]:8}})
   expect(rpcCalls[0].args.p_response).toMatchObject({notes:"Submitted note"})
   expect(reconcileJudgingNotifications).toHaveBeenCalledTimes(1)
   draft={revision:2,response,criteria_version:"v1"}
   await expect(publishLegacyJudgingReview("event","judge",{assignmentId},{kind:"weighted_score",scores:{[criterionId]:9}})).rejects.toMatchObject({code:"review_changed",status:409})
   expect(rpcCalls).toHaveLength(1)
 })
})

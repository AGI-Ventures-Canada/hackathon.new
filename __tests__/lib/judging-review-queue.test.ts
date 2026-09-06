import { describe,expect,it } from "bun:test"
import { buildJudgeReviewTasks } from "@/lib/utils/judging-review-queue"
import type { JudgeAssignmentForJudge } from "@/lib/services/judging"

const assignment = (id:string,overrides:Partial<JudgeAssignmentForJudge> = {}):JudgeAssignmentForJudge => ({id,submissionId:`project-${id}`,submissionTitle:`Project ${id}`,submissionDescription:null,submissionGithubUrl:null,submissionLiveAppUrl:null,submissionDemoVideoUrl:null,submissionScreenshotUrl:null,teamName:null,teamMode:null,teamMemberCount:null,isComplete:false,notes:"",viewedAt:null,prizeId:null,prizeName:null,judgingStyle:"weighted_score",maxPicks:null,selfJudging:false,assignmentKind:"unified_weighted_score",...overrides})

describe("judge review queue",() => {
  it("counts a ranked prize ballot once instead of counting every candidate as a review",() => {
    const tasks = buildJudgeReviewTasks([assignment("a",{judgingStyle:"judges_pick",prizeId:"prize"}),assignment("b",{judgingStyle:"judges_pick",prizeId:"prize"}),assignment("c")])
    expect(tasks).toHaveLength(2)
    expect(tasks[0].assignmentIds).toEqual(["a","b"])
    expect(tasks[0].projectCount).toBe(2)
  })
  it("keeps different prize ballots separate",() => {
    expect(buildJudgeReviewTasks([assignment("a",{judgingStyle:"judges_pick",prizeId:"one"}),assignment("b",{judgingStyle:"judges_pick",prizeId:"two"})])).toHaveLength(2)
  })
  it("shows saved drafts in progress without claiming submission",() => {
    const [task] = buildJudgeReviewTasks([assignment("a")],["a"])
    expect(task.started).toBe(true)
    expect(task.isComplete).toBe(false)
  })
  it("preserves submitted state when a revision has a draft",() => {
    const [task] = buildJudgeReviewTasks([assignment("a",{isComplete:true})],["a"])
    expect(task.started).toBe(true)
    expect(task.isComplete).toBe(true)
  })
  it("does not carry removed assignment counts into refreshed queues",() => {
    expect(buildJudgeReviewTasks([assignment("b")],["removed"])).toHaveLength(1)
    expect(buildJudgeReviewTasks([assignment("b")],["removed"])[0].started).toBe(false)
  })
})

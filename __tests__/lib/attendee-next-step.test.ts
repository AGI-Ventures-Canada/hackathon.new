import { describe, expect, it } from "bun:test"
import { getAttendeeNextStep } from "@/lib/utils/attendee-next-step"
const base = { status: "registration_open" as const, teamStatus: "forming", hasTeam: true, allowSolo: true, submitted: false, deadlinePassed: false, resultsPublished: false }
describe("attendee next steps", () => {
  it("explains what happens before the event", () => expect(getAttendeeNextStep(base)).toContain("email you before"))
  it("gives teamless attendees a way forward", () => expect(getAttendeeNextStep({ ...base, hasTeam: false })).toContain("send you an invite"))
  it("does not suggest going solo when teams are required", () => expect(getAttendeeNextStep({ ...base, hasTeam: false, allowSolo: false })).toContain("contact the organizer"))
  it("explains approval without blocking preparation", () => expect(getAttendeeNextStep({ ...base, teamStatus: "pending_approval" })).toContain("prepare your project"))
  it("directs active attendees to the submit control", () => expect(getAttendeeNextStep({ ...base, status: "active" })).toContain("Submit Project"))
  it("confirms submitted projects", () => expect(getAttendeeNextStep({ ...base, submitted: true })).toContain("is submitted"))
  it("does not ask for late submissions", () => expect(getAttendeeNextStep({ ...base, deadlinePassed: true })).toContain("deadline has passed"))
  it("explains judging", () => expect(getAttendeeNextStep({ ...base, status: "judging" })).toContain("reviewing"))
  it("puts published results first", () => expect(getAttendeeNextStep({ ...base, status: "completed", resultsPublished: true })).toContain("results are ready"))
  it("explains completion without implying results were published", () => expect(getAttendeeNextStep({ ...base, status: "completed" })).toContain("Watch your email"))
  it("helps a disbanded team", () => expect(getAttendeeNextStep({ ...base, teamStatus: "disbanded" })).toContain("joining another team"))
})

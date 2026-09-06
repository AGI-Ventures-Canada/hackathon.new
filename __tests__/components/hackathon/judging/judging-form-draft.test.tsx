import { beforeEach, afterEach, describe, expect, it } from "bun:test"
import { act,cleanup,renderHook } from "@testing-library/react"
import { useJudgingFormDraft } from "@/hooks/use-judging-form-draft"
import { setClerkAuth } from "@/__tests__/lib/component-mocks"

beforeEach(() => {localStorage.clear(); setClerkAuth({userId:"draft-owner",isSignedIn:true})})
afterEach(cleanup)

describe("organizer judging drafts", () => {
  it("recovers edits across step unmounts and clears only after save", () => {
    const first = renderHook(() => useJudgingFormDraft("event","prize",{name:""}))
    act(() => first.result.current[1]({name:"Community prize"}))
    first.unmount()
    const second = renderHook(() => useJudgingFormDraft("event","prize",{name:""}))
    expect(second.result.current[0].name).toBe("Community prize")
    expect(second.result.current[3]).toBe(true)
    act(() => second.result.current[2]())
    expect(second.result.current[0].name).toBe("")
    expect(second.result.current[3]).toBe(false)
  })
  it("isolates drafts by signed-in organizer, event, and form", () => {
    const first = renderHook(() => useJudgingFormDraft("private-event","invites",{emails:""}))
    act(() => first.result.current[1]({emails:"private@example.com"}))
    first.unmount()
    const otherEvent = renderHook(() => useJudgingFormDraft("other-event","invites",{emails:""}))
    expect(otherEvent.result.current[0].emails).toBe("")
    otherEvent.unmount()
    setClerkAuth({userId:"different-owner"})
    const otherOwner = renderHook(() => useJudgingFormDraft("private-event","invites",{emails:""}))
    expect(otherOwner.result.current[0].emails).toBe("")
  })
  it("merges sequential field changes before rerender", () => {
    const {result} = renderHook(() => useJudgingFormDraft("event","dates",{opens:"",closes:""}))
    act(() => {
      result.current[1]((current) => ({...current,opens:"09:00"}))
      result.current[1]((current) => ({...current,closes:"11:00"}))
    })
    expect(result.current[0]).toEqual({opens:"09:00",closes:"11:00"})
  })
})

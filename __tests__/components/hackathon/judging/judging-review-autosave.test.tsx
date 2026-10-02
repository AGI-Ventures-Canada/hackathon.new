import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { useJudgingReview } from "@/hooks/use-judging-review"
import type { ReviewResponse, ReviewSnapshot } from "@/lib/utils/judging-review"

const originalFetch = globalThis.fetch
const empty: ReviewResponse = { kind: "weighted_score", scores: {}, notes: "" }
const base = { targetId: "project", judgeId: "judge", revision: 0, criteriaVersion: "v1", response: empty, submitted: empty, hasDraft: false, isComplete: false, canEdit: true, detail: { criteria: [], buckets: [] }, projects: [], maxPicks: 0, prizeName: null } as unknown as ReviewSnapshot
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: {"Content-Type":"application/json"} })
const changeNotes = (notes: string): ReviewResponse => ({...empty, notes})
function deferred<T>() { let resolve!: (value:T) => void; const promise = new Promise<T>((done) => { resolve = done }); return {promise,resolve} }

beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator,"onLine",{configurable:true,value:true}) })
afterEach(() => { cleanup(); globalThis.fetch = originalFetch })

describe("judge autosave safety", () => {
  it("does not recreate a browser draft when leaving a submitted review", async () => {
    globalThis.fetch = mock(() => Promise.resolve(reply({...base,isComplete:true}))) as typeof fetch
    const {result,unmount} = renderHook(() => useJudgingReview("event","project"))
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    unmount()
    expect(localStorage.getItem("judging-review:v1:judge:event:project:project")).toBeNull()
  })
  it("serializes saves and never replaces newer notes with an older response", async () => {
    const first = deferred<Response>()
    const requests: Array<{expectedRevision:number,response:ReviewResponse}> = []
    globalThis.fetch = mock((_url,init) => {
      if (init?.method === "GET") return Promise.resolve(reply(base))
      const body = JSON.parse(String(init?.body)); requests.push(body)
      return requests.length === 1 ? first.promise : Promise.resolve(reply({...base,revision:2,response:body.response,hasDraft:true}))
    }) as typeof fetch
    const {result} = renderHook(() => useJudgingReview("event","project"))
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    act(() => result.current.change(changeNotes("First")))
    let saving!: Promise<boolean>
    act(() => { saving = result.current.flush() })
    act(() => result.current.change(changeNotes("Latest notes")))
    await act(async () => { first.resolve(reply({...base,revision:1,response:changeNotes("First"),hasDraft:true})); await saving })
    expect(requests.map((request) => request.expectedRevision)).toEqual([0,1])
    expect(requests[1].response.notes).toBe("Latest notes")
    expect(result.current.response?.notes).toBe("Latest notes")
    expect(result.current.status).toBe("saved")
  })
  it("keeps offline notes and saves them when the connection returns", async () => {
    globalThis.fetch = mock((_url,init) => Promise.resolve(reply(init?.method === "GET" ? base : {...base,revision:1,response:changeNotes("Offline note"),hasDraft:true}))) as typeof fetch
    const {result} = renderHook(() => useJudgingReview("event","project"))
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    Object.defineProperty(navigator,"onLine",{configurable:true,value:false})
    act(() => result.current.change(changeNotes("Offline note")))
    await act(async () => { expect(await result.current.flush()).toBe(false) })
    expect(result.current.status).toBe("offline")
    expect(localStorage.getItem("judging-review:v1:judge:event:project:project")).toContain("Offline note")
    Object.defineProperty(navigator,"onLine",{configurable:true,value:true})
    act(() => window.dispatchEvent(new Event("online")))
    await waitFor(() => expect(result.current.status).toBe("saved"))
    expect(localStorage.getItem("judging-review:v1:judge:event:project:project")).toBeNull()
  })
  it("pauses on another tab's revision and requires an explicit reload before retrying", async () => {
    let reads = 0, writes = 0
    globalThis.fetch = mock((_url,init) => {
      if (init?.method === "GET") return Promise.resolve(reply({...base,revision:reads++ ? 5 : 0}))
      writes++
      return Promise.resolve(writes === 1 ? reply({error:"Review changed"},409) : reply({...base,revision:6,response:changeNotes("My notes"),hasDraft:true}))
    }) as typeof fetch
    const {result} = renderHook(() => useJudgingReview("event","project"))
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    act(() => result.current.change(changeNotes("My notes")))
    await act(async () => { await result.current.flush() })
    expect(result.current.status).toBe("conflict")
    await act(async () => { expect(await result.current.submit()).toBe(false) })
    expect(writes).toBe(1)
    await act(async () => { await result.current.reload() })
    expect(result.current.response?.notes).toBe("My notes")
    expect(result.current.snapshot?.revision).toBe(5)
    await act(async () => { await result.current.flush() })
    expect(writes).toBe(2)
  })
  it("flushes the final draft revision before explicit publication", async () => {
    const requests: Array<{method:string,revision:number}> = []
    globalThis.fetch = mock((_url,init) => {
      if (init?.method === "GET") return Promise.resolve(reply(base))
      const body = JSON.parse(String(init?.body)); requests.push({method:init!.method!,revision:body.expectedRevision})
      return Promise.resolve(reply({...base,revision:requests.length,response:body.response,isComplete:init?.method === "POST",hasDraft:init?.method !== "POST"}))
    }) as typeof fetch
    const {result} = renderHook(() => useJudgingReview("event","project"))
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    act(() => result.current.change(changeNotes("Final notes")))
    await act(async () => { expect(await result.current.submit()).toBe(true) })
    expect(requests).toEqual([{method:"PATCH",revision:0},{method:"POST",revision:1}])
    expect(result.current.snapshot?.isComplete).toBe(true)
  })
  it("refreshes judging progress only after a successful publication", async () => {
    const progressChanged = mock(() => {})
    window.addEventListener("judging-progress-changed", progressChanged)
    let failPublication = true
    globalThis.fetch = mock((_url, init) => {
      if (init?.method === "GET") return Promise.resolve(reply(base))
      const body = JSON.parse(String(init?.body))
      if (init?.method === "POST" && failPublication) return Promise.resolve(reply({ error: "Try again.", code: "save_failed" }, 503))
      return Promise.resolve(reply({ ...base, revision: init?.method === "POST" ? 2 : 1, response: body.response, hasDraft: init?.method !== "POST", isComplete: init?.method === "POST" }))
    }) as typeof fetch
    try {
      const { result } = renderHook(() => useJudgingReview("event", "project"))
      await waitFor(() => expect(result.current.snapshot).not.toBeNull())
      act(() => result.current.change(changeNotes("Final notes")))
      await act(async () => { expect(await result.current.flush()).toBe(true) })
      expect(progressChanged).not.toHaveBeenCalled()
      await act(async () => { expect(await result.current.submit()).toBe(false) })
      expect(progressChanged).not.toHaveBeenCalled()
      failPublication = false
      await act(async () => { expect(await result.current.submit()).toBe(true) })
      expect(progressChanged).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener("judging-progress-changed", progressChanged)
    }
  })
  it("keeps a draft when judging closes without calling it a revision conflict", async () => {
    let open = true, writes = 0
    globalThis.fetch = mock((_url, init) => {
      if (init?.method === "GET") return Promise.resolve(reply({ ...base, canEdit: open, editReason: open ? null : "Judging is closed." }))
      writes++
      return Promise.resolve(writes === 1
        ? reply({ error: "Judging is closed. Your draft is still here.", code: "judging_closed" }, 409)
        : reply({ ...base, revision: 1, response: changeNotes("Keep my notes"), hasDraft: true }))
    }) as typeof fetch
    const { result } = renderHook(() => useJudgingReview("event", "project"))
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    act(() => result.current.change(changeNotes("Keep my notes")))
    await act(async () => { expect(await result.current.flush()).toBe(false) })
    expect(result.current.status).toBe("closed")
    expect(result.current.snapshot?.canEdit).toBe(false)
    expect(result.current.error).toContain("Judging is closed")
    expect(localStorage.getItem("judging-review:v1:judge:event:project:project")).toContain("Keep my notes")
    open = false
    await act(async () => { await result.current.reload(); expect(await result.current.flush()).toBe(false) })
    expect(writes).toBe(1)
    open = true
    await act(async () => { await result.current.reload(); expect(await result.current.flush()).toBe(true) })
    expect(result.current.status).toBe("saved")
    expect(result.current.response?.notes).toBe("Keep my notes")
    expect(writes).toBe(2)
  })

  it("reports a deadline closing during publication without marking the review submitted", async () => {
    globalThis.fetch = mock((_url, init) => Promise.resolve(init?.method === "GET" ? reply(base)
      : init?.method === "PATCH" ? reply({ ...base, revision: 1, hasDraft: true, response: changeNotes("Last note") })
        : reply({ error: "Judging is closed.", code: "judging_closed" }, 409))) as typeof fetch
    const { result } = renderHook(() => useJudgingReview("event", "project"))
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    act(() => result.current.change(changeNotes("Last note")))
    await act(async () => { expect(await result.current.submit()).toBe(false) })
    expect(result.current.status).toBe("closed")
    expect(result.current.snapshot).toMatchObject({ canEdit: false, isComplete: false, hasDraft: true })
    expect(result.current.response?.notes).toBe("Last note")
  })
  it("never restores a different judge's browser draft", async () => {
    localStorage.setItem("judging-review:v1:other:event:project:project",JSON.stringify({revision:0,criteriaVersion:"v1",response:changeNotes("Private other judge note")}))
    globalThis.fetch = mock(() => Promise.resolve(reply(base))) as typeof fetch
    const {result} = renderHook(() => useJudgingReview("event","project"))
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    expect(result.current.response?.notes).toBe("")
  })
})

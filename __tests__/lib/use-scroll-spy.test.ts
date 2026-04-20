import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { renderHook, act } from "@testing-library/react"

type ObserverInstance = {
  callback: IntersectionObserverCallback
  options: IntersectionObserverInit | undefined
  observed: Element[]
  disconnected: boolean
}

const observers: ObserverInstance[] = []

class MockIntersectionObserver {
  instance: ObserverInstance

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.instance = { callback, options, observed: [], disconnected: false }
    observers.push(this.instance)
  }
  observe(el: Element) {
    this.instance.observed.push(el)
  }
  unobserve() {}
  disconnect() {
    this.instance.disconnected = true
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

let originalIO: typeof IntersectionObserver | undefined

beforeEach(() => {
  originalIO = g.IntersectionObserver
  g.IntersectionObserver = MockIntersectionObserver
  observers.length = 0
  document.body.innerHTML = ""
})

afterEach(() => {
  g.IntersectionObserver = originalIO
})

const { useScrollSpy } = await import("@/hooks/use-scroll-spy")

function addSection(id: string, top = 0): HTMLElement {
  const el = document.createElement("section")
  el.id = id
  Object.defineProperty(el, "id", { value: id, writable: false })
  document.body.appendChild(el)
  // Provide a stable getBoundingClientRect for sort ordering
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + 100,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}

function entry(el: Element, isIntersecting: boolean, top: number): IntersectionObserverEntry {
  return {
    target: el,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: { top, bottom: top + 100, left: 0, right: 0, width: 0, height: 100 } as DOMRect,
    intersectionRect: {} as DOMRect,
    rootBounds: null,
    time: 0,
  }
}

describe("useScrollSpy", () => {
  it("returns the first id as the initial active value", () => {
    addSection("one")
    addSection("two")
    const { result } = renderHook(() => useScrollSpy(["one", "two"]))
    expect(result.current).toBe("one")
  })

  it("updates to the topmost intersecting section", () => {
    const one = addSection("one", 200)
    const two = addSection("two", 50)
    const three = addSection("three", 400)
    const { result } = renderHook(() => useScrollSpy(["one", "two", "three"]))

    act(() => {
      observers[0].callback(
        [entry(one, true, 200), entry(two, true, 50), entry(three, false, 400)],
        {} as IntersectionObserver,
      )
    })

    expect(result.current).toBe("two")
  })

  it("ignores entries that are not intersecting", () => {
    const one = addSection("one", 200)
    const two = addSection("two", 50)
    const { result } = renderHook(() => useScrollSpy(["one", "two"]))

    act(() => {
      observers[0].callback(
        [entry(one, true, 200), entry(two, false, 50)],
        {} as IntersectionObserver,
      )
    })

    expect(result.current).toBe("one")
  })

  it("keeps the previous active id when no entries intersect", () => {
    addSection("one")
    addSection("two")
    const { result } = renderHook(() => useScrollSpy(["one", "two"]))

    const initial = result.current

    act(() => {
      observers[0].callback([], {} as IntersectionObserver)
    })

    expect(result.current).toBe(initial)
  })

  it("does not create an observer when ids is empty", () => {
    const { result } = renderHook(() => useScrollSpy([]))
    expect(result.current).toBeNull()
    expect(observers.length).toBe(0)
  })

  it("does not create an observer when no ids resolve to DOM elements", () => {
    const { result } = renderHook(() => useScrollSpy(["missing"]))
    expect(result.current).toBe("missing")
    expect(observers.length).toBe(0)
  })

  it("disconnects the observer on unmount", () => {
    addSection("one")
    const { unmount } = renderHook(() => useScrollSpy(["one"]))

    expect(observers[0].disconnected).toBe(false)
    unmount()
    expect(observers[0].disconnected).toBe(true)
  })

  it("passes the default rootMargin to the observer", () => {
    addSection("one")
    renderHook(() => useScrollSpy(["one"]))
    expect(observers[0].options?.rootMargin).toBe("-80px 0px -60% 0px")
  })

  it("passes a custom rootMargin when provided", () => {
    addSection("one")
    renderHook(() => useScrollSpy(["one"], { rootMargin: "0px" }))
    expect(observers[0].options?.rootMargin).toBe("0px")
  })

  it("only observes the elements whose ids exist in the DOM", () => {
    addSection("one")
    addSection("three")
    renderHook(() => useScrollSpy(["one", "missing", "three"]))
    expect(observers[0].observed).toHaveLength(2)
  })
})

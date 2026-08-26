import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { hydrateRoot, type Root } from "react-dom/client"
import { JudgingSetupWizard } from "@/components/hackathon/judging/judging-setup-wizard"

const props = {
  hackathonId: "hydration-event",
  slug: "hydration-event",
  prizes: [],
  judges: [],
  rounds: [],
  pendingInvitations: [],
}

let hydratedRoot: Root | null = null

function setSetupRoute() {
  const state = (globalThis as typeof globalThis & {
    __nextNavState: { searchParams: URLSearchParams }
  }).__nextNavState
  state.searchParams = new URLSearchParams("jtab=setup")
}

async function hydrate(serverHtml: string, onRecoverableError: (error: unknown) => void) {
  const container = document.createElement("div")
  container.innerHTML = serverHtml
  document.body.appendChild(container)
  await act(async () => {
    hydratedRoot = hydrateRoot(container, <JudgingSetupWizard {...props} />, {
      onRecoverableError,
    })
  })
  return container
}

beforeEach(() => {
  cleanup()
  sessionStorage.clear()
  setSetupRoute()
})

afterEach(async () => {
  if (hydratedRoot) {
    await act(async () => hydratedRoot?.unmount())
    hydratedRoot = null
  }
  cleanup()
  document.body.innerHTML = ""
  sessionStorage.clear()
})

describe("JudgingSetupWizard session step", () => {
  it("hydrates with the server step before restoring a saved step", async () => {
    const serverHtml = renderToString(<JudgingSetupWizard {...props} />)
    expect(serverHtml).toContain("How many rounds of judging?")

    sessionStorage.setItem(`wizard-step-${props.hackathonId}`, "4")
    const recoverableErrors: unknown[] = []
    await hydrate(serverHtml, (error) => recoverableErrors.push(error))

    await waitFor(() => {
      expect(screen.getByText("Which judges evaluate which prizes?")).toBeDefined()
    })
    expect(recoverableErrors).toEqual([])
  })

  it("ignores invalid saved steps", async () => {
    const serverHtml = renderToString(<JudgingSetupWizard {...props} />)
    sessionStorage.setItem(`wizard-step-${props.hackathonId}`, "99")
    const recoverableErrors: unknown[] = []

    await hydrate(serverHtml, (error) => recoverableErrors.push(error))

    expect(screen.getByText("How many rounds of judging?")).toBeDefined()
    expect(recoverableErrors).toEqual([])
  })

  it("ignores fractional saved steps", async () => {
    const serverHtml = renderToString(<JudgingSetupWizard {...props} />)
    sessionStorage.setItem(`wizard-step-${props.hackathonId}`, "2.5")
    const recoverableErrors: unknown[] = []

    await hydrate(serverHtml, (error) => recoverableErrors.push(error))

    expect(screen.getByText("How many rounds of judging?")).toBeDefined()
    expect(recoverableErrors).toEqual([])
  })

  it("ignores unreadable saved steps", async () => {
    const serverHtml = renderToString(<JudgingSetupWizard {...props} />)
    const getItem = spyOn(sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable")
    })
    const recoverableErrors: unknown[] = []

    await hydrate(serverHtml, (error) => recoverableErrors.push(error))
    getItem.mockRestore()

    expect(screen.getByText("How many rounds of judging?")).toBeDefined()
    expect(recoverableErrors).toEqual([])
  })

  it("resets the saved step when switching events", async () => {
    const serverHtml = renderToString(<JudgingSetupWizard {...props} />)
    sessionStorage.setItem(`wizard-step-${props.hackathonId}`, "4")
    await hydrate(serverHtml, () => {})
    await waitFor(() => {
      expect(screen.getByText("Which judges evaluate which prizes?")).toBeDefined()
    })

    await act(async () => {
      hydratedRoot?.render(
        <JudgingSetupWizard
          {...props}
          hackathonId="next-hydration-event"
          slug="next-hydration-event"
        />,
      )
    })

    expect(screen.getByText("How many rounds of judging?")).toBeDefined()
  })

  it("keeps wizard navigation working when saving the step fails", async () => {
    const serverHtml = renderToString(<JudgingSetupWizard {...props} />)
    const setItem = spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable")
    })
    await hydrate(serverHtml, () => {})

    fireEvent.click(screen.getByRole("button", { name: /^Single round/ }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    setItem.mockRestore()

    expect(screen.getByText("What are you awarding?")).toBeDefined()
  })
})

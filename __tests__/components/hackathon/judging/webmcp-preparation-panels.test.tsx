import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { ScoringPanel } from "@/components/hackathon/judging/scoring-panel"
import { UnifiedScoringPanel } from "@/components/hackathon/judging/unified-scoring-panel"
import { JudgesPickPanel } from "@/components/hackathon/judging/judges-pick-panel"
import { BucketSortPanel } from "@/components/hackathon/judging/bucket-sort-panel"
import { GateCheckPanel } from "@/components/hackathon/judging/gate-check-panel"
import {
  JUDGE_WEBMCP_OPEN_EVENT,
  JudgeWebMcpTools,
  useJudgeWebMcpEditor,
} from "@/components/hackathon/judging/judge-webmcp-tools"
import type { AssignmentDetail } from "@/lib/services/judging"
import type {
  JudgeWebMcpAssignment,
} from "@/lib/webmcp/judge-tools"
import type { WebMcpTool } from "@/lib/webmcp/types"

const originalFetch = globalThis.fetch
const assignmentId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const submissionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const prizeId = "cccccccc-cccc-cccc-cccc-cccccccccccc"
const activeSignal = new AbortController().signal

let registeredTools: Map<string, WebMcpTool>
let fetchSpy: ReturnType<typeof mock>

function webAssignment(
  judgingStyle: JudgeWebMcpAssignment["judgingStyle"],
  overrides: Partial<JudgeWebMcpAssignment> = {},
): JudgeWebMcpAssignment {
  return {
    id: assignmentId,
    submissionId,
    title: "Project Alpha",
    description: "A useful project",
    githubUrl: null,
    liveAppUrl: null,
    demoVideoUrl: null,
    teamName: "Team Alpha",
    isComplete: false,
    notes: "",
    judgingStyle,
    prizeName: "Best Project",
    ...overrides,
  }
}

function panelAssignment() {
  return {
    id: assignmentId,
    submissionId,
    submissionTitle: "Project Alpha",
    submissionDescription: "A useful project",
    submissionGithubUrl: null,
    submissionLiveAppUrl: null,
    submissionDemoVideoUrl: null,
    submissionScreenshotUrl: null,
    teamName: "Team Alpha",
    isComplete: false,
  }
}

function weightedDetail(
  assignmentKind: "per_prize" | "unified_weighted_score",
): AssignmentDetail {
  return {
    ...panelAssignment(),
    notes: "",
    criteria: [
      {
        id: "criterion-db-1",
        name: "Impact",
        description: null,
        min_score: 1,
        max_score: 10,
        weight: 1,
        category: null,
        currentScore: null,
        rubricLevels: [],
        prizeId: assignmentKind === "unified_weighted_score" ? null : prizeId,
        prizeName: assignmentKind === "unified_weighted_score" ? null : "Best Project",
      },
    ],
    buckets: [],
    existingGateResponses: [],
    existingBucketId: null,
    assignmentKind,
  }
}

function successfulResponse(body: unknown = { success: true }) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

async function getTool(name: string): Promise<WebMcpTool> {
  await waitFor(() => expect(registeredTools.has(name)).toBe(true))
  const tool = registeredTools.get(name)
  if (!tool) throw new Error(`Missing registered tool ${name}`)
  return tool
}

async function executeTool(tool: WebMcpTool, input: Record<string, unknown>) {
  let result: unknown
  await act(async () => {
    result = await tool.execute(input, { signal: activeSignal })
  })
  return result
}

async function waitForEditor() {
  const detailTool = await getTool("get_judge_assignment")
  await waitFor(async () => {
    const result = await detailTool.execute(
      { assignmentRef: "assignment-1" },
      { signal: activeSignal },
    )
    expect(result).toMatchObject({ ok: true, data: { editorReady: true } })
  })
}

async function expectSingleRequest(pathSuffix: string, body: unknown) {
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25))
  })
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  const [url, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
  expect(url.endsWith(pathSuffix)).toBe(true)
  expect(options.method).toBe("POST")
  expect(JSON.parse(options.body as string)).toEqual(body)
}

beforeEach(() => {
  registeredTools = new Map()
  document.modelContext = {
    registerTool: mock(async (tool) => {
      registeredTools.set(tool.name, tool)
    }),
  }
  fetchSpy = mock(() => successfulResponse())
  globalThis.fetch = fetchSpy as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  delete document.modelContext
  globalThis.fetch = originalFetch
})

describe("mounted judge WebMCP preparation", () => {
  it("opens and scrolls to the existing assignment control without fetching", async () => {
    const scrollIntoView = mock(() => {})
    const originalAnimationFrame = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    }) as typeof requestAnimationFrame
    let openedAssignmentId: string | null = null
    const onOpen = (event: Event) => {
      openedAssignmentId = (event as CustomEvent<{ assignmentId: string }>).detail.assignmentId
    }
    window.addEventListener(JUDGE_WEBMCP_OPEN_EVENT, onOpen)

    try {
      render(
        <JudgeWebMcpTools
          slug="test-hack"
          assignments={[webAssignment("weighted_score")]}
        >
          <div
            data-judge-assignment={assignmentId}
            ref={(node) => {
              if (node) node.scrollIntoView = scrollIntoView
            }}
          >
            Existing judge control
          </div>
        </JudgeWebMcpTools>,
      )

      const result = await executeTool(await getTool("open_judge_assignment"), {
        assignmentRef: "assignment-1",
      })
      expect(result).toEqual({
        ok: true,
        data: { assignmentRef: "assignment-1", opened: true },
        requiresHumanAction: true,
      })
      expect(openedAssignmentId).toBe(assignmentId)
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(JUDGE_WEBMCP_OPEN_EVENT, onOpen)
      globalThis.requestAnimationFrame = originalAnimationFrame
    }
  })

  it("updates the stable assignment store and tool styles when server props change", async () => {
    const mounted = render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("weighted_score")]}
      >
        <p>Judge tools</p>
      </JudgeWebMcpTools>,
    )
    expect(await executeTool(await getTool("get_my_judging_status"), {})).toMatchObject({
      ok: true,
      data: { total: 1, completed: 0, responseStyles: ["weighted_score"] },
    })

    mounted.rerender(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("gate_check", { isComplete: true })]}
      >
        <p>Judge tools</p>
      </JudgeWebMcpTools>,
    )
    await waitFor(() => expect(registeredTools.has("prepare_judge_gates")).toBe(true))
    expect(await executeTool(await getTool("get_my_judging_status"), {})).toMatchObject({
      ok: true,
      data: { total: 1, completed: 1, responseStyles: ["gate_check"] },
    })
  })

  it("unregisters a panel editor when its visible controls leave", async () => {
    const editor = {
      info: { criteria: [{ ref: "impact", name: "Impact", min: 1, max: 10 }] },
      prepare: mock(() => ({ prepared: true, message: "ready" })),
    }
    function EditorHarness({ visible }: { visible: boolean }) {
      useJudgeWebMcpEditor([assignmentId], visible ? editor : null)
      return visible ? <p>Editor visible</p> : null
    }
    const mounted = render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("weighted_score")]}
      >
        <EditorHarness visible />
      </JudgeWebMcpTools>,
    )
    const detail = await getTool("get_judge_assignment")
    await waitFor(async () => {
      expect(await detail.execute(
        { assignmentRef: "assignment-1" },
        { signal: activeSignal },
      )).toMatchObject({ ok: true, data: { editorReady: true } })
    })

    mounted.rerender(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("weighted_score")]}
      >
        <EditorHarness visible={false} />
      </JudgeWebMcpTools>,
    )
    await waitFor(async () => {
      expect(await detail.execute(
        { assignmentRef: "assignment-1" },
        { signal: activeSignal },
      )).toMatchObject({ ok: true, data: { editorReady: false } })
    })
    expect(editor.prepare).not.toHaveBeenCalled()
  })

  it("registers no tools while judging is disabled", async () => {
    render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("weighted_score")]}
        enabled={false}
      >
        <p>Judging isn&apos;t open</p>
      </JudgeWebMcpTools>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText("Judging isn't open")).toBeDefined()
    expect(registeredTools.size).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("keeps per-prize score and note preparation local until one human submit", async () => {
    render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("weighted_score")]}
      >
        <ScoringPanel
          hackathonSlug="test-hack"
          assignmentId={assignmentId}
          prefetchedDetail={weightedDetail("per_prize")}
          onClose={() => {}}
          onScoreSubmitted={() => {}}
        />
      </JudgeWebMcpTools>,
    )

    await screen.findByText("Scoring")
    await waitForEditor()
    const notes = screen.getByPlaceholderText("Add your notes about this submission...")
    fireEvent.change(notes, { target: { value: "Pending manual note" } })

    const result = await executeTool(await getTool("prepare_judge_scores"), {
      assignmentRef: "assignment-1",
      scores: [{ criterion: "Impact", value: 8 }],
      notes: "Prepared note",
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100))
    })

    expect(result).toMatchObject({
      ok: true,
      data: { prepared: true },
      requiresHumanAction: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("8")
    expect((notes as HTMLTextAreaElement).value).toBe("Prepared note")

    fireEvent.click(screen.getByRole("button", { name: "Submit scores" }))
    await expectSingleRequest(
      `/judging/assignments/${assignmentId}/scores`,
      {
        scores: [{ criteriaId: "criterion-db-1", score: 8 }],
        notes: "Prepared note",
      },
    )
  })

  it("keeps unified score and note preparation local until one human submit", async () => {
    render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("weighted_score")]}
      >
        <UnifiedScoringPanel
          hackathonSlug="test-hack"
          assignmentId={assignmentId}
          prefetchedDetail={weightedDetail("unified_weighted_score")}
          onClose={() => {}}
          onScoreSubmitted={() => {}}
        />
      </JudgeWebMcpTools>,
    )

    await screen.findByText("Core Weighted Categories")
    await waitForEditor()
    const notes = screen.getByPlaceholderText("Add your notes about this submission...")
    fireEvent.change(notes, { target: { value: "Pending unified note" } })

    const result = await executeTool(await getTool("prepare_judge_scores"), {
      assignmentRef: "assignment-1",
      scores: [{ criterion: "Impact", value: 9 }],
      notes: "Prepared unified note",
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100))
    })

    expect(result).toMatchObject({
      ok: true,
      data: { prepared: true },
      requiresHumanAction: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("9")
    expect((notes as HTMLTextAreaElement).value).toBe("Prepared unified note")

    fireEvent.click(screen.getByRole("button", { name: "Submit scores" }))
    await expectSingleRequest(
      `/judging/assignments/${assignmentId}/scores`,
      {
        scores: [{ criteriaId: "criterion-db-1", score: 9 }],
        notes: "Prepared unified note",
      },
    )
  })

  it("keeps ranked-pick preparation local until one human save", async () => {
    const secondAssignmentId = "dddddddd-dddd-dddd-dddd-dddddddddddd"
    const secondSubmissionId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
    const webAssignments = [
      webAssignment("judges_pick"),
      webAssignment("judges_pick", {
        id: secondAssignmentId,
        submissionId: secondSubmissionId,
        title: "Project Beta",
      }),
    ]
    const pickAssignments = [
      panelAssignment(),
      {
        ...panelAssignment(),
        id: secondAssignmentId,
        submissionId: secondSubmissionId,
        submissionTitle: "Project Beta",
      },
    ]

    render(
      <JudgeWebMcpTools slug="test-hack" assignments={webAssignments}>
        <JudgesPickPanel
          hackathonSlug="test-hack"
          prizeId={prizeId}
          prizeName="Judge's Pick"
          maxPicks={2}
          assignments={pickAssignments}
          initialPicks={[]}
        />
      </JudgeWebMcpTools>,
    )

    await waitForEditor()
    const result = await executeTool(await getTool("prepare_judge_picks"), {
      assignmentRef: "assignment-1",
      rankedProjectRefs: ["project-2", "project-1"],
    })

    expect(result).toMatchObject({
      ok: true,
      data: { prepared: true },
      requiresHumanAction: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.getByText("#1").parentElement?.textContent).toContain("Project Beta")

    fireEvent.click(screen.getByRole("button", { name: "Save picks" }))
    await expectSingleRequest("/judging/picks", {
      prizeId,
      rankedSubmissionIds: [secondSubmissionId, submissionId],
    })
  })

  it("keeps bucket and note preparation local until one human save", async () => {
    const bucketDetail = {
      ...panelAssignment(),
      gates: [],
      buckets: [
        { id: "bucket-db-1", level: 1, label: "Top group", description: null },
      ],
      existingGateResponses: [],
      existingBucketId: null,
      notes: "",
    }
    fetchSpy.mockImplementation((_: RequestInfo | URL, options?: RequestInit) =>
      options?.method === "POST"
        ? successfulResponse()
        : successfulResponse(bucketDetail),
    )

    render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("bucket_sort")]}
      >
        <BucketSortPanel
          hackathonSlug="test-hack"
          prizeName="Best Project"
          assignments={[panelAssignment()]}
        />
      </JudgeWebMcpTools>,
    )

    await screen.findByText("Place in a category")
    await waitForEditor()
    fetchSpy.mockClear()
    const result = await executeTool(await getTool("prepare_judge_bucket"), {
      assignmentRef: "assignment-1",
      bucket: "Top group",
      notes: "Prepared bucket note",
    })

    expect(result).toMatchObject({
      ok: true,
      data: { prepared: true },
      requiresHumanAction: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((screen.getByDisplayValue("Prepared bucket note") as HTMLTextAreaElement).value)
      .toBe("Prepared bucket note")

    fireEvent.click(screen.getByRole("button", { name: "Submit & next" }))
    await expectSingleRequest(
      `/judging/assignments/${assignmentId}/bucket-sort`,
      {
        gates: [],
        bucketId: "bucket-db-1",
        notes: "Prepared bucket note",
      },
    )
  })

  it("keeps gate-check preparation local until one human save", async () => {
    const gateDetail = {
      ...panelAssignment(),
      criteria: [
        {
          id: "gate-db-1",
          name: "Works offline",
          description: null,
          prizeId,
        },
      ],
      existingGateResponses: [],
    }
    fetchSpy.mockImplementation((_: RequestInfo | URL, options?: RequestInit) =>
      options?.method === "POST"
        ? successfulResponse()
        : successfulResponse(gateDetail),
    )

    render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("gate_check")]}
      >
        <GateCheckPanel
          hackathonSlug="test-hack"
          prizeName="Offline Ready"
          assignments={[panelAssignment()]}
        />
      </JudgeWebMcpTools>,
    )

    await screen.findByText("Requirements")
    await waitForEditor()
    fetchSpy.mockClear()
    const result = await executeTool(await getTool("prepare_judge_gates"), {
      assignmentRef: "assignment-1",
      gates: [{ criterion: "Works offline", passed: true }],
    })

    expect(result).toMatchObject({
      ok: true,
      data: { prepared: true },
      requiresHumanAction: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Submit & next" }).hasAttribute("disabled"))
      .toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Submit & next" }))
    await expectSingleRequest(
      `/judging/assignments/${assignmentId}/gate-check`,
      { gates: [{ criteriaId: "gate-db-1", passed: true }] },
    )
  })

  it("rejects an out-of-range prepared score without changing controls or fetching", async () => {
    render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("weighted_score")]}
      >
        <ScoringPanel
          hackathonSlug="test-hack"
          assignmentId={assignmentId}
          prefetchedDetail={weightedDetail("per_prize")}
          onClose={() => {}}
          onScoreSubmitted={() => {}}
        />
      </JudgeWebMcpTools>,
    )

    await screen.findByText("Scoring")
    await waitForEditor()
    const score = screen.getByRole("spinbutton") as HTMLInputElement
    expect(score.value).toBe("1")

    const result = await executeTool(await getTool("prepare_judge_scores"), {
      assignmentRef: "assignment-1",
      scores: [{ criterion: "Impact", value: 11 }],
      notes: "Must not be applied",
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        prepared: false,
        message: "Check Impact and use one of the listed score ranges.",
      },
      requiresHumanAction: true,
    })
    expect(score.value).toBe("1")
    expect(screen.queryByDisplayValue("Must not be applied")).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects prepared ranked picks that exceed the prize limit without fetching", async () => {
    const secondAssignmentId = "dddddddd-dddd-dddd-dddd-dddddddddddd"
    const secondSubmissionId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
    const webAssignments = [
      webAssignment("judges_pick"),
      webAssignment("judges_pick", {
        id: secondAssignmentId,
        submissionId: secondSubmissionId,
        title: "Project Beta",
      }),
    ]

    render(
      <JudgeWebMcpTools slug="test-hack" assignments={webAssignments}>
        <JudgesPickPanel
          hackathonSlug="test-hack"
          prizeId={prizeId}
          prizeName="Judge's Pick"
          maxPicks={1}
          assignments={[
            panelAssignment(),
            {
              ...panelAssignment(),
              id: secondAssignmentId,
              submissionId: secondSubmissionId,
              submissionTitle: "Project Beta",
            },
          ]}
          initialPicks={[]}
        />
      </JudgeWebMcpTools>,
    )

    await waitForEditor()
    const result = await executeTool(await getTool("prepare_judge_picks"), {
      assignmentRef: "assignment-1",
      rankedProjectRefs: ["project-1", "project-2"],
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        prepared: false,
        message: "Pick between 1 and 1 projects from this prize.",
      },
      requiresHumanAction: true,
    })
    expect(screen.queryByText("#1")).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects an unknown prepared bucket without changing the form or fetching", async () => {
    const bucketDetail = {
      ...panelAssignment(),
      gates: [],
      buckets: [
        { id: "bucket-db-1", level: 1, label: "Top group", description: null },
      ],
      existingGateResponses: [],
      existingBucketId: null,
      notes: "",
    }
    fetchSpy.mockImplementation(() => successfulResponse(bucketDetail))

    render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("bucket_sort")]}
      >
        <BucketSortPanel
          hackathonSlug="test-hack"
          prizeName="Best Project"
          assignments={[panelAssignment()]}
        />
      </JudgeWebMcpTools>,
    )

    await screen.findByText("Place in a category")
    await waitForEditor()
    fetchSpy.mockClear()
    const result = await executeTool(await getTool("prepare_judge_bucket"), {
      assignmentRef: "assignment-1",
      bucket: "Missing group",
      notes: "Must not be applied",
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        prepared: false,
        message: "Pick one of the listed sort groups.",
      },
      requiresHumanAction: true,
    })
    expect(screen.queryByDisplayValue("Must not be applied")).toBeNull()
    expect(screen.getByRole("button", { name: "Submit & next" }).hasAttribute("disabled"))
      .toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects an unknown prepared gate without changing the form or fetching", async () => {
    const gateDetail = {
      ...panelAssignment(),
      criteria: [
        {
          id: "gate-db-1",
          name: "Works offline",
          description: null,
          prizeId,
        },
      ],
      existingGateResponses: [],
    }
    fetchSpy.mockImplementation(() => successfulResponse(gateDetail))

    render(
      <JudgeWebMcpTools
        slug="test-hack"
        assignments={[webAssignment("gate_check")]}
      >
        <GateCheckPanel
          hackathonSlug="test-hack"
          prizeName="Offline Ready"
          assignments={[panelAssignment()]}
        />
      </JudgeWebMcpTools>,
    )

    await screen.findByText("Requirements")
    await waitForEditor()
    fetchSpy.mockClear()
    const result = await executeTool(await getTool("prepare_judge_gates"), {
      assignmentRef: "assignment-1",
      gates: [{ criterion: "Missing check", passed: true }],
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        prepared: false,
        message: "Check Missing check again.",
      },
      requiresHumanAction: true,
    })
    expect(screen.getByRole("button", { name: "Submit & next" }).hasAttribute("disabled"))
      .toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("opens a requested bucket assignment and loads its fresh detail", async () => {
    const secondAssignmentId = "dddddddd-dddd-dddd-dddd-dddddddddddd"
    const secondAssignment = {
      ...panelAssignment(),
      id: secondAssignmentId,
      submissionId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      submissionTitle: "Project Beta",
    }
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const selected = String(input).endsWith(secondAssignmentId)
        ? secondAssignment
        : panelAssignment()
      return successfulResponse({
        ...selected,
        gates: [],
        buckets: [
          { id: "bucket-db-1", level: 1, label: "Top group", description: null },
        ],
        existingGateResponses: [],
        existingBucketId: null,
        notes: "",
      })
    })

    render(
      <BucketSortPanel
        hackathonSlug="test-hack"
        prizeName="Best Project"
        assignments={[panelAssignment(), secondAssignment]}
      />,
    )
    await screen.findByText("Project Alpha")

    act(() => {
      window.dispatchEvent(
        new CustomEvent(JUDGE_WEBMCP_OPEN_EVENT, {
          detail: { assignmentId: secondAssignmentId },
        }),
      )
    })

    await screen.findByText("Project Beta")
    expect(
      fetchSpy.mock.calls.some(([url]) => String(url).endsWith(secondAssignmentId)),
    ).toBe(true)
  })

  it("opens a requested gate assignment and loads its fresh detail", async () => {
    const secondAssignmentId = "dddddddd-dddd-dddd-dddd-dddddddddddd"
    const secondAssignment = {
      ...panelAssignment(),
      id: secondAssignmentId,
      submissionId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      submissionTitle: "Project Beta",
    }
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const selected = String(input).endsWith(secondAssignmentId)
        ? secondAssignment
        : panelAssignment()
      return successfulResponse({
        ...selected,
        criteria: [
          {
            id: "gate-db-1",
            name: "Works offline",
            description: null,
            prizeId,
          },
        ],
        existingGateResponses: [],
      })
    })

    render(
      <GateCheckPanel
        hackathonSlug="test-hack"
        prizeName="Offline Ready"
        assignments={[panelAssignment(), secondAssignment]}
      />,
    )
    await screen.findByText("Project Alpha")

    act(() => {
      window.dispatchEvent(
        new CustomEvent(JUDGE_WEBMCP_OPEN_EVENT, {
          detail: { assignmentId: secondAssignmentId },
        }),
      )
    })

    await screen.findByText("Project Beta")
    expect(
      fetchSpy.mock.calls.some(([url]) => String(url).endsWith(secondAssignmentId)),
    ).toBe(true)
  })
})

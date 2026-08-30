import type { OatmealClient } from "../../client.js"
import {
  formatDetail,
  formatJson,
  formatSuccess,
  formatTable,
} from "../../output.js"
import { resolveHackathonId } from "./resolve.js"

type OrganizerTaskState = "pending" | "completed" | "dismissed"
type OrganizerTask = {
  taskRef: string
  label: string
  hint: string | null
  tooltip: string | null
  severity: "urgent" | "warning" | "scheduled" | "info"
  state: OrganizerTaskState
  completionPolicy: "auto" | "manual" | "dismiss" | "transition"
  custom: boolean
  destination: string
  inspectUrl: string
  ctaLabel: string | null
  blocksProgress: boolean
  updatedAt: string | null
}

type OrganizerTaskPage = {
  event: { name: string; slug: string }
  totalCount: number
  pendingCount: number
  completedCount: number
  dismissedCount: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
  items: OrganizerTask[]
}

type TaskOptions = {
  json: boolean
  label?: string
  severity?: OrganizerTask["severity"]
  taskRef?: string
  state?: OrganizerTaskState | "all"
  offset?: number
  limit?: number
  expectedUpdatedAt?: string
  positionals: string[]
}

const USAGE = `Usage:
  hackathon events tasks list <id-or-slug> [--state all|pending|completed|dismissed] [--offset N] [--limit N]
  hackathon events tasks add <id-or-slug> --label <text> --task-ref <custom-ref> [--severity urgent|warning|scheduled|info]
  hackathon events tasks complete <id-or-slug> <task-ref> [--expected-updated-at ISO]
  hackathon events tasks reopen <id-or-slug> <task-ref> [--expected-updated-at ISO]
  hackathon events tasks dismiss <id-or-slug> <task-ref> [--expected-updated-at ISO]
  hackathon events tasks remove <id-or-slug> <custom-task-ref> [--expected-updated-at ISO]`

const TASK_REF_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
const CUSTOM_TASK_REF_PATTERN = /^custom-[A-Za-z0-9_-]{1,153}$/

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(1)
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) fail(`Add a value after ${flag}.`)
  return value
}

function parseNumber(value: string, flag: string, minimum: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(`${flag} must be a whole number from ${minimum} to ${maximum}.`)
  }
  return parsed
}

function parseArgs(args: string[]): TaskOptions {
  const options: TaskOptions = { json: false, positionals: [] }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    switch (argument) {
      case "--json":
        options.json = true
        break
      case "--label":
        options.label = readValue(args, index, argument)
        index += 1
        break
      case "--severity": {
        const severity = readValue(args, index, argument)
        if (!["urgent", "warning", "scheduled", "info"].includes(severity)) {
          fail("Choose urgent, warning, scheduled, or info for --severity.")
        }
        options.severity = severity as OrganizerTask["severity"]
        index += 1
        break
      }
      case "--task-ref":
        options.taskRef = readValue(args, index, argument)
        index += 1
        break
      case "--state": {
        const state = readValue(args, index, argument)
        if (!["all", "pending", "completed", "dismissed"].includes(state)) {
          fail("Choose all, pending, completed, or dismissed for --state.")
        }
        options.state = state as OrganizerTaskState | "all"
        index += 1
        break
      }
      case "--offset":
        options.offset = parseNumber(
          readValue(args, index, argument),
          argument,
          0,
          10_000,
        )
        index += 1
        break
      case "--limit":
        options.limit = parseNumber(
          readValue(args, index, argument),
          argument,
          1,
          50,
        )
        index += 1
        break
      case "--expected-updated-at":
        options.expectedUpdatedAt = readValue(args, index, argument)
        index += 1
        break
      default:
        if (argument.startsWith("--")) fail(`Unknown option: ${argument}`)
        options.positionals.push(argument)
    }
  }
  return options
}

function taskPath(eventId: string, taskRef?: string): string {
  const base = `/api/dashboard/hackathons/${eventId}/action-items`
  return taskRef ? `${base}/${encodeURIComponent(taskRef)}` : base
}

function validateTaskRef(taskRef: string | undefined, customOnly = false): string {
  const pattern = customOnly ? CUSTOM_TASK_REF_PATTERN : TASK_REF_PATTERN
  if (!taskRef || !pattern.test(taskRef)) {
    fail(
      customOnly
        ? "Use a task ref like custom-order-lunch."
        : "Use the task ref shown by events tasks list.",
    )
  }
  return taskRef
}

function printTask(message: string, task: OrganizerTask) {
  console.log(formatSuccess(message))
  console.log(
    formatDetail([
      { label: "Task", value: task.label },
      { label: "Task ref", value: task.taskRef },
      { label: "State", value: task.state },
      { label: "Priority", value: task.severity },
      { label: "Where", value: task.destination },
      { label: "Open", value: task.inspectUrl },
      { label: "Updated", value: task.updatedAt ?? undefined },
    ]),
  )
}

async function listTasks(
  client: OatmealClient,
  eventId: string,
  options: TaskOptions,
) {
  const page = await client.get<OrganizerTaskPage>(taskPath(eventId), {
    params: {
      offset: options.offset ?? 0,
      limit: options.limit ?? 20,
      state: options.state ?? "all",
    },
  })
  if (options.json) {
    console.log(formatJson(page))
    return
  }

  console.log(
    `${page.pendingCount} to do, ${page.completedCount} done, ${page.dismissedCount} dismissed`,
  )
  if (page.items.length === 0) {
    console.log("No tasks found on this page.")
    return
  }
  console.log("")
  console.log(
    formatTable(page.items, [
      { key: "label", label: "Task" },
      { key: "state", label: "State" },
      { key: "severity", label: "Priority" },
    ]),
  )
  console.log("\nOpen each task:")
  for (const task of page.items) {
    console.log(
      formatDetail([
        { label: "Task ref", value: task.taskRef },
        { label: "Where", value: task.destination },
        { label: "Open", value: task.inspectUrl },
      ]),
    )
  }
  if (page.nextOffset !== null) {
    console.log(`\nMore tasks start at offset ${page.nextOffset}.`)
  }
}

async function addTask(
  client: OatmealClient,
  eventId: string,
  options: TaskOptions,
) {
  const label = options.label?.trim()
  if (!label || label.length > 200) fail("Add a task name up to 200 characters.")
  const taskRef = validateTaskRef(options.taskRef, true)
  const result = await client.post<{ task: OrganizerTask }>(taskPath(eventId), {
    label,
    severity: options.severity ?? "info",
    taskRef,
  })
  if (options.json) {
    console.log(formatJson(result))
    return
  }
  printTask("Task added.", result.task)
}

async function changeTask(
  client: OatmealClient,
  eventId: string,
  action: "complete" | "reopen" | "dismiss",
  options: TaskOptions,
) {
  const taskRef = validateTaskRef(options.positionals[0])
  const state = {
    complete: "completed",
    reopen: "pending",
    dismiss: "dismissed",
  }[action] as OrganizerTaskState
  const result = await client.patch<{ task: OrganizerTask }>(
    taskPath(eventId, taskRef),
    { state, expectedUpdatedAt: options.expectedUpdatedAt },
  )
  if (options.json) {
    console.log(formatJson(result))
    return
  }
  const message = action === "complete"
    ? "Task completed."
    : action === "reopen"
      ? "Task reopened."
      : "Task dismissed."
  printTask(message, result.task)
}

async function removeTask(
  client: OatmealClient,
  eventId: string,
  options: TaskOptions,
) {
  const taskRef = validateTaskRef(options.positionals[0], true)
  const result = await client.delete<{ success: true }>(
    taskPath(eventId, taskRef),
    { params: { expectedUpdatedAt: options.expectedUpdatedAt } },
  )
  if (options.json) {
    console.log(formatJson({ ...result, taskRef }))
    return
  }
  console.log(formatSuccess(`Removed ${taskRef}.`))
}

export async function runHackathonTasks(
  client: OatmealClient,
  action: string | undefined,
  idOrSlug: string | undefined,
  args: string[],
): Promise<void> {
  if (
    !action ||
    !idOrSlug ||
    !["list", "add", "complete", "reopen", "dismiss", "remove"].includes(action)
  ) {
    fail("Choose list, add, complete, reopen, dismiss, or remove.")
  }
  const options = parseArgs(args)
  const eventId = await resolveHackathonId(client, idOrSlug)

  if (action === "list") return listTasks(client, eventId, options)
  if (action === "add") return addTask(client, eventId, options)
  if (action === "remove") return removeTask(client, eventId, options)
  return changeTask(
    client,
    eventId,
    action as "complete" | "reopen" | "dismiss",
    options,
  )
}

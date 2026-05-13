import pc from "picocolors"
import { OatmealClient } from "./client.js"
import { loadConfig } from "./config.js"
import { VERSION, DEFAULT_BASE_URL } from "./constants.js"
import { ApiError, AuthError, ConfigError, ScopeError } from "./errors.js"
import { formatError } from "./output.js"

interface GlobalFlags {
  json: boolean
  yes: boolean
  baseUrl?: string
  apiKey?: string
  help: boolean
}

function parseGlobalFlags(args: string[]): { flags: GlobalFlags; rest: string[] } {
  const flags: GlobalFlags = { json: false, yes: false, help: false }
  const rest: string[] = []

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--json":
        flags.json = true
        break
      case "--yes":
      case "-y":
        flags.yes = true
        break
      case "--base-url":
        flags.baseUrl = args[++i]
        break
      case "--api-key":
        flags.apiKey = args[++i]
        break
      case "--help":
      case "-h":
        flags.help = true
        break
      case "--version":
      case "-v":
        console.log(VERSION)
        process.exit(0)
        break
      default:
        rest.push(args[i])
    }
  }

  return { flags, rest }
}

function createPublicClient(flags: GlobalFlags): OatmealClient {
  const config = loadConfig()
  return new OatmealClient({
    baseUrl: flags.baseUrl ?? config?.baseUrl ?? DEFAULT_BASE_URL,
  })
}

function createAuthenticatedClient(flags: GlobalFlags): OatmealClient {
  const apiKey = flags.apiKey ?? process.env.HACKATHON_API_KEY
  if (apiKey) {
    return new OatmealClient({
      baseUrl: flags.baseUrl ?? DEFAULT_BASE_URL,
      apiKey,
    })
  }

  const config = loadConfig()
  if (!config?.apiKey) {
    throw new AuthError()
  }

  return new OatmealClient({
    baseUrl: flags.baseUrl ?? config.baseUrl,
    apiKey: config.apiKey,
  })
}

const BANNER = `
  ${pc.bold("hackathon")} — CLI for the Oatmeal hackathon platform

  ${pc.dim("USAGE")}
    hackathon <command> [options]

  ${pc.dim("PUBLIC COMMANDS (no auth required)")}
    browse hackathons          Search public hackathons
    browse submissions <slug>  View submissions for a hackathon
    browse results <slug>      View published results
    browse org <slug>          View organization profile

  ${pc.dim("AUTH")}
    login                      Sign in via browser or API key
    logout                     Remove saved credentials
    whoami                     Show current auth info
    update                     Update CLI to latest version

  ${pc.dim("EVENT MANAGEMENT (auth required)")}
    events list                List your hackathons
    events get <id>            Get hackathon details
    events create              Create a hackathon
    events update <id>         Update a hackathon
    events delete <id>         Delete a hackathon
    events activity <id>       View activity log for a hackathon
    ${pc.dim("(alias: hackathons)")}

  ${pc.dim("JUDGING")}
    judging criteria list <id>                           List criteria
    judging criteria create <id>                         Create criteria
    judging criteria update <id> <cid>                   Update criteria
    judging criteria delete <id> <cid>                   Delete criteria
    judging levels list --hackathon-id <id> --criteria-id <cid>        List rubric levels
    judging levels add --hackathon-id <id> --criteria-id <cid>         Add a rubric level
    judging levels update --hackathon-id <id> --criteria-id <cid>      Update a rubric level
    judging levels delete --hackathon-id <id> --criteria-id <cid>      Delete a rubric level
    judging judges list <id>                             List judges
    judging judges add <id>                              Add a judge
    judging judges remove <id> <pid>                     Remove a judge
    judging assignments list <id>                        List assignments
    judging assignments create <id>                      Create assignment
    judging assignments delete <id> <aid>                Delete assignment
    judging auto-assign <id>                             Auto-assign judges
    judging invitations list <id>                        List invitations
    judging invitations cancel <id> <iid>                Cancel invitation
    judging track-assign <id>                            Assign judge to track
    judging track-unassign <id>                          Remove judge from track
    judging pick-results <id>                            View pick results

  ${pc.dim("PRIZE TRACKS")}
    tracks list <id>                                     List prize tracks
    tracks get <id> <tid>                                Get track details
    tracks create <id>                                   Create a track
    tracks update <id> <tid>                             Update a track
    tracks delete <id> <tid>                             Delete a track
    tracks buckets <id> <tid> <rid>                      Replace bucket definitions
    tracks update-round <id> <tid> <rid>                 Update a round
    tracks activate-round <id> <tid> <rid>               Activate a round
    tracks calculate-results <id> <tid> <rid>            Calculate round results

  ${pc.dim("PRIZES")}
    prizes list <id>                         List prizes
    prizes create <id>                       Create a prize
    prizes update <id> <pid>                 Update a prize
    prizes delete <id> <pid>                 Delete a prize
    prizes reorder <id>                      Reorder prizes
    prizes assign <id> <pid>                 Assign prize
    prizes unassign <id> <pid> <sid>         Unassign prize

  ${pc.dim("SHOWCASE / PRESENTER")}
    presenter list <id>                      List saved showcase views
    presenter create <id> --name <n>         Create a showcase view
                          (--round <round-id> | --submissions <id1,id2>)
    presenter delete <id> <view-id>          Delete a showcase view

  ${pc.dim("CHALLENGES")}
    challenges list <id>                     List challenges
    challenges create <id>                   Create (--title [--description --resources "label|url;..."])
    challenges update <id> <cid>             Update a challenge
    challenges delete <id> <cid>             Delete a challenge
    challenges reorder <id> --ids id1,id2    Reorder challenges

  ${pc.dim("ANNOUNCEMENTS")}
    announcements list <id>                  List announcements
    announcements create <id>                Create (--title --body [--priority --audience])
    announcements update <id> <aid>          Update an announcement
    announcements delete <id> <aid>          Delete an announcement
    announcements publish <id> <aid>         Publish now
    announcements schedule <id> <aid> --at   Schedule for future publish (ISO 8601)
    announcements unpublish <id> <aid>       Unpublish an announcement

  ${pc.dim("TEAMS")}
    teams list <id>                          List teams with members
    teams create <id>                        Create a team (--name --captain-email)
    teams update <id> <tid>                  Update team name/mode
    teams update-members <id> <tid>          Add/remove team members (--add a,b --remove c)
    teams assign-room <id> <rid>             Assign team to room (--team <tid>)
    teams unassign-room <id> <rid> <tid>     Remove team from room

  ${pc.dim("ROOMS")}
    rooms judges add <id> <rid>              Add judge to room (--judge <participant-id>)
    rooms judges remove <id> <rid> <jid>     Remove judge from room
    rooms auto-assign get <id>               Show room-routing toggle state
    rooms auto-assign set <id> --on|--off    Toggle auto-assign of submissions to room judges
    rooms auto-assign sync <id>              Route existing submissions to their room's judges

  ${pc.dim("SPONSORS")}
    sponsors list <id>                       List sponsors
    sponsors add <id>                        Add a sponsor (--name --tier --website --logo-url)
    sponsors update <id> <sid>               Update a sponsor
    sponsors remove <id> <sid>               Remove a sponsor
    sponsors reorder <id> --ids id1,id2,...  Reorder sponsors

  ${pc.dim("PERKS")}
    perks list <id>                          List perks
    perks create <id>                        Create a perk (--name --type --sponsor-id --code --url --scheduled)
    perks update <id> <pid>                  Update a perk
    perks delete <id> <pid>                  Delete a perk
    perks release <id> <pid>                 Release a perk now

  ${pc.dim("JUDGE DISPLAY")}
    judge-display list <id>             List display profiles
    judge-display create <id>           Create display profile
    judge-display update <id> <jid>     Update display profile
    judge-display delete <id> <jid>     Delete display profile
    judge-display reorder <id>          Reorder profiles

  ${pc.dim("RESULTS")}
    results calculate <id>     Calculate results
    results get <id>           Get detailed results
    results publish <id>       Publish results
    results unpublish <id>     Unpublish results

  ${pc.dim("WEBHOOKS")}
    webhooks list              List webhooks
    webhooks create            Create a webhook
    webhooks delete <id>       Delete a webhook

  ${pc.dim("JOBS")}
    jobs list                  List jobs
    jobs get <id>              Get job details
    jobs create                Create a job
    jobs result <id>           Get job result
    jobs cancel <id>           Cancel a job

  ${pc.dim("SCHEDULE (event-scoped)")}
    schedule list <id>                       List schedule items for a hackathon
    schedule add <id>                        Add a schedule item (--title --starts-at [--ends-at --location])
    schedule update <id> <iid>               Update a schedule item
    schedule delete <id> <iid>               Delete a schedule item

  ${pc.dim("SCHEDULES (org-level cron jobs)")}
    schedules list             List org-level schedules
    schedules create           Create a schedule
    schedules get <id>         Get schedule details
    schedules update <id>      Update a schedule
    schedules delete <id>      Delete a schedule

  ${pc.dim("GLOBAL OPTIONS")}
    --json           Output as JSON
    --yes, -y        Skip confirmation prompts
    --base-url       API base URL
    --api-key        API key (overrides config)
    --help, -h       Show help
    --version, -v    Show version
`

async function notifyIfUpdateAvailable(): Promise<void> {
  try {
    const { checkForUpdate, formatUpdateNotice } = await import("./update-check.js")
    const update = await checkForUpdate()
    if (update) {
      console.error(formatUpdateNotice(update))
    }
  } catch {
    // Silently ignore update check failures
  }
}

async function main() {
  const { flags, rest } = parseGlobalFlags(process.argv.slice(2))

  if (rest.length === 0 || flags.help) {
    console.log(BANNER)
    return
  }

  const command = rest[0]
  const sub = rest[1]
  const sub2 = rest[2]

  try {
    switch (command) {
      case "login": {
        const { runLogin } = await import("./commands/login.js")
        await runLogin(rest.slice(1).concat(flags.yes ? ["--yes"] : []).concat(flags.baseUrl ? ["--base-url", flags.baseUrl] : []).concat(flags.apiKey ? ["--api-key", flags.apiKey] : []))
        break
      }

      case "logout": {
        const { runLogout } = await import("./commands/logout.js")
        await runLogout()
        break
      }

      case "whoami": {
        const client = createAuthenticatedClient(flags)
        const { runWhoAmI } = await import("./commands/whoami.js")
        await runWhoAmI(client, { json: flags.json })
        break
      }

      case "update": {
        const { runUpdate } = await import("./commands/update.js")
        await runUpdate()
        return
      }

      case "browse": {
        const client = createPublicClient(flags)
        switch (sub) {
          case "hackathons": {
            const { runBrowseHackathons } = await import("./commands/browse/hackathons.js")
            await runBrowseHackathons(client, rest.slice(2).concat(flags.json ? ["--json"] : []))
            break
          }
          case "submissions": {
            const { runBrowseSubmissions } = await import("./commands/browse/submissions.js")
            await runBrowseSubmissions(client, rest[2], { json: flags.json })
            break
          }
          case "results": {
            const { runBrowseResults } = await import("./commands/browse/results.js")
            await runBrowseResults(client, rest[2], { json: flags.json })
            break
          }
          case "org": {
            const { runBrowseOrg } = await import("./commands/browse/org.js")
            await runBrowseOrg(client, rest[2], { json: flags.json })
            break
          }
          default:
            console.error(`Unknown browse command: ${sub}. Run "hackathon browse --help" for usage.`)
            process.exit(1)
        }
        break
      }

      case "hackathons":
      case "events": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runHackathonsList } = await import("./commands/hackathons/list.js")
            await runHackathonsList(client, { json: flags.json })
            break
          }
          case "get": {
            const { runHackathonsGet } = await import("./commands/hackathons/get.js")
            await runHackathonsGet(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runHackathonsCreate } = await import("./commands/hackathons/create.js")
            await runHackathonsCreate(
              client,
              rest.slice(2).concat(flags.json ? ["--json"] : []).concat(flags.yes ? ["--yes"] : [])
            )
            break
          }
          case "update": {
            const { runHackathonsUpdate } = await import("./commands/hackathons/update.js")
            await runHackathonsUpdate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runHackathonsDelete } = await import("./commands/hackathons/delete.js")
            await runHackathonsDelete(client, rest[2], { yes: flags.yes })
            break
          }
          case "activity": {
            const { runHackathonsActivity } = await import("./commands/hackathons/activity.js")
            await runHackathonsActivity(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          default:
            console.error(`Unknown events command: ${sub}. Run "hackathon events --help" for usage.`)
            process.exit(1)
        }
        break
      }

      case "judging": {
        const client = createAuthenticatedClient(flags)
        const hackathonId = rest[2]
        switch (sub) {
          case "criteria":
            switch (sub2) {
              case "list": {
                const { runCriteriaList } = await import("./commands/judging/criteria-list.js")
                await runCriteriaList(client, rest[3], { json: flags.json })
                break
              }
              case "create": {
                const { runCriteriaCreate } = await import("./commands/judging/criteria-create.js")
                await runCriteriaCreate(client, rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
                break
              }
              case "update": {
                const { runCriteriaUpdate } = await import("./commands/judging/criteria-update.js")
                await runCriteriaUpdate(client, rest[3], rest[4], rest.slice(5).concat(flags.json ? ["--json"] : []))
                break
              }
              case "delete": {
                const { runCriteriaDelete } = await import("./commands/judging/criteria-delete.js")
                await runCriteriaDelete(client, rest[3], rest[4], { yes: flags.yes })
                break
              }
              default:
                console.error(`Unknown judging criteria command: ${sub2}`)
                process.exit(1)
            }
            break

          case "levels": {
            const levelArgs = rest.slice(3).concat(flags.json ? ["--json"] : []).concat(flags.yes ? ["--yes"] : [])

            const parseLevelFlags = (a: string[]) => {
              let hackathonId = ""
              let criteriaId = ""
              let levelId = ""
              for (let i = 0; i < a.length; i++) {
                if (a[i] === "--hackathon-id") hackathonId = a[++i]
                else if (a[i] === "--criteria-id") criteriaId = a[++i]
                else if (a[i] === "--level-id") levelId = a[++i]
              }
              return { hackathonId, criteriaId, levelId }
            }

            const levelFlags = parseLevelFlags(levelArgs)

            switch (sub2) {
              case "list": {
                const { runLevelsList } = await import("./commands/judging/levels-list.js")
                await runLevelsList(client, levelFlags.hackathonId, levelFlags.criteriaId, { json: flags.json })
                break
              }
              case "add": {
                const { runLevelsAdd } = await import("./commands/judging/levels-add.js")
                await runLevelsAdd(client, levelFlags.hackathonId, levelFlags.criteriaId, levelArgs)
                break
              }
              case "update": {
                const { runLevelsUpdate } = await import("./commands/judging/levels-update.js")
                await runLevelsUpdate(client, levelFlags.hackathonId, levelFlags.criteriaId, levelFlags.levelId, levelArgs)
                break
              }
              case "delete": {
                const { runLevelsDelete } = await import("./commands/judging/levels-delete.js")
                await runLevelsDelete(client, levelFlags.hackathonId, levelFlags.criteriaId, levelFlags.levelId, { yes: flags.yes, json: flags.json })
                break
              }
              default:
                console.error(`Unknown judging levels command: ${sub2}`)
                process.exit(1)
            }
            break
          }

          case "judges":
            switch (sub2) {
              case "list": {
                const { runJudgesList } = await import("./commands/judging/judges-list.js")
                await runJudgesList(client, rest[3], { json: flags.json })
                break
              }
              case "add": {
                const { runJudgesAdd } = await import("./commands/judging/judges-add.js")
                await runJudgesAdd(client, rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
                break
              }
              case "remove": {
                const { runJudgesRemove } = await import("./commands/judging/judges-remove.js")
                await runJudgesRemove(client, rest[3], rest[4], { yes: flags.yes })
                break
              }
              default:
                console.error(`Unknown judging judges command: ${sub2}`)
                process.exit(1)
            }
            break

          case "assignments":
            switch (sub2) {
              case "list": {
                const { runAssignmentsList } = await import("./commands/judging/assignments-list.js")
                await runAssignmentsList(client, rest[3], { json: flags.json })
                break
              }
              case "create": {
                const { runAssignmentsCreate } = await import("./commands/judging/assignments-create.js")
                await runAssignmentsCreate(client, rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
                break
              }
              case "delete": {
                const { runAssignmentsDelete } = await import("./commands/judging/assignments-delete.js")
                await runAssignmentsDelete(client, rest[3], rest[4], { yes: flags.yes })
                break
              }
              default:
                console.error(`Unknown judging assignments command: ${sub2}`)
                process.exit(1)
            }
            break

          case "auto-assign": {
            const { runAutoAssign } = await import("./commands/judging/auto-assign.js")
            await runAutoAssign(client, hackathonId, rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }

          case "invitations":
            switch (sub2) {
              case "list": {
                const { runInvitationsList } = await import("./commands/judging/invitations-list.js")
                await runInvitationsList(client, rest[3], { json: flags.json })
                break
              }
              case "cancel": {
                const { runInvitationsCancel } = await import("./commands/judging/invitations-cancel.js")
                await runInvitationsCancel(client, rest[3], rest[4], { yes: flags.yes })
                break
              }
              default:
                console.error(`Unknown judging invitations command: ${sub2}`)
                process.exit(1)
            }
            break

          case "track-assign": {
            const { runTrackAssign } = await import("./commands/judging/track-assign.js")
            await runTrackAssign(client, hackathonId, rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }

          case "track-unassign": {
            const { runTrackUnassign } = await import("./commands/judging/track-unassign.js")
            await runTrackUnassign(client, hackathonId, rest.slice(3).concat(flags.json ? ["--json"] : []).concat(flags.yes ? ["--yes"] : []))
            break
          }

          case "pick-results": {
            const { runPickResults } = await import("./commands/judging/pick-results.js")
            await runPickResults(client, hackathonId, { json: flags.json })
            break
          }

          default:
            console.error(`Unknown judging command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "tracks": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runTracksList } = await import("./commands/tracks/list.js")
            await runTracksList(client, rest[2], { json: flags.json })
            break
          }
          case "get": {
            const { runTracksGet } = await import("./commands/tracks/get.js")
            await runTracksGet(client, rest[2], rest[3], { json: flags.json })
            break
          }
          case "create": {
            const { runTracksCreate } = await import("./commands/tracks/create.js")
            await runTracksCreate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runTracksUpdate } = await import("./commands/tracks/update.js")
            await runTracksUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runTracksDelete } = await import("./commands/tracks/delete.js")
            await runTracksDelete(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          case "buckets": {
            const { runTracksBuckets } = await import("./commands/tracks/buckets.js")
            await runTracksBuckets(client, rest[2], rest[3], rest[4], rest.slice(5).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update-round": {
            const { runTracksUpdateRound } = await import("./commands/tracks/update-round.js")
            await runTracksUpdateRound(client, rest[2], rest[3], rest[4], rest.slice(5).concat(flags.json ? ["--json"] : []))
            break
          }
          case "activate-round": {
            const { runTracksActivateRound } = await import("./commands/tracks/activate-round.js")
            await runTracksActivateRound(client, rest[2], rest[3], rest[4], { json: flags.json })
            break
          }
          case "calculate-results": {
            const { runTracksCalculateResults } = await import("./commands/tracks/calculate-results.js")
            await runTracksCalculateResults(client, rest[2], rest[3], rest[4], { json: flags.json })
            break
          }
          default:
            console.error(`Unknown tracks command: ${sub}. Run "hackathon tracks --help" for usage.`)
            process.exit(1)
        }
        break
      }

      case "prizes": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runPrizesList } = await import("./commands/prizes/list.js")
            await runPrizesList(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runPrizesCreate } = await import("./commands/prizes/create.js")
            await runPrizesCreate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runPrizesUpdate } = await import("./commands/prizes/update.js")
            await runPrizesUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runPrizesDelete } = await import("./commands/prizes/delete.js")
            await runPrizesDelete(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          case "reorder": {
            const { runPrizesReorder } = await import("./commands/prizes/reorder.js")
            await runPrizesReorder(client, rest[2], rest.slice(3))
            break
          }
          case "assign": {
            const { runPrizesAssign } = await import("./commands/prizes/assign.js")
            await runPrizesAssign(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "unassign": {
            const { runPrizesUnassign } = await import("./commands/prizes/unassign.js")
            await runPrizesUnassign(client, rest[2], rest[3], rest[4], { yes: flags.yes })
            break
          }
          default:
            console.error(`Unknown prizes command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "presenter": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runPresenterList } = await import("./commands/presenter/list.js")
            await runPresenterList(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runPresenterCreate } = await import("./commands/presenter/create.js")
            await runPresenterCreate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runPresenterDelete } = await import("./commands/presenter/delete.js")
            await runPresenterDelete(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          default:
            console.error(`Unknown presenter command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "challenges": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runChallengesList } = await import("./commands/challenges/list.js")
            await runChallengesList(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runChallengesCreate } = await import("./commands/challenges/create.js")
            await runChallengesCreate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runChallengesUpdate } = await import("./commands/challenges/update.js")
            await runChallengesUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runChallengesDelete } = await import("./commands/challenges/delete.js")
            await runChallengesDelete(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          case "reorder": {
            const { runChallengesReorder } = await import("./commands/challenges/reorder.js")
            await runChallengesReorder(client, rest[2], rest.slice(3))
            break
          }
          default:
            console.error(`Unknown challenges command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "announcements": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runAnnouncementsList } = await import("./commands/announcements/list.js")
            await runAnnouncementsList(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runAnnouncementsCreate } = await import("./commands/announcements/create.js")
            await runAnnouncementsCreate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runAnnouncementsUpdate } = await import("./commands/announcements/update.js")
            await runAnnouncementsUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runAnnouncementsDelete } = await import("./commands/announcements/delete.js")
            await runAnnouncementsDelete(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          case "publish": {
            const { runAnnouncementsPublish } = await import("./commands/announcements/publish.js")
            await runAnnouncementsPublish(client, rest[2], rest[3], { json: flags.json })
            break
          }
          case "schedule": {
            const { runAnnouncementsSchedule } = await import("./commands/announcements/schedule.js")
            await runAnnouncementsSchedule(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "unpublish": {
            const { runAnnouncementsUnpublish } = await import("./commands/announcements/unpublish.js")
            await runAnnouncementsUnpublish(client, rest[2], rest[3], { json: flags.json })
            break
          }
          default:
            console.error(`Unknown announcements command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "teams": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runTeamsList } = await import("./commands/teams/list.js")
            await runTeamsList(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runTeamsCreate } = await import("./commands/teams/create.js")
            await runTeamsCreate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runTeamsUpdate } = await import("./commands/teams/update.js")
            await runTeamsUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update-members": {
            const { runTeamsUpdateMembers } = await import("./commands/teams/update-members.js")
            await runTeamsUpdateMembers(client, rest[2], rest[3], rest.slice(4))
            break
          }
          case "assign-room": {
            const { runTeamsAssignRoom } = await import("./commands/teams/assign-room.js")
            await runTeamsAssignRoom(client, rest[2], rest[3], rest.slice(4))
            break
          }
          case "unassign-room": {
            const { runTeamsUnassignRoom } = await import("./commands/teams/unassign-room.js")
            await runTeamsUnassignRoom(client, rest[2], rest[3], rest[4])
            break
          }
          default:
            console.error(`Unknown teams command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "rooms": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "judges": {
            const judgesSub = rest[2]
            switch (judgesSub) {
              case "add": {
                const { runRoomsJudgesAdd } = await import("./commands/rooms/judges-add.js")
                await runRoomsJudgesAdd(client, rest[3], rest[4], rest.slice(5))
                break
              }
              case "remove": {
                const { runRoomsJudgesRemove } = await import("./commands/rooms/judges-remove.js")
                await runRoomsJudgesRemove(client, rest[3], rest[4], rest[5])
                break
              }
              default:
                console.error(`Unknown rooms judges command: ${judgesSub}`)
                process.exit(1)
            }
            break
          }
          case "auto-assign": {
            const autoSub = rest[2]
            switch (autoSub) {
              case "get": {
                const { runRoomsAutoAssignGet } = await import("./commands/rooms/auto-assign-get.js")
                await runRoomsAutoAssignGet(client, rest[3], { json: flags.json })
                break
              }
              case "set": {
                const { runRoomsAutoAssignSet } = await import("./commands/rooms/auto-assign-set.js")
                await runRoomsAutoAssignSet(client, rest[3], rest.slice(4))
                break
              }
              case "sync": {
                const { runRoomsAutoAssignSync } = await import("./commands/rooms/auto-assign-sync.js")
                await runRoomsAutoAssignSync(client, rest[3], { json: flags.json })
                break
              }
              default:
                console.error(`Unknown rooms auto-assign command: ${autoSub}`)
                process.exit(1)
            }
            break
          }
          default:
            console.error(`Unknown rooms command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "sponsors": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runSponsorsList } = await import("./commands/sponsors/list.js")
            await runSponsorsList(client, rest[2], { json: flags.json })
            break
          }
          case "add": {
            const { runSponsorsAdd } = await import("./commands/sponsors/add.js")
            await runSponsorsAdd(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runSponsorsUpdate } = await import("./commands/sponsors/update.js")
            await runSponsorsUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "remove": {
            const { runSponsorsRemove } = await import("./commands/sponsors/remove.js")
            await runSponsorsRemove(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          case "reorder": {
            const { runSponsorsReorder } = await import("./commands/sponsors/reorder.js")
            await runSponsorsReorder(client, rest[2], rest.slice(3))
            break
          }
          default:
            console.error(`Unknown sponsors command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "perks": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runPerksList } = await import("./commands/perks/list.js")
            await runPerksList(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runPerksCreate } = await import("./commands/perks/create.js")
            await runPerksCreate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runPerksUpdate } = await import("./commands/perks/update.js")
            await runPerksUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runPerksDelete } = await import("./commands/perks/delete.js")
            await runPerksDelete(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          case "release": {
            const { runPerksRelease } = await import("./commands/perks/release.js")
            await runPerksRelease(client, rest[2], rest[3], { json: flags.json })
            break
          }
          default:
            console.error(`Unknown perks command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "judge-display": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runJudgeDisplayList } = await import("./commands/judge-display/list.js")
            await runJudgeDisplayList(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runJudgeDisplayCreate } = await import("./commands/judge-display/create.js")
            await runJudgeDisplayCreate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runJudgeDisplayUpdate } = await import("./commands/judge-display/update.js")
            await runJudgeDisplayUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runJudgeDisplayDelete } = await import("./commands/judge-display/delete.js")
            await runJudgeDisplayDelete(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          case "reorder": {
            const { runJudgeDisplayReorder } = await import("./commands/judge-display/reorder.js")
            await runJudgeDisplayReorder(client, rest[2], rest.slice(3))
            break
          }
          default:
            console.error(`Unknown judge-display command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "results": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "calculate": {
            const { runResultsCalculate } = await import("./commands/results/calculate.js")
            await runResultsCalculate(client, rest[2], { json: flags.json })
            break
          }
          case "get": {
            const { runResultsGet } = await import("./commands/results/get.js")
            await runResultsGet(client, rest[2], { json: flags.json })
            break
          }
          case "publish": {
            const { runResultsPublish } = await import("./commands/results/publish.js")
            await runResultsPublish(client, rest[2], { yes: flags.yes })
            break
          }
          case "unpublish": {
            const { runResultsUnpublish } = await import("./commands/results/unpublish.js")
            await runResultsUnpublish(client, rest[2], { yes: flags.yes })
            break
          }
          default:
            console.error(`Unknown results command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "webhooks": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runWebhooksList } = await import("./commands/webhooks/list.js")
            await runWebhooksList(client, { json: flags.json })
            break
          }
          case "create": {
            const { runWebhooksCreate } = await import("./commands/webhooks/create.js")
            await runWebhooksCreate(client, rest.slice(2).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runWebhooksDelete } = await import("./commands/webhooks/delete.js")
            await runWebhooksDelete(client, rest[2], { yes: flags.yes })
            break
          }
          default:
            console.error(`Unknown webhooks command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "jobs": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runJobsList } = await import("./commands/jobs/list.js")
            await runJobsList(client, rest.slice(2), { json: flags.json })
            break
          }
          case "get": {
            const { runJobsGet } = await import("./commands/jobs/get.js")
            await runJobsGet(client, rest[2], { json: flags.json })
            break
          }
          case "create": {
            const { runJobsCreate } = await import("./commands/jobs/create.js")
            await runJobsCreate(client, rest.slice(2).concat(flags.json ? ["--json"] : []))
            break
          }
          case "result": {
            const { runJobsResult } = await import("./commands/jobs/result.js")
            await runJobsResult(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "cancel": {
            const { runJobsCancel } = await import("./commands/jobs/cancel.js")
            await runJobsCancel(client, rest[2], { yes: flags.yes })
            break
          }
          default:
            console.error(`Unknown jobs command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "schedule": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runScheduleList } = await import("./commands/schedule/list.js")
            await runScheduleList(client, rest[2], { json: flags.json })
            break
          }
          case "add": {
            const { runScheduleAdd } = await import("./commands/schedule/add.js")
            await runScheduleAdd(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "update": {
            const { runScheduleUpdate } = await import("./commands/schedule/update.js")
            await runScheduleUpdate(client, rest[2], rest[3], rest.slice(4).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runScheduleDelete } = await import("./commands/schedule/delete.js")
            await runScheduleDelete(client, rest[2], rest[3], { yes: flags.yes })
            break
          }
          default:
            console.error(`Unknown schedule command: ${sub}`)
            process.exit(1)
        }
        break
      }

      case "schedules": {
        const client = createAuthenticatedClient(flags)
        switch (sub) {
          case "list": {
            const { runSchedulesList } = await import("./commands/schedules/list.js")
            await runSchedulesList(client, { json: flags.json })
            break
          }
          case "create": {
            const { runSchedulesCreate } = await import("./commands/schedules/create.js")
            await runSchedulesCreate(client, rest.slice(2).concat(flags.json ? ["--json"] : []))
            break
          }
          case "get": {
            const { runSchedulesGet } = await import("./commands/schedules/get.js")
            await runSchedulesGet(client, rest[2], { json: flags.json })
            break
          }
          case "update": {
            const { runSchedulesUpdate } = await import("./commands/schedules/update.js")
            await runSchedulesUpdate(client, rest[2], rest.slice(3).concat(flags.json ? ["--json"] : []))
            break
          }
          case "delete": {
            const { runSchedulesDelete } = await import("./commands/schedules/delete.js")
            await runSchedulesDelete(client, rest[2], { yes: flags.yes })
            break
          }
          default:
            console.error(`Unknown schedules command: ${sub}`)
            process.exit(1)
        }
        break
      }

      default:
        console.error(`Unknown command: ${command}. Run "hackathon --help" for usage.`)
        process.exit(1)
    }
  } catch (error) {
    if (error instanceof ScopeError) {
      console.error(formatError({ message: error.message, hint: error.hint }))
    } else if (error instanceof AuthError) {
      console.error(formatError({ message: error.message }))
    } else if (error instanceof ConfigError) {
      console.error(formatError({ message: error.message }))
    } else if (error instanceof ApiError) {
      console.error(formatError({ message: error.toString(), hint: error.hint }))
    } else if (error instanceof Error) {
      console.error(formatError({ message: error.message }))
    } else {
      console.error(formatError({ message: String(error) }))
    }
    process.exit(1)
  } finally {
    await notifyIfUpdateAvailable()
  }
}

main()

export type DocPage = {
  title: string
  description: string
  url: string
}

export const DOC_PAGES: DocPage[] = [
  { title: "Introduction", description: "Documentation for the hackathon.new platform.", url: "/docs" },
  { title: "Getting Started", description: "Set up authentication and make your first API call.", url: "/docs/getting-started" },
  { title: "Authentication", description: "Understand the authentication modes and choose the right one for your use case.", url: "/docs/authentication" },
  { title: "hackathon.new CLI", description: "Install and use the hackathon.new CLI to manage hackathons from your terminal.", url: "/docs/cli" },
  { title: "CLI Getting Started", description: "Authenticate and run your first CLI commands.", url: "/docs/cli/getting-started" },
  { title: "API Keys Setup", description: "Create, configure, and manage API keys for programmatic access.", url: "/docs/guides/api-keys-setup" },
  { title: "CLI for CI/CD & Automation", description: "Use the hackathon.new CLI in scripts, CI pipelines, and automated workflows.", url: "/docs/guides/cli-automation" },
  { title: "Browsing Hackathons", description: "Discover hackathons, view submissions, and check results from the terminal.", url: "/docs/guides/cli-browsing" },
  { title: "Managing Judges & Scoring", description: "Set up judging criteria, manage judges, and handle scoring assignments from the CLI.", url: "/docs/guides/cli-judging" },
  { title: "CLI for Event Organizers", description: "Run a hackathon end-to-end from the command line.", url: "/docs/guides/cli-organizer" },
  { title: "Crowd Voting", description: "Enable attendee voting and display results alongside judge scores.", url: "/docs/guides/crowd-voting" },
  { title: "Judging Modes", description: "Understand the two judging modes — points-based and subjective — and when to use each.", url: "/docs/guides/judging-modes" },
  { title: "Importing from Luma", description: "Create a hackathon by importing event details from a Luma event page.", url: "/docs/guides/luma-import" },
  { title: "Organization Setup", description: "Set up your organization profile, slug, logos, and public page.", url: "/docs/guides/organization-setup" },
  { title: "Results & Leaderboard", description: "Calculate results, review rankings, and publish the leaderboard.", url: "/docs/guides/results-leaderboard" },
  { title: "Sponsor Management", description: "Set up and manage hackathon sponsors with tiered visibility and branding.", url: "/docs/guides/sponsor-management" },
  { title: "Submissions", description: "Submit a project, upload screenshots, and manage your submission.", url: "/docs/guides/submissions" },
  { title: "Webhooks Guide", description: "Receive real-time notifications for hackathon and submission events.", url: "/docs/guides/webhooks" },
  { title: "API Keys", description: "Create, list, and revoke API keys for programmatic access via the REST API.", url: "/docs/sdk/api-keys" },
  { title: "Crowd Voting API", description: "Enable public voting on hackathon submissions via the REST API.", url: "/docs/sdk/crowd-voting" },
  { title: "Hackathons API", description: "Create, manage, and discover hackathon events via the REST API.", url: "/docs/sdk/hackathons" },
  { title: "Jobs API", description: "Create and manage async jobs via the REST API.", url: "/docs/sdk/jobs" },
  { title: "Judge Display API", description: "Manage public judge profiles with headshots and bios for the event page.", url: "/docs/sdk/judge-display" },
  { title: "Judging API", description: "Manage judging criteria, judges, assignments, and scoring via the REST API.", url: "/docs/sdk/judging" },
  { title: "Luma Import API", description: "Import hackathon details from Luma events via the REST API.", url: "/docs/sdk/luma-import" },
  { title: "Organizations API", description: "Manage organization profiles, logos, and public pages via the REST API.", url: "/docs/sdk/organizations" },
  { title: "Prizes API", description: "Create and manage hackathon prizes, reorder display, and assign winners via the REST API.", url: "/docs/sdk/prizes" },
  { title: "Registration & Teams API", description: "Register for hackathons, manage teams, and handle team invitations via the REST API.", url: "/docs/sdk/registration" },
  { title: "Results API", description: "Calculate, publish, and retrieve hackathon results and leaderboards via the REST API.", url: "/docs/sdk/results" },
  { title: "Schedules API", description: "Create and manage recurring jobs via the REST API.", url: "/docs/sdk/schedules" },
  { title: "Sponsors API", description: "Add, manage, and display hackathon sponsors with tiered visibility via the REST API.", url: "/docs/sdk/sponsors" },
  { title: "Submissions API", description: "Create, update, and browse project submissions via the REST API.", url: "/docs/sdk/submissions" },
  { title: "Webhooks API", description: "Register and manage webhook endpoints via the REST API.", url: "/docs/sdk/webhooks" },
  { title: "Hackathon Skills", description: "Installable AI agent skills for hackathon management, planning, and participation.", url: "/docs/skills" },
  { title: "Hackathon API Skill", description: "AI skill for interacting with the hackathon.new REST API directly via curl commands.", url: "/docs/skills/hackathon-api" },
  { title: "Hackathon Attendee Skill", description: "AI skill with tips and best practices for hackathon participants.", url: "/docs/skills/hackathon-attendee" },
  { title: "Hackathon CLI Skill", description: "AI skill for managing hackathons from the terminal using the hackathon.new CLI tool.", url: "/docs/skills/hackathon-cli" },
  { title: "Hackathon Organizer Skill", description: "AI skill with best practices and tips for planning and running successful hackathons.", url: "/docs/skills/hackathon-organizer" },
]

export const PINNED_DOC_URLS = ["/docs/getting-started", "/docs/authentication", "/docs/sdk/hackathons"]

export function searchDocs(query: string, limit = 2): DocPage[] {
  const q = query.toLowerCase()
  return DOC_PAGES.filter(
    (p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  ).slice(0, limit)
}

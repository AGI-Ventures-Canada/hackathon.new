# Contributing

Thanks for helping improve hackathon.new.

## Before you start

- Search existing issues and pull requests.
- Open an issue for a large change before investing significant time.
- Never put secrets, private event data, or personal data in issues, commits, tests, or screenshots.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).

## Local setup

You need Bun 1.3.14, Node.js 20.18.1 or newer, Docker, and the Supabase CLI.

```bash
git clone https://github.com/AGI-Ventures-Canada/hackathon.new.git
cd hackathon.new
bun install
cp .env.example .env.local
bun dev
```

Add your own Clerk development keys to `.env.local`. The local setup script
creates local Supabase values. It refuses to overwrite remote Supabase
credentials.

## Make a change

Create a branch from `staging`. Keep changes focused and add tests for new code.
Pages in `app/` stay server-rendered; interactive code belongs in a separate
client component. User-facing features must consider the app, WebMCP, and CLI
at the same time.

Run the complete local gate before opening a pull request:

```bash
bun lint
bun run build
bun run test:all
bun cli:build
```

Use Conventional Commits, such as `fix(cli): avoid shell invocation`. Open the
pull request against `staging` and complete every section in the template.

## Pull requests

- Explain the user outcome and any security impact.
- Record app, WebMCP, and CLI parity, even when a surface is not applicable.
- Include browser evidence for UI changes.
- Keep generated files, credentials, local auth data, and scan reports out of Git.
- Resolve all review warnings before merge.

The maintainers may close changes that are unsafe, out of scope, or difficult to
maintain. Constructive alternatives are welcome.

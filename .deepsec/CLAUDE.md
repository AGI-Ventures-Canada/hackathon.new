# Agent setup

This is the DeepSec workspace for the parent hackathon.new repository.

## Common tasks

- Run or resume a scan with `bun run deepsec scan` and `bun run deepsec process`.
- Add another project with `bun run deepsec init-project <root>`.
- Before writing a matcher, read `node_modules/deepsec/dist/docs/writing-matchers.md`.

Generated scan data, reports, credentials, and installed dependencies stay ignored. Commit only reviewed configuration, context, matchers, and lockfiles.

const glob = new Bun.Glob("__tests__/integration/*.integration.test.ts")
const available = [...glob.scanSync(".")].sort()
const args = process.argv.slice(2)
if (args.length && (args[0] !== "--files" || args.length < 2 || args.slice(1).some((file) => !available.includes(file)))) {
  console.error("Use --files followed by existing integration test paths.")
  process.exit(1)
}
const files = args.length ? available.filter((file) => args.slice(1).includes(file)) : available

for (const file of files) {
  console.log(`\n--- Running: ${file} ---`)
  const proc = Bun.spawn(["bun", "test", file], {
    stdio: ["inherit", "inherit", "inherit"],
    cwd: import.meta.dir + "/..",
  })
  const code = await proc.exited
  if (code !== 0) {
    console.error(`\nFailed: ${file}`)
    process.exit(code)
  }
}

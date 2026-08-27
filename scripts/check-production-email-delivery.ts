import { verifyProductionEmailDelivery } from "@/lib/email/production-policy"

const shouldCheck =
  process.env.VERCEL_ENV === "production" ||
  process.argv.includes("--force")

if (!shouldCheck) {
  console.log("Skipping production email delivery check outside production.")
  process.exit(0)
}

try {
  const result = await verifyProductionEmailDelivery()
  console.log(
    `Production email delivery uses Resend for all ${result.templateCount} Clerk templates.`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

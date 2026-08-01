import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { buildTransitionEmail } from "@/lib/email/transition-notifications"

describe("Transition Email Templates", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.hackathon.new"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
  })

  it("builds hackathon_started email", async () => {
    const email = await buildTransitionEmail("hackathon_started", "AI Hackathon", "ai-hackathon")

    expect(email.subject).toContain("AI Hackathon")
    expect(email.subject).toContain("live")
    expect(email.html).toContain("AI Hackathon")
    expect(email.html).toContain("https://test.hackathon.new/e/ai-hackathon")
    expect(email.html).toContain("Is Live!")
    expect(email.text).toContain("AI Hackathon")
    expect(email.tag).toBe("AI_Hackathon")
  })

  it("builds judging_started email", async () => {
    const email = await buildTransitionEmail("judging_started", "Code Jam", "code-jam")

    expect(email.subject).toContain("Judging")
    expect(email.html).toContain("Judging Has Begun")
    expect(email.html).toContain("https://test.hackathon.new/e/code-jam")
    expect(email.text).toContain("Judging is now underway")
  })

  it("builds results_published email", async () => {
    const email = await buildTransitionEmail("results_published", "Hack Day", "hack-day")

    expect(email.subject).toContain("Results")
    expect(email.html).toContain("Results Are In!")
    expect(email.html).toContain("View Results")
    expect(email.text).toContain("Results have been published")
  })

  it("builds registration_opened email", async () => {
    const email = await buildTransitionEmail("registration_opened", "Open Hack", "open-hack")

    expect(email.subject).toContain("Registration")
    expect(email.html).toContain("Registration Is Open")
    expect(email.html).toContain("Register Now")
  })

  it("escapes HTML in hackathon names", async () => {
    const email = await buildTransitionEmail("hackathon_started", '<script>alert("xss")</script>', "xss-hack")

    expect(email.html).not.toContain("<script>")
    expect(email.html).toContain("&lt;script&gt;")
  })

  it("sanitizes hackathon name for email tag", async () => {
    const email = await buildTransitionEmail("hackathon_started", "AI & ML Hackathon 2026!", "ai-ml-hack")

    expect(email.tag).toBe("AI_ML_Hackathon_2026_")
  })
})

export type TeamSizeWarning = {
  type: "below_min" | "solo_not_allowed"
  message: string
  memberCount: number
  requiredMin: number
}

export function getTeamSizeWarning(opts: {
  memberCount: number
  minTeamSize: number
  allowSolo: boolean
  pendingInviteCount?: number
}): TeamSizeWarning | null {
  const effectiveMin = opts.allowSolo
    ? Math.min(1, opts.minTeamSize)
    : opts.minTeamSize
  const pending = opts.pendingInviteCount ?? 0

  if (opts.memberCount >= effectiveMin) return null

  if (pending > 0 && opts.memberCount + pending >= effectiveMin) {
    return {
      type: "below_min",
      message: `Your team needs at least ${effectiveMin} members to submit. You have ${pending} pending invite${pending === 1 ? "" : "s"} — once accepted, you're all set.`,
      memberCount: opts.memberCount,
      requiredMin: effectiveMin,
    }
  }

  if (opts.memberCount === 1 && !opts.allowSolo) {
    return {
      type: "solo_not_allowed",
      message: `Solo participants are not allowed — this event requires teams of at least ${opts.minTeamSize}.`,
      memberCount: opts.memberCount,
      requiredMin: effectiveMin,
    }
  }

  return {
    type: "below_min",
    message: `Your team has ${opts.memberCount} member${opts.memberCount === 1 ? "" : "s"} but this event requires at least ${effectiveMin}.`,
    memberCount: opts.memberCount,
    requiredMin: effectiveMin,
  }
}

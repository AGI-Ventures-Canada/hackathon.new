type EmailAddressLike = {
  emailAddress: string
  verification?: { status?: string | null } | null
}

type UserWithEmailAddresses = {
  emailAddresses?: EmailAddressLike[] | null
}

export function getVerifiedUserEmails(user: UserWithEmailAddresses): string[] {
  return Array.from(
    new Set(
      (user.emailAddresses ?? [])
        .filter((address) => address.verification?.status === "verified")
        .map((address) => address.emailAddress.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

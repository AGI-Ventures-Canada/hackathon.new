import { auth } from "@clerk/nextjs/server"
import { resolvePageTenant } from "@/lib/services/tenants"
import { getPublicTenantById } from "@/lib/services/tenant-profiles"
import {
  listOrganizationPeople,
  type OrganizationPeople,
} from "@/lib/services/organization-members"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { OrganizationTeamCard } from "@/components/org/organization-team-card"
import { ProfileForm } from "./profile-form"

type OrganizationPeopleState = OrganizationPeople & {
  loadError: string | null
}

const emptyOrganizationPeople: OrganizationPeople = {
  members: [],
  invitations: [],
  memberCount: 0,
  invitationCount: 0,
}

async function getOrganizationPeople(
  organizationId: string | null
): Promise<OrganizationPeopleState> {
  if (!organizationId) {
    return { ...emptyOrganizationPeople, loadError: null }
  }

  try {
    const people = await listOrganizationPeople(organizationId)
    return { ...people, loadError: null }
  } catch (error) {
    console.error("Failed to load organization people.", { organizationId, error })
    return {
      ...emptyOrganizationPeople,
      loadError: "We couldn't load team details. Refresh the page to try again.",
    }
  }
}

export default async function SettingsProfilePage() {
  const tenant = await resolvePageTenant()
  const profile = await getPublicTenantById(tenant.id)
  const { userId, orgRole } = await auth()
  const people = await getOrganizationPeople(tenant.clerk_org_id)

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Organization Profile"
          description="Unable to load organization profile"
        />
      </div>
    )
  }

  const teamCardKey = [
    tenant.clerk_org_id ?? "personal",
    people.loadError ? "error" : "loaded",
    people.memberCount,
    people.invitationCount,
    people.members.map((member) => member.userId).join(","),
    people.invitations.map((invitation) => invitation.id).join(","),
  ].join(":")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Profile"
        description="Customize your organization's public appearance"
      />

      <Card>
        <CardHeader>
          <CardTitle>Public Profile</CardTitle>
          <CardDescription>
            This information appears on your public event pages and sponsor cards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialData={{
              name: profile.name,
              slug: profile.slug,
              logoUrl: profile.logo_url,
              logoUrlDark: profile.logo_url_dark,
              description: profile.description,
              websiteUrl: profile.website_url,
            }}
          />
        </CardContent>
      </Card>

      <OrganizationTeamCard
        key={teamCardKey}
        initialMembers={people.members}
        initialInvitations={people.invitations}
        memberCount={people.memberCount}
        invitationCount={people.invitationCount}
        loadError={people.loadError}
        currentUserId={userId}
        canManage={tenant.clerk_org_id !== null && orgRole === "org:admin"}
        hasOrganization={tenant.clerk_org_id !== null}
      />
    </div>
  )
}

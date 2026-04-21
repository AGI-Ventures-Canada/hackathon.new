"use client"

import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseRow,
  ShowcaseStack,
  ShowcaseLabel,
} from "../_section-layout"
import type { ShowcaseData } from "../_mock-data"
import { useSandbox } from "../_sandbox"

import { SponsorCard } from "@/components/hackathon/sponsor-card"
import { SponsorSection } from "@/components/hackathon/sponsor-section"
import { SponsorFulfillmentView } from "@/components/hackathon/prizes/sponsor-fulfillment-view"
import { SponsorLogoUpload } from "@/components/hackathon/edit-drawer/sponsor-logo-upload"
import { SponsoringDashboard } from "@/app/(dashboard)/home/sponsoring/sponsoring-dashboard"

const SECTIONS = [
  { id: "sponsor-card", label: "Sponsor card" },
  { id: "sponsor-section", label: "Sponsor section" },
  { id: "logo-upload", label: "Logo upload" },
  { id: "fulfillment-view", label: "Fulfillment view" },
  { id: "sponsoring-dashboard", label: "Sponsoring dashboard" },
]

export function SponsorShowcase({ data }: { data: ShowcaseData }) {
  const { record } = useSandbox()
  const { hackathon } = data

  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection
        id="sponsor-card"
        title="Sponsor card"
        description="Individual sponsor tile in three sizes."
      >
        <ShowcaseStack>
          <ShowcaseLabel>Small</ShowcaseLabel>
          <ShowcaseRow>
            {data.sponsors.map((s) => (
              <SponsorCard key={s.id} sponsor={s} size="sm" />
            ))}
          </ShowcaseRow>
          <ShowcaseLabel>Medium</ShowcaseLabel>
          <ShowcaseRow>
            {data.sponsors.map((s) => (
              <SponsorCard key={s.id} sponsor={s} size="md" />
            ))}
          </ShowcaseRow>
          <ShowcaseLabel>Large</ShowcaseLabel>
          <ShowcaseRow>
            {data.sponsors.map((s) => (
              <SponsorCard key={s.id} sponsor={s} size="lg" />
            ))}
          </ShowcaseRow>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection
        id="sponsor-section"
        title="Sponsor section"
        description="Event-page block grouping sponsors by tier."
      >
        <SponsorSection sponsors={data.sponsors} />
      </ShowcaseSection>

      <ShowcaseSection
        id="logo-upload"
        title="Logo upload"
        description="Sponsor logo uploader (light + dark). In sandbox, the file is captured but not sent."
      >
        <ShowcaseRow>
          <div className="w-64">
            <ShowcaseLabel>Light</ShowcaseLabel>
            <SponsorLogoUpload
              hackathonId={hackathon.id}
              sponsorId={data.sponsors[0]?.id ?? null}
              logoUrl={null}
              variant="light"
              onFileSelected={(f) => record(`Selected logo (light): ${f.name}`)}
              onUploaded={(url) => record(`Uploaded logo (light): ${url}`)}
            />
          </div>
          <div className="w-64">
            <ShowcaseLabel>Dark</ShowcaseLabel>
            <SponsorLogoUpload
              hackathonId={hackathon.id}
              sponsorId={data.sponsors[0]?.id ?? null}
              logoUrl={null}
              variant="dark"
              onFileSelected={(f) => record(`Selected logo (dark): ${f.name}`)}
              onUploaded={(url) => record(`Uploaded logo (dark): ${url}`)}
            />
          </div>
        </ShowcaseRow>
      </ShowcaseSection>

      <ShowcaseSection
        id="fulfillment-view"
        title="Fulfillment view"
        description="Sponsor tracking of assigned prizes: contacted → shipped → claimed."
      >
        <SponsorFulfillmentView
          hackathonId={hackathon.id}
          fulfillments={[
            {
              fulfillmentId: "ff-1",
              prizeName: "Grand prize",
              prizeValue: "$5,000",
              submissionTitle: "Loopback",
              teamName: "Team 1",
              status: "assigned",
              recipientName: "Avery Chen",
              recipientEmail: "avery@example.com",
              shippingAddress: null,
              paymentMethod: null,
              paymentDetail: null,
              trackingNumber: null,
              claimedAt: null,
            },
            {
              fulfillmentId: "ff-2",
              prizeName: "Crowd favorite",
              prizeValue: "$500",
              submissionTitle: "Oatbot",
              teamName: "Team 2",
              status: "shipped",
              recipientName: "Jamie Kim",
              recipientEmail: "jamie@example.com",
              shippingAddress: "123 Example St, Toronto, ON",
              paymentMethod: "bank_transfer",
              paymentDetail: "****1234",
              trackingNumber: "1Z999AA10123456784",
              claimedAt: null,
            },
          ]}
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="sponsoring-dashboard"
        title="Sponsoring dashboard"
        description="Top-level view of all hackathons this sponsor supports."
      >
        <SponsoringDashboard
          hackathons={[
            {
              id: hackathon.id,
              slug: hackathon.slug,
              name: hackathon.name,
              description: hackathon.description,
              status: hackathon.status,
              registration_opens_at: hackathon.registration_opens_at,
              registration_closes_at: hackathon.registration_closes_at,
              starts_at: hackathon.starts_at,
              ends_at: hackathon.ends_at,
            },
          ]}
          sponsorships={{
            [hackathon.id]: {
              hackathonId: hackathon.id,
              tier: "gold",
              customTierLabel: null,
              name: "Acme Robotics",
            },
          }}
        />
      </ShowcaseSection>
    </SectionLayout>
  )
}

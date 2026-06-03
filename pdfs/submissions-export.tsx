import React from "react"
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Link,
  pdf,
} from "@react-pdf/renderer"
import type {
  EnrichedExportPayload,
  ExportFilters,
  ExportSubmissionRow,
  ExportUserDirectory,
} from "@/lib/services/submission-exports"
import { formatJudgeLabel, formatMemberLabel } from "@/lib/workflows/export-submissions/format"

const colors = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  primary: "#0f172a",
  accent: "#1e293b",
  prizeBg: "#fef3c7",
  prizeText: "#78350f",
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.text,
    lineHeight: 1.5,
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    marginBottom: 14,
  },
  coverSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 32,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 12,
  },
  coverMetaValue: {
    fontSize: 12,
    color: colors.text,
    marginTop: 2,
  },
  filtersBlock: {
    marginTop: 32,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
  },
  filtersHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 6,
  },
  filterLine: {
    fontSize: 10,
    marginBottom: 2,
  },
  submissionHeader: {
    marginBottom: 10,
  },
  rankBadge: {
    fontSize: 10,
    color: colors.prizeText,
    backgroundColor: colors.prizeBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
    alignSelf: "flex-start",
  },
  submissionTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  submissionTeam: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 9,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 10,
    marginBottom: 4,
  },
  link: {
    color: colors.accent,
    textDecoration: "underline",
  },
  linkLine: {
    fontSize: 10,
    marginBottom: 2,
  },
  table: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowLast: {
    flexDirection: "row",
  },
  tableHeaderCell: {
    padding: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: colors.muted,
  },
  tableCell: {
    padding: 6,
    fontSize: 9,
  },
  colJudge: { flex: 2 },
  colCriterion: { flex: 2 },
  colScore: { flex: 1, textAlign: "right" },
  noteBlock: {
    marginBottom: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  noteAuthor: {
    fontSize: 9,
    color: colors.muted,
    marginBottom: 2,
  },
  noteBody: {
    fontSize: 10,
  },
  pageNumber: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 9,
    color: colors.muted,
  },
  empty: {
    fontSize: 10,
    color: colors.muted,
    fontStyle: "italic",
  },
})

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return value.toFixed(2)
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "long" })
}

function describeFilter(filters: ExportFilters): string[] {
  return [
    `Winners only: ${filters.winnersOnly ? "yes" : "no"}`,
    `Include drafts: ${filters.includeDrafts ? "yes" : "no"}`,
    `Include judge notes: ${filters.includeJudgeNotes ? "yes" : "no"}`,
  ]
}

function CoverPage({ payload }: { payload: EnrichedExportPayload }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.coverTitle}>{payload.hackathon.name}</Text>
      <Text style={styles.coverSubtitle}>Submissions Export</Text>

      <Text style={styles.coverMetaLabel}>Generated</Text>
      <Text style={styles.coverMetaValue}>{formatDate(payload.generatedAt)}</Text>

      <Text style={styles.coverMetaLabel}>Event window</Text>
      <Text style={styles.coverMetaValue}>
        {formatDateOnly(payload.hackathon.startsAt)} → {formatDateOnly(payload.hackathon.endsAt)}
      </Text>

      <Text style={styles.coverMetaLabel}>Submissions included</Text>
      <Text style={styles.coverMetaValue}>{payload.submissions.length}</Text>

      <View style={styles.filtersBlock}>
        <Text style={styles.filtersHeading}>Filters applied</Text>
        {describeFilter(payload.filters).map((line) => (
          <Text key={line} style={styles.filterLine}>
            • {line}
          </Text>
        ))}
      </View>

      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
        fixed
      />
    </Page>
  )
}

function SubmissionSection({
  submission,
  users,
  index,
  filters,
}: {
  submission: ExportSubmissionRow
  users: ExportUserDirectory
  index: number
  filters: ExportFilters
}) {
  const memberLines = (submission.team?.members ?? []).map((m) =>
    formatMemberLabel(m, users)
  )

  const prizeLabels = submission.prizes.map((p) => p.name)
  const rankLine = submission.result
    ? `Rank #${submission.result.rank}${
        submission.result.weightedScore !== null
          ? ` · weighted ${submission.result.weightedScore.toFixed(2)}`
          : ""
      }`
    : null

  return (
    <Page size="A4" style={styles.page} break={index > 0}>
      <View style={styles.submissionHeader}>
        {(rankLine || prizeLabels.length > 0) && (
          <Text style={styles.rankBadge}>
            {[rankLine, ...prizeLabels].filter(Boolean).join(" · ")}
          </Text>
        )}
        <Text style={styles.submissionTitle}>{submission.title}</Text>
        <Text style={styles.submissionTeam}>
          {submission.team?.name ?? "Solo submission"} · status: {submission.status}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Team members</Text>
      {memberLines.length > 0 ? (
        memberLines.map((line) => (
          <Text key={line} style={styles.paragraph}>
            {line}
          </Text>
        ))
      ) : (
        <Text style={styles.empty}>No members on record.</Text>
      )}

      <Text style={styles.sectionLabel}>Description</Text>
      <Text style={styles.paragraph}>
        {submission.description?.trim() || "No description provided."}
      </Text>

      <Text style={styles.sectionLabel}>Links</Text>
      {submission.githubUrl && (
        <Text style={styles.linkLine}>
          GitHub: <Link style={styles.link} src={submission.githubUrl}>{submission.githubUrl}</Link>
        </Text>
      )}
      {submission.liveAppUrl && (
        <Text style={styles.linkLine}>
          Live app: <Link style={styles.link} src={submission.liveAppUrl}>{submission.liveAppUrl}</Link>
        </Text>
      )}
      {submission.demoVideoUrl && (
        <Text style={styles.linkLine}>
          Demo video: <Link style={styles.link} src={submission.demoVideoUrl}>{submission.demoVideoUrl}</Link>
        </Text>
      )}
      {submission.screenshotUrl && (
        <Text style={styles.linkLine}>
          Screenshot: <Link style={styles.link} src={submission.screenshotUrl}>{submission.screenshotUrl}</Link>
        </Text>
      )}
      {!submission.githubUrl &&
        !submission.liveAppUrl &&
        !submission.demoVideoUrl &&
        !submission.screenshotUrl && (
          <Text style={styles.empty}>No links provided.</Text>
        )}

      {submission.socialSubmissions.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Social posts</Text>
          {submission.socialSubmissions.map((soc, i) => (
            <Text key={i} style={styles.linkLine}>
              {soc.platform ?? "Post"}:{" "}
              <Link style={styles.link} src={soc.url}>
                {soc.url}
              </Link>
              {soc.ogTitle ? ` — ${soc.ogTitle}` : ""}
            </Text>
          ))}
        </>
      )}

      <Text style={styles.sectionLabel}>Judge scores</Text>
      {submission.scores.length > 0 ? (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableHeaderCell, styles.colJudge]}>Judge</Text>
            <Text style={[styles.tableHeaderCell, styles.colCriterion]}>Criterion</Text>
            <Text style={[styles.tableHeaderCell, styles.colScore]}>Score</Text>
          </View>
          {submission.scores.map((score, i) => {
            const judgeLabel = formatJudgeLabel(score.judgeClerkUserId ?? null, users)
            const isLast = i === submission.scores.length - 1
            return (
              <View key={i} style={isLast ? styles.tableRowLast : styles.tableRow}>
                <Text style={[styles.tableCell, styles.colJudge]}>{judgeLabel}</Text>
                <Text style={[styles.tableCell, styles.colCriterion]}>{score.criteriaName}</Text>
                <Text style={[styles.tableCell, styles.colScore]}>
                  {formatScore(score.score)}
                </Text>
              </View>
            )
          })}
        </View>
      ) : (
        <Text style={styles.empty}>No scores recorded.</Text>
      )}

      {filters.includeJudgeNotes && (
        <>
          <Text style={styles.sectionLabel}>Judge notes</Text>
          {submission.judgeNotes.length > 0 ? (
            submission.judgeNotes.map((note, i) => {
              const judgeLabel = formatJudgeLabel(note.judgeClerkUserId ?? null, users)
              return (
                <View key={i} style={styles.noteBlock}>
                  <Text style={styles.noteAuthor}>{judgeLabel}</Text>
                  <Text style={styles.noteBody}>{note.notes}</Text>
                </View>
              )
            })
          ) : (
            <Text style={styles.empty}>No judge notes.</Text>
          )}
        </>
      )}

      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
        fixed
      />
    </Page>
  )
}

function SubmissionsExportDocument({ payload }: { payload: EnrichedExportPayload }) {
  return (
    <Document
      title={`${payload.hackathon.name} — Submissions Export`}
      author="Oatmeal"
      subject="Hackathon submissions export"
    >
      <CoverPage payload={payload} />
      {payload.submissions.map((submission, i) => (
        <SubmissionSection
          key={submission.id}
          submission={submission}
          users={payload.users}
          index={i}
          filters={payload.filters}
        />
      ))}
    </Document>
  )
}

export async function renderSubmissionsExportPdf(
  payload: EnrichedExportPayload
): Promise<Buffer> {
  const instance = pdf(<SubmissionsExportDocument payload={payload} />)
  const stream = await instance.toBuffer()
  return await streamToBuffer(stream)
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer))
  }
  return Buffer.concat(chunks)
}

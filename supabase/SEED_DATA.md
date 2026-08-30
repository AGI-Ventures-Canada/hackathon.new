# Local seed data

`bun db:sync` builds a full local demo database. The seed is made from the
numbered files in `supabase/seeds/`. Edit those files, then rebuild the combined
file with:

```bash
cat supabase/seeds/*.sql > supabase/seed.sql
```

## Rich lifecycle showcase

The `rich-lifecycle-showcase` collection gives product work and QA a broad,
safe set of fictional data. It has 14 event themes at every one of the 7 event
stages.

| Data | Showcase count after a clean reset |
| --- | ---: |
| Events | 98 |
| People | 3,024 |
| Teams | 574 |
| Projects | 560 |
| Sponsors | 392 |
| Team invites | 350 |
| Judge invites | 252 |
| Schedule items | 1,176 |
| Announcements | 252 |
| Challenges | 196 |
| Perks | 168 |
| Prizes | 294 |
| Judging rounds | 84 |
| Judge assignments | 868 |
| Scores | 2,856 |
| Results | 84 |
| Social posts | 112 |

The full local database now has 128 events, 3,187 people, 616 teams, 668
projects, and 423 sponsors. This is more than four times the prior count in
each core area.

### Event themes

- AI agents
- Climate and clean energy
- Health and wellness
- Fintech and commerce
- Education
- Accessibility and inclusion
- Robotics and manufacturing
- Space and aerospace
- Civic and community work
- Creative media
- Food and agriculture
- Cybersecurity and privacy
- Games and immersive worlds
- Open-source developer tools

Each theme has a draft, published event, open registration, live build,
judging, completed results, and archived alumni event. Event size, format,
location, team rules, terms, judging style, and access support also vary.

### People and team paths

The collection includes organizers, judges, mentors, attendees, solo builders,
team captains, full teams, teams waiting for approval, locked teams, and old
disbanded teams. Team and judge invites cover queued, pending, reminded,
accepted, declined, expired, and cancelled states.

All fake Clerk IDs start with `seed_user_`. This keeps local resets from adding
fake messages to the attendee email outbox.

### Projects and judging

Projects cover every project state: draft, submitted, under review, accepted,
rejected, and winner. Judging data includes first-look and final rounds, active
and finished scorecards, partial judging progress, four-part rubrics, results,
and prize assignments.

### Pictures

The showcase has 1,358 image-backed rows:

- 98 event banners
- 392 sponsor images
- 560 project screenshots
- 196 judge headshots
- 112 social preview images

The images use the already allowed `images.unsplash.com` host. Names, brands,
emails, links, projects, and people are fictional demo data.

## Quick checks

After `bun db:sync`, these queries should return `0`:

```sql
WITH rich_teams AS (
  SELECT teams.id, hackathons.max_team_size
  FROM teams
  JOIN hackathons ON hackathons.id = teams.hackathon_id
  WHERE hackathons.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
), occupancy AS (
  SELECT
    rich_teams.id,
    rich_teams.max_team_size,
    count(DISTINCT people.id) FILTER (WHERE people.role = 'participant') AS members,
    count(DISTINCT invites.id) FILTER (
      WHERE invites.status = 'pending' AND invites.expires_at > now()
    ) AS pending
  FROM rich_teams
  LEFT JOIN hackathon_participants people ON people.team_id = rich_teams.id
  LEFT JOIN team_invitations invites ON invites.team_id = rich_teams.id
  GROUP BY rich_teams.id, rich_teams.max_team_size
)
SELECT count(*)
FROM occupancy
WHERE members + pending > max_team_size;

SELECT count(*)
FROM submissions
JOIN hackathons ON hackathons.id = submissions.hackathon_id
WHERE hackathons.metadata->'seed'->>'collection' = 'rich-lifecycle-showcase'
  AND (
    (submissions.team_id IS NULL AND submissions.participant_id IS NULL)
    OR
    (submissions.team_id IS NOT NULL AND submissions.participant_id IS NOT NULL)
  );
```

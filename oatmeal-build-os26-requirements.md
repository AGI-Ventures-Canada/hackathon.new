# hackathon.new Feature Requirements: Build OS26

## Purpose

This document specifies 13 features hackathon.new needs to support Build OS26, a full-day hackathon for AI-native startup founders hosted by Mila (Quebec AI Institute) on April 28, 2026 in Montreal. The event is organized by Mila Ventures and will host 60-90 curated participants across 30+ teams competing for $30K in prizes over a 5-hour build window.

Build OS26 is a startup competition, not a coding competition. Both technical and business founders compete. Every attendee builds. There is no audience. The event enforces a "Laptops Open or Don't Come" policy, a build-from-scratch rule, and a curated guest list where every person was specifically chosen.

The features are grouped into two tiers. Features 1-8 are non-negotiable for April 28. Features 9-13 add significant value and should be built if time allows.

---

# Non-Negotiables for April 28

## 1. Challenge Distribution

**Who it's for:** Organizer, Teams (30+)

**What it does:** At 9:00 AM, after the 20-minute opening, the organizer pushes the challenge brief to all registered teams simultaneously. Every team member receives the brief on their device. The clock starts the moment the brief lands. No staggered delivery, no email chains, no "check the website." One push, everyone has it, the build begins.

The brief should support rich content: text, images, links to resources, embedded constraints, and prize category descriptions. Teams need to reference it throughout the 5-hour build, so it must remain accessible from their dashboard at all times.

**Why:** Build OS26 gives teams 5 hours. Every minute of confusion at the start compounds. The "Ship Real Work" principle means teams need to start building immediately, not hunting for instructions. A simultaneous push also creates the shared starting-gun moment that sets the energy for the day. With 30+ teams and 60-90 people, any distribution method that requires teams to go find the brief will produce a 10-15 minute delay while stragglers catch up.

---

## 2. Team Formation and Roster

**Who it's for:** Organizer, Teams, Mentors

**What it does:** Before event day, the organizer registers 60-90 participants and assigns them to 30+ teams of 2-3 people each. The roster tracks each participant's name, team assignment, and role (technical founder, business founder, designer, etc.).

Team composition data should be visible to the organizer and mentors so they can identify which teams are all-technical, all-business, or mixed. This matters for mentor routing and for understanding who might need help with what.

The system should handle late changes gracefully. On the morning of April 28, some participants will not show up and others will arrive as last-minute additions. The organizer needs to reassign people and adjust rosters in real time without disrupting teams already set up.

**Why:** "Curated Intimacy Over Scale" means every participant was hand-picked. The roster is the organizer's primary tool for maintaining that curation. With 60-90 people in a room, the organizer cannot rely on memory to know who is on which team. Mentors circulating during the build need to know team composition at a glance so they can offer relevant help: a team of three business founders needs different support than a team of three engineers.

---

## 3. Build Timer

**Who it's for:** Teams, MC, Organizer

**What it does:** A visible countdown timer runs from 9:20 AM to 2:20 PM (5 hours). The timer should be displayable on a projector or large screen so everyone in the room can see it. It should also appear on each team's dashboard.

At 2:20 PM, the timer hits zero and the build freezes. The submission form locks. No more commits, no more changes. The freeze must be enforced, not advisory.

The timer should support configurable alerts at milestones the organizer sets. Suggested defaults: 2 hours remaining, 1 hour remaining, 30 minutes remaining, 10 minutes remaining. These alerts help the MC make announcements and help teams manage their time.

**Why:** Five hours is short. Teams building from scratch (the "Ship Real Work" rule forbids pre-built projects) need constant time awareness to make scope decisions. The hard freeze at 2:20 PM is non-negotiable because judging starts at 2:30 PM. A 10-minute gap between freeze and pitches is already tight. If teams are allowed to keep working past 2:20, the schedule collapses. The timer also gives the MC a tool to build energy: "Two hours left, folks" is a natural prompt for check-ins and momentum shifts.

---

## 4. Submission Collection

**Who it's for:** Teams, Judges, Organizer

**What it does:** At build freeze (2:20 PM), teams submit their work through a structured form. The submission collects:

- Team name
- Project title
- One-paragraph description of what they built
- Demo link or video (screen recording of the working system)
- GitHub repo or equivalent (for technical verification)
- Which prize category they are competing in (Best Technical Build, Best Business Application, or both)
- Whether they want to be considered for Partner Prize(s)

The form locks at 2:20 PM when the build timer expires. Late submissions are not accepted.

Submissions must be immediately accessible to judges. Within minutes of the freeze, judges in both rooms need to see the submissions for the teams assigned to their room.

**Why:** The schedule gives 10 minutes between build freeze and the start of preliminary pitches. That means submission, routing to judges, and room assignment all need to happen in that window. A structured form (rather than email or Slack) ensures judges get consistent information. The demo link or video is critical because the pitch slots are only 4 minutes (2 demo + 2 Q&A). Teams that cannot show a working system in their submission are already behind. The category selection determines routing for the Grand Finals, where finalists compete head-to-head by category.

---

## 5. Dual-Room Judging

**Who it's for:** Judges (6), Organizer, MC

**What it does:** After submissions close, hackathon.new routes approximately 15 teams to each of the 2 simultaneous pitch rooms. Each room has 3 assigned judges. The system enforces 4-minute slots per team: 2 minutes for the demo, 2 minutes for Q&A.

The routing should be configurable by the organizer. Default behavior: split teams evenly across rooms, keeping teams competing in the same prize category distributed across both rooms (so judges in each room see a mix of Technical and Business submissions).

Each room needs a visible timer for the 4-minute slots. When time is up, it is up. The MC in each room needs to see which team is presenting now, which is next, and how many remain.

A team queue display shows the presentation order so teams in the hallway know when to be ready. Teams should be notified 2 teams before their slot (approximately 8 minutes warning).

**Why:** 30+ teams at 4 minutes each is 2+ hours in a single room. The event has 1 hour budgeted for preliminary pitches (2:30 PM to approximately 3:30 PM). Two simultaneous rooms cut that in half. Strict 4-minute enforcement is the only way to keep 15 teams moving through each room in 60 minutes. Without a visible timer and enforced cutoffs, teams will run over, judges will fall behind, and the Grand Finals timeline collapses. The 2-team advance notification prevents dead time between presentations.

---

## 6. Judging Rubric and Scoring

**Who it's for:** Judges (6), Organizer

**What it does:** hackathon.new provides judges with a structured scoring interface for two prize categories:

**Best Technical Build** rubric:
- Technical ambition (how hard was the problem they chose?)
- Execution quality (does it work? how well?)
- Agent architecture (is the system designed well? what happens when it fails?)
- Innovation (did they do something nobody else attempted?)

**Best Business Application** rubric:
- Real-world applicability (would someone pay for this?)
- Time/effort savings (how much manual work does it eliminate?)
- Production readiness (could this run next week?)
- Clarity of use case (can a non-technical person understand the value?)

Each criterion is scored on a 1-5 scale. Judges score independently during or immediately after each team's pitch. Scores aggregate in real time so the organizer can see standings as judging progresses.

The scoring interface must work on mobile devices. Judges will be sitting in pitch rooms, not at desks.

**Why:** Build OS26 has two distinct prize categories because "The Whole Startup Competes." A single rubric would either penalize non-technical teams on architecture questions or penalize technical teams on business applicability. Separate rubrics allow business founders to win on the strength of their use case, even if their implementation is simpler. Real-time aggregation matters because each room's jury needs to select finalists immediately after preliminary pitches end. There is no deliberation break built into the schedule. The technical judges need to ask "Walk me through the agent loop. What happens when it fails?" and the business judges need to ask "How much time does this save? Would you run it in production next week?" The rubric categories map to these questions.

---

## 7. Finalist Selection

**Who it's for:** Judges (6), Organizer

**What it does:** After preliminary pitches conclude in both rooms, each room's 3-judge panel selects the top teams for the Grand Finals. The system surfaces the aggregated scores and rankings to help judges make their picks.

Each room selects finalists by category. The target is 4 total finalists advancing to the Grand Finals (the exact split may vary, but the default is 1 Best Technical Build and 1 Best Business Application from each room).

The selection interface should show judges the score distribution, highlight ties, and allow manual override. Scores inform the decision but do not dictate it. Judges may choose a lower-scoring team if they believe the project has more potential than the numbers suggest.

Once selections are confirmed, the 4 finalists are notified immediately and given preparation time before the Grand Finals begin (approximately 10 minutes).

**Why:** The schedule is tight. Preliminary pitches end around 3:30 PM. Grand Finals start around 3:40 PM. The selection process must take minutes, not a drawn-out deliberation. Pre-aggregated scores with a clear interface let judges confirm what they already observed rather than starting from scratch. Manual override preserves the human judgment that matters most: some teams pitch poorly but built something impressive (the hackathon advisory principle that "judging starts during the event, not at presentations"). Immediate finalist notification gives teams a few minutes to prepare for the main stage.

---

## 8. Grand Finals Flow

**Who it's for:** Judges (6), Organizer, MC, Finalists (4 teams)

**What it does:** The 4 finalist teams present on the main stage in front of all 6 judges (the two room panels merged). Presentations are organized head-to-head by category: the two Best Technical Build finalists present back-to-back, then the two Best Business Application finalists.

All 6 judges score each finalist using the same rubric from the preliminary round. The interface shows which category is being judged and which teams are competing head-to-head.

After all 4 presentations, the system provides judges with a consolidated view: scores side-by-side for each head-to-head pair. Judges deliberate (the system does not decide the winner), then the organizer records the final results.

The system should support a "reveal" flow: winners are entered but not displayed publicly until the MC announces them during the cocktail hour (starting around 4:00 PM).

**Why:** The Grand Finals are the climax of the event. Head-to-head by category creates natural drama and makes comparison easier for judges who only saw half the teams during preliminaries. Three of the 6 judges are seeing each finalist for the first time, so the full rubric needs to be scored again. The delayed reveal matters because winners are announced during the public cocktail hour (150-200 attendees) and the organizer wants to control the timing of the announcement. If scores are visible on a shared screen, the result leaks before the MC gets to announce it.

---

# High-Value Additions

## 9. Mentor Coordination

**Who it's for:** Mentors (8-10), Teams, Organizer

**What it does:** The system tracks two types of mentors: station-based and circulating. Station-based mentors are assigned to specific workshop stations (agent loops, multi-agent orchestration, prompt engineering, API integration). Circulating mentors move between teams.

Teams can flag when they are stuck. The flag includes a short description of the blocker (technical, architectural, business strategy, integration) and the system routes it to the best available mentor based on expertise tags.

Mentors see a dashboard of active help requests, sorted by wait time. When a mentor picks up a request, the team is notified. The organizer sees an overview: which teams have been helped, which teams have been quiet (quiet teams during a 5-hour build often need a check-in more than teams asking for help).

**Why:** "Learn by Building" means no lectures. Workshop stations and mentors replace classroom instruction. But 8-10 mentors across 30+ teams means each mentor covers 3-4 teams. Without coordination, some teams get visited three times while others get none. The flag system prevents the failure mode where a team is stuck for an hour because they did not know who to ask. The quiet-team detection addresses the less obvious failure mode: teams that are stuck but do not ask for help. "Industry Partners Earn Their Seat" means the 1-2 tool engineers from sponsor companies are also circulating. They need the same visibility into which teams need help with their specific tools.

---

## 10. Social Media Prize Tracking

**Who it's for:** Organizer, Teams

**What it does:** Teams competing for the Social Media Prize submit links to their posts about Build OS26. The system tracks submitted posts and, where possible, pulls engagement metrics (likes, reposts, comments, views) to help the organizer evaluate.

The interface should allow teams to submit multiple posts across platforms (LinkedIn, X/Twitter, Instagram, etc.). The organizer reviews submissions and engagement data to select the winner.

Verification matters. The system should confirm that submitted posts are real (not deleted, not from fake accounts) and that they were published during the event window.

**Why:** The Social Media Prize rewards visibility and community building. With 60-90 participants from AI-native startups, the collective reach of their social networks is significant for Mila and for future Build OS events. Automated tracking reduces the organizer's burden. Without it, someone has to manually check dozens of posts across multiple platforms while also running the rest of the event. The verification step prevents gaming.

---

## 11. Partner Prize Integration

**Who it's for:** Sponsors, Organizer, Teams

**What it does:** The organizer can add custom prize categories tied to specific partner tools. For example: "Best Use of Claude Code" if Anthropic sponsors the event. Each partner prize gets its own submission flag (teams opt in when submitting) and its own judging criteria, defined by the sponsor.

Partner judges (separate from the 6 main judges) can access submissions tagged for their prize and score them independently. Partner prize winners are announced alongside the main categories.

The system should produce a post-event report for each sponsor: how many teams used their tool, which projects were submitted for their prize, and the winning team's details.

**Why:** "Industry Partners Earn Their Seat" means sponsors contribute engineers, not sales pitches. Partner prizes give sponsors a concrete reason to invest: they get data on how builders use their tools in a competitive setting, and they get to reward the best implementation. The post-event report is what makes this repeatable. A sponsor who can show their leadership "30 teams used our tool, here are the 5 best projects" has justification to sponsor the next event. Without structured tracking, sponsors get anecdotes instead of data.

---

## 12. Live Event Dashboard

**Who it's for:** MC, Organizer

**What it does:** A single screen showing the MC and organizer everything they need to run the event in real time:

- Current phase (build, submission, preliminary pitches, Grand Finals, cocktail)
- Build timer with countdown
- Submission status (X of Y teams submitted)
- Pitch room status (which team is presenting in each room, how many remain)
- Judging progress (how many teams scored, any judges lagging behind)
- Finalist status (selected / pending)
- Mentor activity (active help requests, teams flagged as quiet)
- Grand Finals queue and current presenter

The dashboard should be viewable on a laptop or tablet at the MC's podium. It does not need to be projected. This is an operational tool, not an audience display.

**Why:** The event runs from 8:30 AM to 6:00 PM with tight transitions between phases. The MC needs to know the exact state of the event at any moment to make announcements and keep the schedule on track. "Is Room B done with pitches yet?" should be answerable with a glance, not a Slack message. The organizer needs the same view to make decisions: if submissions are lagging at 2:18 PM, they need to know whether to extend the deadline or start nudging teams. Without a single operational view, the MC and organizer are piecing together status from multiple channels, which breaks down at the speed this event moves.

---

## 13. Post-Event

**Who it's for:** Organizer, Teams, Sponsors

**What it does:** After winners are announced, the system generates:

**Winner badges:** Digital badges or shareable cards for winning teams. Each badge includes the team name, project title, prize category, and Build OS26 branding. Teams can share these on LinkedIn and social media immediately.

**Slack community launch:** The system provisions or links to a post-event Slack community (or Discord) where participants can stay connected. Pre-populate with channels for each prize category, a general channel, and a channel for future events.

**Results summary for sponsors:** A structured report for each sponsor including: total teams, total participants, submissions per prize category, tools used, partner prize results, and social media reach from Social Media Prize submissions. This report should be exportable as a PDF or shareable link.

**Participant directory (opt-in):** An opt-in directory where participants can share their contact info and project details with other attendees. For a curated event of AI-native startup founders, the network is part of the value.

**Why:** Build OS26 ends at 6:00 PM, but the value should persist. Winner badges give teams something to share immediately while excitement is high. The Slack community preserves the network that "Curated Intimacy Over Scale" created. Sponsor reports are what make this a repeatable event. If sponsors can show measurable results from their participation, they return for Build OS27. The participant directory recognizes that for 60-90 AI-native startup founders, the connections made at this event may matter as much as the prizes.

---

# Appendix: Role-Feature Matrix

| Feature | Organizer | MC | Judges | Mentors | Teams | Sponsors |
|---|---|---|---|---|---|---|
| 1. Challenge Distribution | Triggers push | - | - | - | Receives brief | - |
| 2. Team Formation and Roster | Manages roster | - | - | Views composition | Views assignment | - |
| 3. Build Timer | Configures alerts | Displays timer | - | - | Views countdown | - |
| 4. Submission Collection | Monitors status | - | Reviews submissions | - | Submits work | - |
| 5. Dual-Room Judging | Configures routing | Manages room flow | Scores in room | - | Presents | - |
| 6. Judging Rubric and Scoring | Views aggregates | - | Scores on rubric | - | - | - |
| 7. Finalist Selection | Confirms finalists | - | Selects finalists | - | Notified if selected | - |
| 8. Grand Finals Flow | Records winners | Announces results | Scores finalists | - | Presents if finalist | - |
| 9. Mentor Coordination | Views overview | - | - | Picks up requests | Flags for help | - |
| 10. Social Media Prize Tracking | Reviews submissions | - | - | - | Submits posts | - |
| 11. Partner Prize Integration | Adds categories | - | Partner judges score | - | Opts in | Receives report |
| 12. Live Event Dashboard | Full visibility | Full visibility | - | - | - | - |
| 13. Post-Event | Generates reports | - | - | - | Receives badges | Receives report |

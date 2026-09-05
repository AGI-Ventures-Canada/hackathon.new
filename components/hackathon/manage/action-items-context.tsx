"use client";

import type { HackathonSponsor } from "@/lib/db/hackathon-types";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  useReducer,
  startTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getOrganizerActionItems,
  isCompleted,
  type ActionItem,
  type ActionItemsInput,
  type ActionSeverity,
} from "@/lib/utils/organizer-actions";
import type {
  HackathonStatus,
  HackathonPhase,
  Prize,
} from "@/lib/db/hackathon-types";
import { useOrganizerPoll } from "@/hooks/use-organizer-poll";
import { getEffectiveStatus } from "@/lib/utils/timeline";
import {
  applyOptimisticStage,
  buildHackathonFingerprint,
  shouldClearOptimisticStage,
  type StageKey,
} from "@/lib/utils/lifecycle-stages";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  TransitionConfirmDialog,
  type TransitionConfirmDialogHandle,
} from "./transition-confirm-dialog";
import {
  SubmissionDeadlineDialog,
  type SubmissionDeadlineDialogHandle,
} from "./submission-deadline-dialog";
import { ScheduleEditor } from "@/components/hackathon/schedule-editor";
import type { ScheduleItem } from "@/lib/services/schedule-items";
import { LocationEditDialog } from "./location-edit-dialog";
import { TeamSettingsDialog } from "./team-settings-dialog";
import { CommunityEditForm } from "@/components/hackathon/edit-drawer/community-edit-form";
import { TimelineEditForm } from "@/components/hackathon/edit-drawer/timeline-edit-form";
import { AboutEditForm } from "@/components/hackathon/edit-drawer/about-edit-form";
import { BannerUpload } from "@/components/hackathon/banner-upload";
import { ChallengeEditorDialog } from "./challenge-editor-dialog";
import { ShowcaseDialog } from "./showcase-dialog";
import { PerkEditorDialog, type SponsorOption } from "./perk-editor-dialog";
import { AddJudgeDialog } from "@/components/hackathon/judging/add-judge-dialog";
import { AddPrizeDialog } from "@/components/hackathon/judging/add-prize-dialog";
import type { RoundData } from "@/components/hackathon/judging/rounds-types";
import type { Challenge } from "@/lib/services/challenges";
import type { Announcement } from "@/lib/services/announcements";
import type { Perk } from "@/lib/services/perks";
import { assertOk, assertOkJson, FetchResponseError } from "@/lib/utils/fetch";
import type {
  OrganizerActionStateSnapshot,
  CustomOrganizerActionItemRow,
} from "@/lib/services/organizer-action-items";
import type {
  OrganizerTask,
  OrganizerTaskPage,
} from "@/lib/utils/organizer-action-board";
import { MAX_CUSTOM_ORGANIZER_ACTION_ITEMS } from "@/lib/utils/organizer-action-board";
import {
  createManageWebMcpState,
  manageWebMcpStateReducer,
  selectManageWebMcpVisibleState,
  type ManageWebMcpCommittedChange,
  type ManageWebMcpOptimisticChange,
  type ManageWebMcpVisibleState,
} from "@/lib/webmcp/manage-optimistic-state";

const SEVERITY_ORDER: ActionSeverity[] = ["urgent", "warning", "scheduled", "info"];

interface ActionItemsContextValue {
  actionItems: ActionItem[];
  completedIds: Set<string>;
  dismissedIds: Set<string>;
  activeItems: ActionItem[];
  completedItems: ActionItem[];
  remainingCount: number;
  totalCount: number;
  toggleComplete: (id: string) => void;
  dismissItem: (id: string) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  handleActionClick: (item: ActionItem) => void;
  triggerTransition: (targetStatus: string) => void;
  addCustomItem: (label: string, severity?: ActionSeverity) => void;
  removeCustomItem: (id: string) => void;
  customItems: ActionItem[];
  registerTabAction: (actionItemId: string, callback: () => void) => void;
  unregisterTabAction: (actionItemId: string) => void;
  openRegisteredAction: (actionItemId: string) => boolean;
  openShowcaseDialog: () => void;
  isStale: boolean;
  hackathonStatus: HackathonStatus;
  hackathonPhase: HackathonPhase | null;
  challengeExists: boolean;
  slug: string;
  setOptimisticStage: (stage: StageKey | null) => void;
  manageWebMcpView: ManageWebMcpVisibleState;
  beginManageWebMcpChange: (change: ManageWebMcpOptimisticChange) => void;
  commitManageWebMcpChange: (change: ManageWebMcpCommittedChange) => void;
  rollbackManageWebMcpChange: (mutationId: string) => void;
  replaceManageSchedule: (items: ScheduleItem[]) => void;
  replaceManageChallenges: (items: Challenge[]) => void;
  replaceManagePrizes: (items: Prize[]) => void;
  replaceManageAnnouncements: (items: Announcement[]) => void;
  actionItemsError: string | null;
}

const ActionItemsContext = createContext<ActionItemsContextValue | null>(null);
const CROSS_TAB_DIALOG_ACTIONS = new Set([
  "activate-first-round",
  "finish-scoring-setup",
  "judging-incomplete",
  "ready-to-complete",
  "results-not-published",
  "unassigned-submissions",
]);

export function useActionItems() {
  const ctx = useContext(ActionItemsContext);
  if (!ctx)
    throw new Error("useActionItems must be used within ActionItemsProvider");
  return ctx;
}

export function useActionItemsOptional() {
  return useContext(ActionItemsContext);
}

export function buildActionTargetHref(slug: string, item: ActionItem): string | null {
  if (!item.tab) return null;
  const params = new URLSearchParams({ tab: item.tab });
  if (item.subtab && item.subtabKey) params.set(item.subtabKey, item.subtab);
  return `/e/${slug}/manage?${params.toString()}`;
}

export function buildActionHref(slug: string, item: ActionItem): string | null {
  if (item.action) return null;
  return buildActionTargetHref(slug, item);
}

export function isActionTargetHrefActive(
  href: string,
  searchParams: { get: (name: string) => string | null },
): boolean {
  const query = href.split("?")[1] ?? "";
  const targetParams = new URLSearchParams(query);
  for (const [key, value] of targetParams) {
    if (searchParams.get(key) !== value) return false;
  }
  return true;
}

type TeamSettingsInitialData = {
  minTeamSize: number;
  maxTeamSize: number;
  allowSolo: boolean;
  requireTeamApproval: boolean;
};

type LocationInitialData = {
  locationType: "in_person" | "virtual" | "hybrid" | null;
  locationName: string | null;
  locationUrl: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  requireLocationVerification: boolean;
};

type ProviderProps = {
  actionItems: ActionItem[];
  persistedActionState: OrganizerActionStateSnapshot;
  hackathonId: string;
  slug: string;
  name: string;
  status: HackathonStatus;
  storedStatus: HackathonStatus;
  phase: HackathonPhase | null;
  challengeExists: boolean;
  challengeReleasedAt: string | null;
  challenges: Challenge[];
  prizes: Prize[];
  announcements: Announcement[];
  challengeReleaseItem: ScheduleItem | null;
  scheduleItems: ScheduleItem[];
  startsAt: string | null;
  endsAt: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  allowLateRegistration: boolean;
  description: string | null;
  descriptionLocale: string | null;
  bannerUrl: string | null;
  locationInitialData: LocationInitialData;
  teamSettingsInitialData: TeamSettingsInitialData;
  communityInitialData: { url: string | null; label: string | null };
  sponsors: SponsorOption[];
  webMcpSponsors?: HackathonSponsor[];
  rounds: RoundData[];
  judgingSetupIssues: string[];
  requiresJudgeScoring: boolean;
  judgingCompletionReadiness?: ActionItemsInput["judgingCompletionReadiness"];
  children: React.ReactNode;
};

function isStoredActionItem(value: unknown): value is ActionItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ActionItem>;
  return (
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    ["urgent", "warning", "scheduled", "info"].includes(item.severity ?? "") &&
    !!item.close &&
    ["auto", "manual", "dismiss", "transition"].includes(item.close.kind)
  );
}

function customRowToActionItem(row: CustomOrganizerActionItemRow): ActionItem {
  return {
    id: row.id,
    label: row.label,
    severity: row.severity,
    close: { kind: "manual" },
  };
}

function stateFromSnapshot(
  snapshot: OrganizerActionStateSnapshot,
  currentItems: ActionItem[] = [],
) {
  const completedIds = new Set<string>();
  const dismissedIds = new Set<string>();
  const completedSnapshots: Record<string, ActionItem> = {};
  const currentById = new Map(currentItems.map((item) => [item.id, item]));

  for (const row of snapshot.generated) {
    const current = currentById.get(row.action_id);
    if (row.state === "completed") {
      if (current) {
        if (current.close.kind !== "manual" && !isCompleted(current)) continue;
        completedIds.add(row.action_id);
        completedSnapshots[row.action_id] = current;
      } else if (isStoredActionItem(row.item)) {
        completedIds.add(row.action_id);
        completedSnapshots[row.action_id] = row.item;
      }
    } else if (current?.close.kind === "dismiss") {
      dismissedIds.add(row.action_id);
    }
  }
  for (const row of snapshot.custom) {
    if (row.completed_at) {
      completedIds.add(row.id);
      completedSnapshots[row.id] = customRowToActionItem(row);
    }
  }
  for (const item of currentItems) {
    if (isCompleted(item)) {
      completedIds.add(item.id);
      completedSnapshots[item.id] = item;
    }
  }

  return {
    completedIds,
    dismissedIds,
    completedSnapshots,
    customItems: snapshot.custom.map(customRowToActionItem),
  };
}

function taskToActionItem(task: OrganizerTask): ActionItem {
  return {
    id: task.taskRef,
    label: task.label,
    hint: task.hint ?? undefined,
    tooltip: task.tooltip ?? undefined,
    severity: task.severity,
    ctaLabel: task.ctaLabel ?? undefined,
    close: task.custom
      ? { kind: "manual" }
      : task.completionPolicy === "auto"
        ? { kind: "auto", isComplete: task.state === "completed" }
        : { kind: task.completionPolicy },
  };
}

function taskVersionsFromSnapshot(snapshot: OrganizerActionStateSnapshot) {
  return new Map<string, string>([
    ...snapshot.generated.map((row) => [row.action_id, row.updated_at] as const),
    ...snapshot.custom.map((row) => [row.id, row.updated_at] as const),
  ]);
}

export function ActionItemsProvider({
  actionItems: serverActionItems,
  persistedActionState,
  hackathonId,
  slug,
  name: serverName,
  status: serverStatus,
  storedStatus: serverStoredStatus,
  phase: serverPhase,
  challengeExists,
  challengeReleasedAt,
  challenges: serverChallenges,
  prizes: serverPrizes,
  announcements: serverAnnouncements,
  challengeReleaseItem,
  scheduleItems: serverScheduleItems,
  startsAt: serverStartsAt,
  endsAt: serverEndsAt,
  registrationOpensAt: serverRegistrationOpensAt,
  registrationClosesAt: serverRegistrationClosesAt,
  allowLateRegistration: serverAllowLateRegistration,
  description,
  descriptionLocale,
  bannerUrl: serverBannerUrl,
  locationInitialData,
  teamSettingsInitialData,
  communityInitialData,
  sponsors,
  webMcpSponsors,
  rounds,
  judgingSetupIssues,
  requiresJudgeScoring: serverRequiresJudgeScoring,
  judgingCompletionReadiness: serverJudgingCompletionReadiness,
  children,
}: ProviderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transitionRef = useRef<TransitionConfirmDialogHandle>(null);
  const submissionDeadlineRef = useRef<SubmissionDeadlineDialogHandle>(null);
  const tabActionsRef = useRef(new Map<string, () => void>());
  const [datesDialogItem, setDatesDialogItem] = useState<ActionItem | null>(null);
  const [descriptionDialogItem, setDescriptionDialogItem] = useState<ActionItem | null>(null);
  const [bannerDialogItem, setBannerDialogItem] = useState<ActionItem | null>(null);
  const [challengeDialogItem, setChallengeDialogItem] = useState<ActionItem | null>(null);
  const [releaseChallengeDialogItem, setReleaseChallengeDialogItem] = useState<ActionItem | null>(null);
  const [perkDialogItem, setPerkDialogItem] = useState<ActionItem | null>(null);
  const [prizeDialogItem, setPrizeDialogItem] = useState<ActionItem | null>(null);
  const [judgeDialogItem, setJudgeDialogItem] = useState<ActionItem | null>(null);
  const [locationDialogItem, setLocationDialogItem] = useState<ActionItem | null>(null);
  const [teamSettingsDialogItem, setTeamSettingsDialogItem] = useState<ActionItem | null>(null);
  const [communityDialogItem, setCommunityDialogItem] = useState<ActionItem | null>(null);
  const [submissionDeadlineDialogItem, setSubmissionDeadlineDialogItem] = useState<ActionItem | null>(null);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [showcaseDialogOpen, setShowcaseDialogOpen] = useState(false);
  const [agendaDialogOpen, setAgendaDialogOpen] = useState(false);
  const [reviewDialogItem, setReviewDialogItem] = useState<ActionItem | null>(null);
  const [releasingChallenge, setReleasingChallenge] = useState(false);
  const [releaseChallengeError, setReleaseChallengeError] = useState<string | null>(null);
  const [settingsDialogError, setSettingsDialogError] = useState<string | null>(null);
  const [pendingTargetRefreshHref, setPendingTargetRefreshHref] = useState<string | null>(null);
  const [manageWebMcpState, dispatchManageWebMcpState] = useReducer(
    manageWebMcpStateReducer,
    {
      details: { name: serverName, description },
      timeline: { startsAt: serverStartsAt, endsAt: serverEndsAt },
      scheduleItems: serverScheduleItems,
      challenges: serverChallenges,
      prizes: serverPrizes,
      announcements: serverAnnouncements,
      sponsors: webMcpSponsors,
    },
    createManageWebMcpState,
  );
  const manageWebMcpView = useMemo(
    () => selectManageWebMcpVisibleState(manageWebMcpState),
    [manageWebMcpState],
  );
  useEffect(() => {
    if (webMcpSponsors) dispatchManageWebMcpState({ type: "sync_sponsors", sponsors: webMcpSponsors });
  }, [webMcpSponsors]);
  const scheduleItems = manageWebMcpView.scheduleItems;
  const challenges = manageWebMcpView.challenges;

  useEffect(() => {
    dispatchManageWebMcpState({
      type: "sync_details",
      details: { name: serverName, description },
    });
  }, [serverName, description]);
  useEffect(() => {
    dispatchManageWebMcpState({
      type: "sync_timeline",
      timeline: { startsAt: serverStartsAt, endsAt: serverEndsAt },
    });
  }, [serverStartsAt, serverEndsAt]);
  useEffect(() => {
    dispatchManageWebMcpState({
      type: "sync_schedule",
      scheduleItems: serverScheduleItems,
    });
  }, [serverScheduleItems]);
  useEffect(() => {
    dispatchManageWebMcpState({
      type: "sync_challenges",
      challenges: serverChallenges,
    });
  }, [serverChallenges]);
  useEffect(() => {
    dispatchManageWebMcpState({ type: "sync_prizes", prizes: serverPrizes });
  }, [serverPrizes]);
  useEffect(() => {
    dispatchManageWebMcpState({
      type: "sync_announcements",
      announcements: serverAnnouncements,
    });
  }, [serverAnnouncements]);
  const beginManageWebMcpChange = useCallback(
    (change: ManageWebMcpOptimisticChange) => {
      dispatchManageWebMcpState({ type: "begin", change });
    },
    [],
  );
  const commitManageWebMcpChange = useCallback(
    (change: ManageWebMcpCommittedChange) => {
      dispatchManageWebMcpState({ type: "commit", change });
    },
    [],
  );
  const rollbackManageWebMcpChange = useCallback((mutationId: string) => {
    dispatchManageWebMcpState({ type: "rollback", mutationId });
  }, []);
  const replaceManageSchedule = useCallback((items: ScheduleItem[]) => {
    dispatchManageWebMcpState({ type: "sync_schedule", scheduleItems: items });
  }, []);
  const replaceManageChallenges = useCallback((items: Challenge[]) => {
    dispatchManageWebMcpState({ type: "sync_challenges", challenges: items });
  }, []);
  const replaceManagePrizes = useCallback((items: Prize[]) => {
    dispatchManageWebMcpState({ type: "sync_prizes", prizes: items });
  }, []);
  const replaceManageAnnouncements = useCallback((items: Announcement[]) => {
    dispatchManageWebMcpState({
      type: "sync_announcements",
      announcements: items,
    });
  }, []);
  const [bannerUrl, setBannerUrl] = useState(serverBannerUrl);
  useEffect(() => {
    setBannerUrl(serverBannerUrl);
  }, [serverBannerUrl]);

  const { data: pollData, isStale, refresh: refreshPoll } =
    useOrganizerPoll(hackathonId);

  const serverFingerprint = useMemo(
    () =>
      buildHackathonFingerprint({
        status: serverStatus,
        phase: serverPhase,
        startsAt: serverStartsAt,
        endsAt: serverEndsAt,
        actionItems: serverActionItems,
      }),
    [serverStatus, serverPhase, serverStartsAt, serverEndsAt, serverActionItems],
  );
  const prevFingerprintRef = useRef(serverFingerprint);
  useEffect(() => {
    if (prevFingerprintRef.current !== serverFingerprint) {
      prevFingerprintRef.current = serverFingerprint;
      refreshPoll();
    }
  }, [serverFingerprint, refreshPoll]);

  const serverFingerprintRef = useRef(serverFingerprint);
  useEffect(() => {
    serverFingerprintRef.current = serverFingerprint;
  }, [serverFingerprint]);
  const [pollFingerprint, setPollFingerprint] = useState<string | null>(null);
  useEffect(() => {
    if (pollData) setPollFingerprint(serverFingerprintRef.current);
  }, [pollData]);
  // Pin poll data to the server fingerprint at arrival time so a router.refresh() that lands mid-poll invalidates the snapshot on the next render.
  const isPollFresh = !!pollData && pollFingerprint === serverFingerprint;

  const liveChallengeExists = isPollFresh && pollData
    ? pollData.challengeExists
    : challengeExists;
  const liveEndsAt = isPollFresh && pollData ? pollData.endsAt : serverEndsAt;
  const liveStartsAt = isPollFresh && pollData ? pollData.startsAt : serverStartsAt;
  const liveRegistrationClosesAt = isPollFresh && pollData
    ? pollData.registrationClosesAt ?? null
    : serverRegistrationClosesAt;
  const liveAllowLateRegistration = isPollFresh && pollData
    ? pollData.allowLateRegistration ?? true
    : serverAllowLateRegistration;
  const liveStatus = (
    isPollFresh && pollData ? pollData.status : serverStatus
  ) as HackathonStatus;
  const livePhase = (
    isPollFresh && pollData ? pollData.phase : serverPhase
  ) as HackathonPhase | null;
  const baseEffectiveStatus = getEffectiveStatus({
    status: liveStatus,
    starts_at: liveStartsAt,
    ends_at: liveEndsAt,
  });
  const [optimisticStage, setOptimisticStage] = useState<StageKey | null>(null);
  useEffect(() => {
    if (shouldClearOptimisticStage(baseEffectiveStatus, optimisticStage)) {
      setOptimisticStage(null);
    }
  }, [baseEffectiveStatus, optimisticStage]);
  const effectiveStatus = applyOptimisticStage(baseEffectiveStatus, optimisticStage);
  const actionItems = isPollFresh && pollData
    ? getOrganizerActionItems({
        ...pollData,
        status: effectiveStatus,
        storedStatus: pollData.storedStatus ?? serverStoredStatus,
        registrationOpensAt:
          pollData.registrationOpensAt ?? serverRegistrationOpensAt,
        registrationClosesAt: liveRegistrationClosesAt,
        allowLateRegistration: liveAllowLateRegistration,
        judgingSetupReady: !serverActionItems.some((item) => item.id === "finish-scoring-setup"),
        requiresJudgeScoring: serverRequiresJudgeScoring,
        judgingCompletionReadiness:
          pollData.judgingCompletionReadiness ?? serverJudgingCompletionReadiness,
      })
    : serverActionItems;

  const initialActionState = useMemo(
    () => stateFromSnapshot(persistedActionState, serverActionItems),
    [persistedActionState, serverActionItems],
  );
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => initialActionState.completedIds,
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => initialActionState.dismissedIds,
  );
  const [customItems, setCustomItems] = useState<ActionItem[]>(
    () => initialActionState.customItems,
  );
  const [completedSnapshots, setCompletedSnapshots] = useState<
    Record<string, ActionItem>
  >(() => initialActionState.completedSnapshots);
  const [actionItemsError, setActionItemsError] = useState<string | null>(null);
  const taskVersionsRef = useRef(taskVersionsFromSnapshot(persistedActionState));
  const snapshotsRef = useRef(completedSnapshots);
  useEffect(() => {
    snapshotsRef.current = completedSnapshots;
  }, [completedSnapshots]);

  useEffect(() => {
    const next = stateFromSnapshot(persistedActionState, serverActionItems);
    taskVersionsRef.current = taskVersionsFromSnapshot(persistedActionState);
    setCompletedIds(next.completedIds);
    setDismissedIds(next.dismissedIds);
    setCustomItems(next.customItems);
    setCompletedSnapshots(next.completedSnapshots);
  }, [persistedActionState, serverActionItems]);

  const [panelOpen, setPanelOpenState] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(`action-panel-open-${hackathonId}`);
    if (stored !== null)
      startTransition(() => setPanelOpenState(stored === "true"));
  }, [hackathonId]);

  const allItems = useMemo(
    () => [...actionItems, ...customItems],
    [actionItems, customItems],
  );
  const actionItemIds = useMemo(
    () => new Set(allItems.map((i) => i.id)),
    [allItems],
  );
  const manualItemIds = useMemo(
    () => new Set(allItems.filter((i) => i.close.kind === "manual").map((i) => i.id)),
    [allItems],
  );

  const effectiveCompletedIds = useMemo(() => {
    const filtered = new Set<string>();
    for (const id of completedIds) {
      if (manualItemIds.has(id) || completedSnapshots[id]) filtered.add(id);
    }
    return filtered.size !== completedIds.size ? filtered : completedIds;
  }, [completedIds, manualItemIds, completedSnapshots]);

  const effectiveDismissedIds = useMemo(() => {
    const filtered = new Set<string>();
    const dismissibleIds = new Set(
      allItems.filter((i) => i.close.kind === "dismiss").map((i) => i.id),
    );
    for (const id of dismissedIds) {
      if (dismissibleIds.has(id)) filtered.add(id);
    }
    return filtered.size !== dismissedIds.size ? filtered : dismissedIds;
  }, [dismissedIds, allItems]);

  const pendingTaskMutationsRef = useRef(new Set<string>());
  const legacyImportRef = useRef<string | null>(null);

  const refreshSharedActionState = useCallback(async (showError = false) => {
    if (pendingTaskMutationsRef.current.size > 0) return;
    try {
      const tasks: OrganizerTask[] = [];
      let customTaskCount = 0;
      let offset = 0;
      while (true) {
        const page = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/action-items?state=all&offset=${offset}&limit=50`,
          { cache: "no-store" },
        ).then(assertOkJson<OrganizerTaskPage>);
        tasks.push(...page.items);
        customTaskCount += page.items.filter((task) => task.custom).length;
        if (customTaskCount > MAX_CUSTOM_ORGANIZER_ACTION_ITEMS) {
          throw new Error(
            `This event has more than ${MAX_CUSTOM_ORGANIZER_ACTION_ITEMS} custom tasks. Remove older tasks and try again.`,
          );
        }
        if (!page.hasMore || page.nextOffset === null) break;
        if (
          page.nextOffset <= offset ||
          page.nextOffset !== offset + page.items.length
        ) {
          throw new Error(
            "The shared task list changed while it was loading. Try again.",
          );
        }
        offset = page.nextOffset;
      }

      const nextCompleted = new Set(
        tasks.filter((task) => task.state === "completed").map((task) => task.taskRef),
      );
      const nextDismissed = new Set(
        tasks.filter((task) => task.state === "dismissed").map((task) => task.taskRef),
      );
      const nextCustom = tasks.filter((task) => task.custom).map(taskToActionItem);
      const nextSnapshots: Record<string, ActionItem> = {};
      for (const task of tasks) {
        if (task.state === "completed") nextSnapshots[task.taskRef] = taskToActionItem(task);
      }
      for (const item of serverActionItems) {
        if (isCompleted(item)) nextSnapshots[item.id] = item;
      }

      taskVersionsRef.current = new Map(
        tasks.flatMap((task) => task.updatedAt ? [[task.taskRef, task.updatedAt]] : []),
      );
      setCompletedIds(nextCompleted);
      setDismissedIds(nextDismissed);
      setCustomItems(nextCustom);
      setCompletedSnapshots(nextSnapshots);
      setActionItemsError(null);
    } catch (error) {
      if (showError || error instanceof Error) {
        setActionItemsError(
          error instanceof Error ? error.message : "We couldn't refresh the task list.",
        );
      }
    }
  }, [hackathonId, serverActionItems]);

  useEffect(() => {
    if (!pollData) return;
    void refreshSharedActionState(false);
  }, [pollData, refreshSharedActionState]);

  useEffect(() => {
    if (legacyImportRef.current === hackathonId) return;
    legacyImportRef.current = hackathonId;
    try {
      const completedIds = JSON.parse(
        localStorage.getItem(`completed-actions-${hackathonId}`) ?? "[]",
      ) as unknown;
      const dismissedIds = JSON.parse(
        localStorage.getItem(`dismissed-actions-${hackathonId}`) ?? "[]",
      ) as unknown;
      const rawCustom = JSON.parse(
        localStorage.getItem(`custom-actions-${hackathonId}`) ?? "[]",
      ) as unknown;
      const rawSnapshots = JSON.parse(
        localStorage.getItem(`completed-snapshots-${hackathonId}`) ?? "{}",
      ) as unknown;
      const cleanCompleted = Array.isArray(completedIds)
        ? completedIds.filter((id): id is string => typeof id === "string").slice(0, 200)
        : [];
      const cleanDismissed = Array.isArray(dismissedIds)
        ? dismissedIds.filter((id): id is string => typeof id === "string").slice(0, 200)
        : [];
      const cleanCustom = Array.isArray(rawCustom)
        ? rawCustom.flatMap((value) => {
            if (!value || typeof value !== "object") return [];
            const item = value as Partial<ActionItem>;
            if (
              typeof item.id !== "string" ||
              typeof item.label !== "string" ||
              !["urgent", "warning", "scheduled", "info"].includes(item.severity ?? "")
            ) return [];
            return [{ id: item.id, label: item.label, severity: item.severity as ActionSeverity }];
          }).slice(0, 100)
        : [];
      const cleanSnapshots: Record<string, ActionItem> = {};
      if (rawSnapshots && typeof rawSnapshots === "object") {
        for (const [id, value] of Object.entries(rawSnapshots)) {
          if (isStoredActionItem(value)) cleanSnapshots[id] = value;
        }
      }
      if (
        cleanCompleted.length === 0 &&
        cleanDismissed.length === 0 &&
        cleanCustom.length === 0 &&
        Object.keys(cleanSnapshots).length === 0
      ) return;

      setCompletedIds((previous) => new Set([...previous, ...cleanCompleted]));
      setDismissedIds((previous) => new Set([...previous, ...cleanDismissed]));
      setCustomItems((previous) => {
        const byId = new Map(previous.map((item) => [item.id, item]));
        for (const item of cleanCustom) {
          if (!byId.has(item.id)) byId.set(item.id, { ...item, close: { kind: "manual" } });
        }
        return [...byId.values()];
      });
      setCompletedSnapshots((previous) => ({ ...cleanSnapshots, ...previous }));

      void fetch(`/api/dashboard/hackathons/${hackathonId}/action-items/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedIds: cleanCompleted,
          dismissedIds: cleanDismissed,
          customItems: cleanCustom,
          completedSnapshots: cleanSnapshots,
        }),
      })
        .then(assertOk)
        .then(() => {
          for (const key of [
            "completed-actions",
            "dismissed-actions",
            "custom-actions",
            "completed-snapshots",
          ]) {
            localStorage.removeItem(`${key}-${hackathonId}`);
          }
          router.refresh();
          return refreshSharedActionState(false);
        })
        .catch((error) => {
          setActionItemsError(
            error instanceof Error
              ? error.message
              : "We couldn't move your saved tasks to the shared list.",
          );
        });
    } catch {
      setActionItemsError("We couldn't read your older saved tasks.");
    }
  }, [hackathonId, refreshSharedActionState, router]);

  const saveTaskState = useCallback(
    async (id: string, state: "pending" | "completed" | "dismissed") => {
      pendingTaskMutationsRef.current.add(id);
      let caught: unknown = null;
      try {
        const expectedUpdatedAt = taskVersionsRef.current.get(id);
        const { task } = await fetch(`/api/dashboard/hackathons/${hackathonId}/action-items/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, expectedUpdatedAt }),
        }).then(assertOkJson<{ task: OrganizerTask }>);
        if (task.updatedAt) taskVersionsRef.current.set(id, task.updatedAt);
        else taskVersionsRef.current.delete(id);
        setActionItemsError(null);
      } catch (error) {
        caught = error;
      } finally {
        pendingTaskMutationsRef.current.delete(id);
      }
      if (caught) throw caught;
    },
    [hackathonId],
  );

  const toggleComplete = useCallback(
    (id: string) => {
      if (pendingTaskMutationsRef.current.has(id)) return;
      const item = allItems.find((i) => i.id === id);
      if (!item || item.close.kind !== "manual") return;
      const wasCompleted = completedIds.has(id);
      setActionItemsError(null);
      setCompletedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setCompletedSnapshots((prev) => {
        const next = { ...prev };
        if (wasCompleted) {
          delete next[id];
        } else {
          next[id] = item;
        }
        return next;
      });
      void saveTaskState(id, wasCompleted ? "pending" : "completed")
        .then(() => {
          refreshPoll();
          router.refresh();
          return refreshSharedActionState(false);
        })
        .catch(async (error) => {
          setCompletedIds((prev) => {
            const next = new Set(prev);
            if (wasCompleted) next.add(id);
            else next.delete(id);
            return next;
          });
          setCompletedSnapshots((prev) => {
            const next = { ...prev };
            if (wasCompleted) next[id] = item;
            else delete next[id];
            return next;
          });
          setActionItemsError(error instanceof Error ? error.message : "We couldn't update the task.");
          if (error instanceof FetchResponseError && error.status === 409) {
            await refreshSharedActionState(true);
          }
        });
    },
    [allItems, completedIds, refreshPoll, refreshSharedActionState, router, saveTaskState],
  );

  const markComplete = useCallback(
    (id: string) => {
      if (pendingTaskMutationsRef.current.has(id)) return;
      const item = allItems.find((i) => i.id === id);
      if (!item || item.close.kind !== "manual") return;
      if (completedIds.has(id)) return;
      setActionItemsError(null);
      setCompletedIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setCompletedSnapshots((prev) => {
        if (prev[id]) return prev;
        const next = { ...prev, [id]: item };
        return next;
      });
      void saveTaskState(id, "completed")
        .then(() => {
          refreshPoll();
          router.refresh();
          return refreshSharedActionState(false);
        })
        .catch(async (error) => {
          setCompletedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setCompletedSnapshots((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setActionItemsError(error instanceof Error ? error.message : "We couldn't update the task.");
          if (error instanceof FetchResponseError && error.status === 409) {
            await refreshSharedActionState(true);
          }
        });
    },
    [allItems, completedIds, refreshPoll, refreshSharedActionState, router, saveTaskState],
  );

  const dismissItem = useCallback(
    (id: string) => {
      if (pendingTaskMutationsRef.current.has(id)) return;
      const item = allItems.find((i) => i.id === id);
      if (!item || item.close.kind !== "dismiss") return;
      if (dismissedIds.has(id)) return;
      setActionItemsError(null);
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      void saveTaskState(id, "dismissed")
        .then(() => {
          refreshPoll();
          router.refresh();
          return refreshSharedActionState(false);
        })
        .catch(async (error) => {
          setDismissedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setActionItemsError(error instanceof Error ? error.message : "We couldn't dismiss the task.");
          if (error instanceof FetchResponseError && error.status === 409) {
            await refreshSharedActionState(true);
          }
        });
    },
    [allItems, dismissedIds, refreshPoll, refreshSharedActionState, router, saveTaskState],
  );

  const addCustomItem = useCallback(
    (label: string, severity: ActionSeverity = "info") => {
      const cleanLabel = label.trim();
      if (!cleanLabel) return;
      const item: ActionItem = {
        id: `custom-${crypto.randomUUID()}`,
        label: cleanLabel,
        severity,
        close: { kind: "manual" },
      };
      setActionItemsError(null);
      setCustomItems((prev) => [...prev, item]);
      pendingTaskMutationsRef.current.add(item.id);
      void fetch(`/api/dashboard/hackathons/${hackathonId}/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: cleanLabel, severity, taskRef: item.id }),
      })
        .then(assertOkJson<{ task: OrganizerTask }>)
        .then(({ task }) => {
          if (task.updatedAt) taskVersionsRef.current.set(task.taskRef, task.updatedAt);
          setActionItemsError(null);
          refreshPoll();
          router.refresh();
        })
        .catch((error) => {
          setCustomItems((prev) => prev.filter((candidate) => candidate.id !== item.id));
          setActionItemsError(error instanceof Error ? error.message : "We couldn't add the task.");
        })
        .finally(() => {
          pendingTaskMutationsRef.current.delete(item.id);
          void refreshSharedActionState(false);
        });
    },
    [hackathonId, refreshPoll, refreshSharedActionState, router],
  );

  const removeCustomItem = useCallback(
    (id: string) => {
      if (pendingTaskMutationsRef.current.has(id)) return;
      const removedItem = customItems.find((item) => item.id === id);
      if (!removedItem) return;
      const wasCompleted = completedIds.has(id);
      const removedSnapshot = completedSnapshots[id];
      setActionItemsError(null);
      setCustomItems((prev) => prev.filter((i) => i.id !== id));
      setCompletedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setCompletedSnapshots((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      pendingTaskMutationsRef.current.add(id);
      const expectedUpdatedAt = taskVersionsRef.current.get(id);
      const versionQuery = expectedUpdatedAt
        ? `?${new URLSearchParams({ expectedUpdatedAt }).toString()}`
        : "";
      void fetch(`/api/dashboard/hackathons/${hackathonId}/action-items/${encodeURIComponent(id)}${versionQuery}`, {
        method: "DELETE",
      })
        .then(assertOk)
        .then(() => {
          taskVersionsRef.current.delete(id);
          setActionItemsError(null);
          refreshPoll();
          router.refresh();
        })
        .catch((error) => {
          setCustomItems((prev) => [...prev, removedItem]);
          if (wasCompleted) {
            setCompletedIds((prev) => new Set(prev).add(id));
          }
          if (removedSnapshot) {
            setCompletedSnapshots((prev) => ({ ...prev, [id]: removedSnapshot }));
          }
          setActionItemsError(error instanceof Error ? error.message : "We couldn't remove the task.");
        })
        .finally(() => {
          pendingTaskMutationsRef.current.delete(id);
          void refreshSharedActionState(false);
        });
    },
    [completedIds, completedSnapshots, customItems, hackathonId, refreshPoll, refreshSharedActionState, router],
  );

  const setPanelOpen = useCallback(
    (open: boolean) => {
      setPanelOpenState(open);
      localStorage.setItem(`action-panel-open-${hackathonId}`, String(open));
    },
    [hackathonId],
  );

  const registerTabAction = useCallback(
    (actionItemId: string, callback: () => void) => {
      tabActionsRef.current.set(actionItemId, callback);
    },
    [],
  );

  const unregisterTabAction = useCallback((actionItemId: string) => {
    tabActionsRef.current.delete(actionItemId);
  }, []);
  const openRegisteredAction = useCallback((actionItemId: string) => {
    const action = tabActionsRef.current.get(actionItemId);
    if (!action) return false;
    action();
    return true;
  }, []);

  useEffect(() => {
    if (!pendingTargetRefreshHref) return;
    if (!isActionTargetHrefActive(pendingTargetRefreshHref, searchParams)) return;
    router.refresh();
    refreshPoll();
    setPendingTargetRefreshHref(null);
  }, [pendingTargetRefreshHref, router, searchParams, refreshPoll]);

  const routeToActionTarget = useCallback(
    (item: ActionItem | null) => {
      const href = item ? buildActionTargetHref(slug, item) : null;
      if (!href) {
        router.refresh();
        refreshPoll();
        return;
      }
      setPendingTargetRefreshHref(href);
      if (!isActionTargetHrefActive(href, searchParams)) {
        router.push(href);
      }
    },
    [router, slug, searchParams, refreshPoll],
  );

  const saveSettingsForAction = useCallback(
    async (item: ActionItem | null, data: Record<string, unknown>) => {
      setSettingsDialogError(null);
      try {
        await fetch(`/api/dashboard/hackathons/${hackathonId}/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).then(assertOk);
        routeToActionTarget(item);
        return true;
      } catch (err) {
        setSettingsDialogError(err instanceof Error ? err.message : "Failed to save");
        return false;
      }
    },
    [hackathonId, routeToActionTarget],
  );

  const handleChallengeSaved = useCallback(
    (saved: Challenge) => {
      const existing = challenges.findIndex((challenge) => challenge.id === saved.id);
      if (existing >= 0) {
        const next = [...challenges];
        next[existing] = saved;
        replaceManageChallenges(next);
      } else {
        replaceManageChallenges([...challenges, saved]);
      }
      const item = challengeDialogItem;
      setChallengeDialogItem(null);
      routeToActionTarget(item);
    },
    [
      challengeDialogItem,
      challenges,
      replaceManageChallenges,
      routeToActionTarget,
    ],
  );

  const handlePerkSaved = useCallback(
    (_saved: Perk) => {
      const item = perkDialogItem;
      setPerkDialogItem(null);
      routeToActionTarget(item);
    },
    [perkDialogItem, routeToActionTarget],
  );

  const handleReleaseChallenge = useCallback(async () => {
    const item = releaseChallengeDialogItem;
    if (!item) return;
    setReleasingChallenge(true);
    setReleaseChallengeError(null);
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/challenge/release`, {
        method: "POST",
      }).then(assertOk);
      setReleaseChallengeDialogItem(null);
      routeToActionTarget(item);
    } catch (err) {
      setReleaseChallengeError(
        err instanceof Error ? err.message : "Failed to release challenge",
      );
    } finally {
      setReleasingChallenge(false);
    }
  }, [hackathonId, releaseChallengeDialogItem, routeToActionTarget]);

  const handlePrizeActionDone = useCallback(() => {
    const item = prizeDialogItem;
    setPrizeDialogItem(null);
    routeToActionTarget(item);
  }, [prizeDialogItem, routeToActionTarget]);

  const handleJudgeActionDone = useCallback(() => {
    const item = judgeDialogItem;
    setJudgeDialogItem(null);
    routeToActionTarget(item);
  }, [judgeDialogItem, routeToActionTarget]);

  const handleActionClick = useCallback(
    (item: ActionItem) => {
      if (item.action === "confirm-promote") {
        setPromoteDialogOpen(true);
      } else if (item.action === "open-dates-dialog") {
        setSettingsDialogError(null);
        setDatesDialogItem(item);
      } else if (item.action === "open-description-dialog") {
        setSettingsDialogError(null);
        setDescriptionDialogItem(item);
      } else if (item.action === "open-banner-dialog") {
        setBannerDialogItem(item);
      } else if (
        item.action === "open-challenge-dialog"
      ) {
        setChallengeDialogItem(item);
      } else if (item.action === "release-challenge") {
        setReleaseChallengeDialogItem(item);
        setReleaseChallengeError(null);
      } else if (item.action === "open-perk-dialog") {
        setPerkDialogItem(item);
      } else if (item.action === "open-prize-dialog") {
        setPrizeDialogItem(item);
      } else if (item.action === "open-judge-dialog") {
        setJudgeDialogItem(item);
      } else if (item.action === "open-agenda-dialog") {
        setAgendaDialogOpen(true);
      } else if (item.action === "open-location-dialog") {
        setLocationDialogItem(item);
      } else if (item.action === "open-team-settings-dialog") {
        setTeamSettingsDialogItem(item);
      } else if (item.action === "open-community-dialog") {
        setSettingsDialogError(null);
        setCommunityDialogItem(item);
      } else if (item.action === "open-submission-deadline-dialog") {
        setSubmissionDeadlineDialogItem(item);
        submissionDeadlineRef.current?.openDialog();
      } else if (item.action === "open-showcase-dialog") {
        setShowcaseDialogOpen(true);
      } else if (item.action?.startsWith("transition-to-")) {
        const targetStatus = item.action.replace("transition-to-", "");
        transitionRef.current?.openTransitionDialog(targetStatus);
      } else {
        const tabAction = tabActionsRef.current.get(item.id);
        const opensAcrossTabs = CROSS_TAB_DIALOG_ACTIONS.has(item.id);
        const currentTab = searchParams.get("tab") ?? "action-items";
        const isOnTargetTab =
          currentTab === item.tab &&
          (!item.subtab ||
            !item.subtabKey ||
            searchParams.get(item.subtabKey) === item.subtab);
        if (tabAction && (opensAcrossTabs || isOnTargetTab)) {
          tabAction();
          return;
        }
        const href = buildActionHref(slug, item);
        if (href && item.tab) setReviewDialogItem(item);
      }
    },
    [searchParams, slug],
  );

  const triggerTransition = useCallback((targetStatus: string) => {
    transitionRef.current?.openTransitionDialog(targetStatus);
  }, []);

  useEffect(() => {
    const current = snapshotsRef.current;
    let changed = false;
    const next = { ...current };
    for (const item of allItems) {
      const itemComplete = isCompleted(item) || completedIds.has(item.id);
      if (itemComplete && !next[item.id]) {
        next[item.id] = item;
        changed = true;
      }
      if (!itemComplete && next[item.id]) {
        delete next[item.id];
        changed = true;
      }
    }
    if (changed) {
      snapshotsRef.current = next;
      setCompletedSnapshots(next);
    }
  }, [allItems, completedIds]);

  const { activeItems, completedItems } = useMemo(() => {
    const active: ActionItem[] = [];
    const completed: ActionItem[] = [];
    const seenIds = new Set<string>();
    for (const item of allItems) {
      seenIds.add(item.id);
      if (effectiveDismissedIds.has(item.id)) continue;
      if (isCompleted(item) || effectiveCompletedIds.has(item.id)) {
        completed.push(item);
      } else {
        active.push(item);
      }
    }
    // Include completed items from previous statuses that are no longer in current action items
    for (const [id, item] of Object.entries(completedSnapshots)) {
      if (!seenIds.has(id) && !effectiveDismissedIds.has(id)) {
        completed.push(item);
      }
    }
    active.sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );
    return { activeItems: active, completedItems: completed };
  }, [
    allItems,
    effectiveCompletedIds,
    effectiveDismissedIds,
    completedSnapshots,
  ]);

  const persistedCount = Object.keys(completedSnapshots).filter(
    (id) => !actionItemIds.has(id) && !effectiveDismissedIds.has(id),
  ).length;
  const totalCount =
    allItems.filter((i) => !effectiveDismissedIds.has(i.id)).length +
    persistedCount;
  const remainingCount = activeItems.length;

  const value = useMemo<ActionItemsContextValue>(
    () => ({
      actionItems,
      completedIds: effectiveCompletedIds,
      dismissedIds: effectiveDismissedIds,
      activeItems,
      completedItems,
      remainingCount,
      totalCount,
      toggleComplete,
      dismissItem,
      panelOpen,
      setPanelOpen,
      handleActionClick,
      triggerTransition,
      addCustomItem,
      removeCustomItem,
      customItems,
      registerTabAction,
      unregisterTabAction,
      openRegisteredAction,
      isStale,
      hackathonStatus: effectiveStatus,
      hackathonPhase: livePhase,
      challengeExists: liveChallengeExists,
      slug,
      setOptimisticStage,
      manageWebMcpView,
      beginManageWebMcpChange,
      commitManageWebMcpChange,
      rollbackManageWebMcpChange,
      replaceManageSchedule,
      replaceManageChallenges,
      replaceManagePrizes,
      replaceManageAnnouncements,
      actionItemsError,
      openShowcaseDialog: () => setShowcaseDialogOpen(true),
    }),
    [
      actionItems,
      effectiveCompletedIds,
      effectiveDismissedIds,
      activeItems,
      completedItems,
      remainingCount,
      totalCount,
      toggleComplete,
      dismissItem,
      panelOpen,
      setPanelOpen,
      handleActionClick,
      triggerTransition,
      addCustomItem,
      removeCustomItem,
      customItems,
      registerTabAction,
      unregisterTabAction,
      openRegisteredAction,
      isStale,
      effectiveStatus,
      livePhase,
      liveChallengeExists,
      slug,
      manageWebMcpView,
      beginManageWebMcpChange,
      commitManageWebMcpChange,
      rollbackManageWebMcpChange,
      replaceManageSchedule,
      replaceManageChallenges,
      replaceManagePrizes,
      replaceManageAnnouncements,
      actionItemsError,
    ],
  );

  return (
    <ActionItemsContext.Provider value={value}>
      {children}
      <TransitionConfirmDialog
        ref={transitionRef}
        hackathonId={hackathonId}
        status={liveStatus}
        endsAt={liveEndsAt}
        judgingSetupIssues={judgingSetupIssues}
        onTransitioned={refreshPoll}
      />
      <SubmissionDeadlineDialog
        ref={submissionDeadlineRef}
        hackathonId={hackathonId}
        scheduleItems={scheduleItems}
        endsAt={liveEndsAt}
        onSaved={() => {
          markComplete("check-submission-deadline");
          const item = submissionDeadlineDialogItem;
          setSubmissionDeadlineDialogItem(null);
          routeToActionTarget(item);
        }}
      />
      <Dialog
        open={!!datesDialogItem}
        onOpenChange={(open) => {
          if (!open) {
            setDatesDialogItem(null);
            setSettingsDialogError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Event dates</DialogTitle>
            <DialogDescription>
              Set when the event starts and ends.
            </DialogDescription>
          </DialogHeader>
          {settingsDialogError && (
            <p className="text-sm text-destructive">{settingsDialogError}</p>
          )}
          <TimelineEditForm
            hackathonId={hackathonId}
            initialData={{
              startsAt: liveStartsAt,
              endsAt: liveEndsAt,
              allowLateRegistration: liveAllowLateRegistration,
            }}
            onCancel={() => setDatesDialogItem(null)}
            onSave={(data) =>
              saveSettingsForAction(datesDialogItem, {
                startsAt: data.startsAt?.toISOString() ?? null,
                endsAt: data.endsAt?.toISOString() ?? null,
                allowLateRegistration: data.allowLateRegistration,
              })
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!descriptionDialogItem}
        onOpenChange={(open) => {
          if (!open) {
            setDescriptionDialogItem(null);
            setSettingsDialogError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Event description</DialogTitle>
            <DialogDescription>
              Tell attendees what the event is about.
            </DialogDescription>
          </DialogHeader>
          {settingsDialogError && (
            <p className="text-sm text-destructive">{settingsDialogError}</p>
          )}
          <AboutEditForm
            hackathonId={hackathonId}
            initialData={{ description }}
            locale={descriptionLocale}
            onCancel={() => setDescriptionDialogItem(null)}
            onSave={(data) =>
              saveSettingsForAction(descriptionDialogItem, {
                ...data,
                ...(descriptionLocale ? { locale: descriptionLocale } : {}),
              })
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog open={!!bannerDialogItem} onOpenChange={(open) => !open && setBannerDialogItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Banner image</DialogTitle>
            <DialogDescription>
              Add a banner for the event page.
            </DialogDescription>
          </DialogHeader>
          <BannerUpload
            hackathonId={hackathonId}
            currentBannerUrl={bannerUrl}
            mode="persisted"
            onUploadComplete={(url) => {
              setBannerUrl(url);
              const item = bannerDialogItem;
              setBannerDialogItem(null);
              routeToActionTarget(item);
            }}
          />
        </DialogContent>
      </Dialog>
      <ChallengeEditorDialog
        open={!!challengeDialogItem}
        onOpenChange={(open) => !open && setChallengeDialogItem(null)}
        hackathonId={hackathonId}
        challenge={challenges[0] ?? null}
        onSaved={handleChallengeSaved}
        releaseScheduleItem={challengeReleaseItem}
        hackathonStartsAt={liveStartsAt}
        hackathonEndsAt={liveEndsAt}
        hackathonStatus={liveStatus}
        alreadyReleased={!!challengeReleasedAt}
      />
      <AlertDialog
        open={!!releaseChallengeDialogItem}
        onOpenChange={(open) => {
          if (!open) {
            setReleaseChallengeDialogItem(null);
            setReleaseChallengeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release challenge now?</AlertDialogTitle>
            <AlertDialogDescription>
              Attendees will be able to see the challenge right away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {releaseChallengeError && (
            <p className="text-sm text-destructive">{releaseChallengeError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releasingChallenge}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReleaseChallenge();
              }}
              disabled={releasingChallenge}
            >
              {releasingChallenge ? "Releasing..." : "Release"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PerkEditorDialog
        open={!!perkDialogItem}
        onOpenChange={(open) => !open && setPerkDialogItem(null)}
        hackathonId={hackathonId}
        perk={null}
        sponsors={sponsors}
        onSaved={handlePerkSaved}
      />
      <AddPrizeDialog
        hackathonId={hackathonId}
        open={!!prizeDialogItem}
        onOpenChange={(open) => !open && setPrizeDialogItem(null)}
        rounds={rounds}
        onSuccess={(created) => {
          if (created) handlePrizeActionDone();
        }}
      />
      <AddJudgeDialog
        hackathonId={hackathonId}
        open={!!judgeDialogItem}
        onOpenChange={(open) => !open && setJudgeDialogItem(null)}
        onSuccess={handleJudgeActionDone}
      />
      <Dialog open={agendaDialogOpen} onOpenChange={setAgendaDialogOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Your agenda</DialogTitle>
            <DialogDescription>Add and update the event schedule.</DialogDescription>
          </DialogHeader>
          <ScheduleEditor
            hackathonId={hackathonId}
            scheduleItems={scheduleItems}
            challengeReleasedAt={challengeReleasedAt}
            challengeExists={liveChallengeExists}
            hackathonStartsAt={serverStartsAt}
            hackathonEndsAt={liveEndsAt}
            hackathonStatus={liveStatus}
            hideHeader
            onEditTriggerItem={(item) => {
              if (item.trigger_type === "challenge_release") {
                setAgendaDialogOpen(false);
                router.push(`/e/${slug}/manage?tab=challenges`);
              } else if (item.trigger_type === "submission_deadline") {
                setSubmissionDeadlineDialogItem(null);
                submissionDeadlineRef.current?.openDialog();
              }
            }}
            onAddChallenge={() => {
              setAgendaDialogOpen(false);
              router.push(`/e/${slug}/manage?tab=challenges`);
            }}
            onScheduleChange={(items) =>
              replaceManageSchedule(items as ScheduleItem[])
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!reviewDialogItem}
        onOpenChange={(open) => !open && setReviewDialogItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewDialogItem?.label}</DialogTitle>
            <DialogDescription>
              {reviewDialogItem?.tooltip ?? reviewDialogItem?.hint ?? "Review this task before you continue."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogItem(null)}>
              Stay here
            </Button>
            <Button
              onClick={() => {
                const href = reviewDialogItem
                  ? buildActionTargetHref(slug, reviewDialogItem)
                  : null;
                setReviewDialogItem(null);
                if (href) router.push(href);
              }}
            >
              {reviewDialogItem?.ctaLabel ?? "Open task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LocationEditDialog
        open={!!locationDialogItem}
        onOpenChange={(open) => !open && setLocationDialogItem(null)}
        hackathonId={hackathonId}
        initialData={locationInitialData}
        onSaved={() => {
          const item = locationDialogItem;
          setLocationDialogItem(null);
          routeToActionTarget(item);
        }}
      />
      <TeamSettingsDialog
        open={!!teamSettingsDialogItem}
        onOpenChange={(open) => !open && setTeamSettingsDialogItem(null)}
        hackathonId={hackathonId}
        initialData={teamSettingsInitialData}
        onSaved={() => {
          markComplete("review-team-settings");
          const item = teamSettingsDialogItem;
          setTeamSettingsDialogItem(null);
          routeToActionTarget(item);
        }}
      />
      <Dialog
        open={!!communityDialogItem}
        onOpenChange={(open) => {
          if (!open) {
            setCommunityDialogItem(null);
            setSettingsDialogError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Community link</DialogTitle>
            <DialogDescription>
              Share a Discord, Slack, or help link with registered attendees.
            </DialogDescription>
          </DialogHeader>
          {settingsDialogError && (
            <p className="text-sm text-destructive">{settingsDialogError}</p>
          )}
          <CommunityEditForm
            hackathonId={hackathonId}
            initialUrl={communityInitialData.url}
            initialLabel={communityInitialData.label}
            locale={descriptionLocale}
            onCancel={() => setCommunityDialogItem(null)}
            onSave={(data) =>
              saveSettingsForAction(communityDialogItem, {
                ...data,
                ...(descriptionLocale ? { locale: descriptionLocale } : {}),
              })
            }
          />
        </DialogContent>
      </Dialog>
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Have you promoted your event?</DialogTitle>
            <DialogDescription>
              Share the event link on social media, email potential
              participants, and spread the word through your community.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 min-w-0">
            <code className="flex-1 min-w-0 truncate text-sm">{`${typeof window !== "undefined" ? window.location.origin : ""}/e/${slug}`}</code>
            <CopyButton value={`${typeof window !== "undefined" ? window.location.origin : ""}/e/${slug}`} showLabel={false} size="icon" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteDialogOpen(false)}>
              Not yet
            </Button>
            <Button onClick={() => { toggleComplete("promote-event"); setPromoteDialogOpen(false); }}>
              Yes, done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ShowcaseDialog
        open={showcaseDialogOpen}
        onOpenChange={setShowcaseDialogOpen}
        hackathonId={hackathonId}
        hackathonSlug={slug}
        rounds={rounds.map((r) => ({ id: r.id, name: r.name }))}
      />
    </ActionItemsContext.Provider>
  );
}

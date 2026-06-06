"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  startTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getOrganizerActionItems,
  isCompleted,
  type ActionItem,
  type ActionSeverity,
} from "@/lib/utils/organizer-actions";
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types";
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
import type { Perk } from "@/lib/services/perks";
import { assertOk } from "@/lib/utils/fetch";

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
  openShowcaseDialog: () => void;
  isStale: boolean;
  hackathonStatus: HackathonStatus;
  hackathonPhase: HackathonPhase | null;
  challengeExists: boolean;
  slug: string;
  setOptimisticStage: (stage: StageKey | null) => void;
}

const ActionItemsContext = createContext<ActionItemsContextValue | null>(null);

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
  hackathonId: string;
  slug: string;
  status: HackathonStatus;
  phase: HackathonPhase | null;
  challengeExists: boolean;
  challengeReleasedAt: string | null;
  challenges: Challenge[];
  challengeReleaseItem: ScheduleItem | null;
  scheduleItems: ScheduleItem[];
  startsAt: string | null;
  endsAt: string | null;
  registrationClosesAt: string | null;
  allowLateRegistration: boolean;
  description: string | null;
  descriptionLocale: string | null;
  bannerUrl: string | null;
  locationInitialData: LocationInitialData;
  teamSettingsInitialData: TeamSettingsInitialData;
  communityInitialData: { url: string | null; label: string | null };
  sponsors: SponsorOption[];
  rounds: RoundData[];
  children: React.ReactNode;
};

export function ActionItemsProvider({
  actionItems: serverActionItems,
  hackathonId,
  slug,
  status: serverStatus,
  phase: serverPhase,
  challengeExists,
  challengeReleasedAt,
  challenges: serverChallenges,
  challengeReleaseItem,
  scheduleItems: serverScheduleItems,
  startsAt: serverStartsAt,
  endsAt: serverEndsAt,
  registrationClosesAt: serverRegistrationClosesAt,
  allowLateRegistration: serverAllowLateRegistration,
  description,
  descriptionLocale,
  bannerUrl: serverBannerUrl,
  locationInitialData,
  teamSettingsInitialData,
  communityInitialData,
  sponsors,
  rounds,
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
  const [releasingChallenge, setReleasingChallenge] = useState(false);
  const [releaseChallengeError, setReleaseChallengeError] = useState<string | null>(null);
  const [settingsDialogError, setSettingsDialogError] = useState<string | null>(null);
  const [pendingTargetRefreshHref, setPendingTargetRefreshHref] = useState<string | null>(null);

  const [scheduleItems, setScheduleItems] = useState(serverScheduleItems);
  useEffect(() => {
    setScheduleItems(serverScheduleItems);
  }, [serverScheduleItems]);
  const [challenges, setChallenges] = useState(serverChallenges);
  useEffect(() => {
    setChallenges(serverChallenges);
  }, [serverChallenges]);
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
        registrationClosesAt: liveRegistrationClosesAt,
        allowLateRegistration: liveAllowLateRegistration,
      })
    : serverActionItems;

  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const s = localStorage.getItem(`completed-actions-${hackathonId}`);
      if (s) return new Set(JSON.parse(s) as string[]);
    } catch {}
    return new Set<string>();
  });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const s = localStorage.getItem(`dismissed-actions-${hackathonId}`);
      if (s) return new Set(JSON.parse(s) as string[]);
    } catch {}
    return new Set<string>();
  });
  const [customItems, setCustomItems] = useState<ActionItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const s = localStorage.getItem(`custom-actions-${hackathonId}`);
      if (s) {
        const raw = JSON.parse(s) as Array<Partial<ActionItem> & { id: string; label: string; severity: ActionSeverity }>;
        return raw.map((i) => ({ ...i, close: i.close ?? { kind: "manual" as const } }) as ActionItem);
      }
    } catch {}
    return [];
  });
  const [completedSnapshots, setCompletedSnapshots] = useState<
    Record<string, ActionItem>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const s = localStorage.getItem(`completed-snapshots-${hackathonId}`);
      if (s) {
        const raw = JSON.parse(s) as Record<string, Partial<ActionItem> & { id: string; label: string; severity: ActionSeverity }>;
        const out: Record<string, ActionItem> = {};
        for (const [k, v] of Object.entries(raw)) {
          out[k] = { ...v, close: v.close ?? { kind: "auto" as const, isComplete: true } } as ActionItem;
        }
        return out;
      }
    } catch {}
    return {};
  });
  const snapshotsRef = useRef(completedSnapshots);
  useEffect(() => {
    snapshotsRef.current = completedSnapshots;
  }, [completedSnapshots]);

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

  useEffect(() => {
    if (effectiveDismissedIds !== dismissedIds) {
      localStorage.setItem(
        `dismissed-actions-${hackathonId}`,
        JSON.stringify([...effectiveDismissedIds]),
      );
    }
  }, [effectiveDismissedIds, dismissedIds, hackathonId]);

  const toggleComplete = useCallback(
    (id: string) => {
      const item = allItems.find((i) => i.id === id);
      if (!item || item.close.kind !== "manual") return;
      const wasCompleted = completedIds.has(id);
      setCompletedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        localStorage.setItem(
          `completed-actions-${hackathonId}`,
          JSON.stringify([...next]),
        );
        return next;
      });
      setCompletedSnapshots((prev) => {
        const next = { ...prev };
        if (wasCompleted) {
          delete next[id];
        } else {
          next[id] = item;
        }
        localStorage.setItem(
          `completed-snapshots-${hackathonId}`,
          JSON.stringify(next),
        );
        return next;
      });
    },
    [hackathonId, allItems, completedIds],
  );

  const markComplete = useCallback(
    (id: string) => {
      const item = allItems.find((i) => i.id === id);
      if (!item || item.close.kind !== "manual") return;
      setCompletedIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        localStorage.setItem(
          `completed-actions-${hackathonId}`,
          JSON.stringify([...next]),
        );
        return next;
      });
      setCompletedSnapshots((prev) => {
        if (prev[id]) return prev;
        const next = { ...prev, [id]: item };
        localStorage.setItem(
          `completed-snapshots-${hackathonId}`,
          JSON.stringify(next),
        );
        return next;
      });
    },
    [hackathonId, allItems],
  );

  const dismissItem = useCallback(
    (id: string) => {
      const item = allItems.find((i) => i.id === id);
      if (!item || item.close.kind !== "dismiss") return;
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        localStorage.setItem(
          `dismissed-actions-${hackathonId}`,
          JSON.stringify([...next]),
        );
        return next;
      });
    },
    [hackathonId, allItems],
  );

  const addCustomItem = useCallback(
    (label: string, severity: ActionSeverity = "info") => {
      const item: ActionItem = {
        id: `custom-${Date.now()}`,
        label,
        severity,
        close: { kind: "manual" },
      };
      setCustomItems((prev) => {
        const next = [...prev, item];
        localStorage.setItem(
          `custom-actions-${hackathonId}`,
          JSON.stringify(next),
        );
        return next;
      });
    },
    [hackathonId],
  );

  const removeCustomItem = useCallback(
    (id: string) => {
      setCustomItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        localStorage.setItem(
          `custom-actions-${hackathonId}`,
          JSON.stringify(next),
        );
        return next;
      });
      setCompletedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        localStorage.setItem(
          `completed-actions-${hackathonId}`,
          JSON.stringify([...next]),
        );
        return next;
      });
      setCompletedSnapshots((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        localStorage.setItem(
          `completed-snapshots-${hackathonId}`,
          JSON.stringify(next),
        );
        return next;
      });
    },
    [hackathonId],
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
      setChallenges((prev) => {
        const existing = prev.findIndex((c) => c.id === saved.id);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = saved;
          return next;
        }
        return [...prev, saved];
      });
      const item = challengeDialogItem;
      setChallengeDialogItem(null);
      routeToActionTarget(item);
    },
    [challengeDialogItem, routeToActionTarget],
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
        const href = buildActionHref(slug, item);
        if (href && item.tab) {
          const currentTab = searchParams.get("tab") ?? "action-items";
          const isOnTargetTab =
            currentTab === item.tab &&
            (!item.subtab ||
              !item.subtabKey ||
              searchParams.get(item.subtabKey) === item.subtab);
          if (isOnTargetTab) {
            const tabAction = tabActionsRef.current.get(item.id);
            if (tabAction) {
              tabAction();
              return;
            }
          }
          router.push(href);
        }
      }
    },
    [slug, router, searchParams],
  );

  const triggerTransition = useCallback((targetStatus: string) => {
    transitionRef.current?.openTransitionDialog(targetStatus);
  }, []);

  // Snapshot auto-completed and manually-completed items so they persist across status changes
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
      localStorage.setItem(
        `completed-snapshots-${hackathonId}`,
        JSON.stringify(next),
      );
    }
  }, [allItems, completedIds, hackathonId]);

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
      isStale,
      hackathonStatus: effectiveStatus,
      hackathonPhase: livePhase,
      challengeExists: liveChallengeExists,
      slug,
      setOptimisticStage,
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
      isStale,
      effectiveStatus,
      livePhase,
      liveChallengeExists,
      slug,
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
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Your agenda</DialogTitle>
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
            onScheduleChange={(items) => setScheduleItems(items as ScheduleItem[])}
          />
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

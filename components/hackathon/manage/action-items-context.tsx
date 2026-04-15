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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  isStale: boolean;
  hackathonStatus: HackathonStatus;
  hackathonPhase: HackathonPhase | null;
  challengeExists: boolean;
  slug: string;
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

export function buildActionHref(slug: string, item: ActionItem): string | null {
  if (item.action) return null;
  if (!item.tab) return null;
  const params = new URLSearchParams({ tab: item.tab });
  if (item.subtab && item.subtabKey) params.set(item.subtabKey, item.subtab);
  return `/e/${slug}/manage?${params.toString()}`;
}

type TeamSettingsInitialData = {
  minTeamSize: number;
  maxTeamSize: number;
  allowSolo: boolean;
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
  scheduleItems: ScheduleItem[];
  startsAt: string | null;
  endsAt: string | null;
  locationInitialData: LocationInitialData;
  teamSettingsInitialData: TeamSettingsInitialData;
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
  scheduleItems: serverScheduleItems,
  startsAt: serverStartsAt,
  endsAt: serverEndsAt,
  locationInitialData,
  teamSettingsInitialData,
  children,
}: ProviderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transitionRef = useRef<TransitionConfirmDialogHandle>(null);
  const submissionDeadlineRef = useRef<SubmissionDeadlineDialogHandle>(null);
  const tabActionsRef = useRef(new Map<string, () => void>());
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [agendaDialogOpen, setAgendaDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [teamSettingsDialogOpen, setTeamSettingsDialogOpen] = useState(false);

  const [scheduleItems, setScheduleItems] = useState(serverScheduleItems);
  useEffect(() => {
    setScheduleItems(serverScheduleItems);
  }, [serverScheduleItems]);

  const { data: pollData, isStale, refresh: refreshPoll } =
    useOrganizerPoll(hackathonId);

  const serverFingerprint = useMemo(
    () => serverActionItems.map((i) => `${i.id}:${i.close.kind === "auto" ? i.close.isComplete : ""}`).join(","),
    [serverActionItems],
  );
  const prevFingerprintRef = useRef(serverFingerprint);
  useEffect(() => {
    if (prevFingerprintRef.current !== serverFingerprint) {
      prevFingerprintRef.current = serverFingerprint;
      refreshPoll();
    }
  }, [serverFingerprint, refreshPoll]);

  const actionItems = pollData
    ? getOrganizerActionItems(pollData)
    : serverActionItems;
  const liveChallengeExists = pollData
    ? pollData.challengeExists
    : challengeExists;
  const liveEndsAt = pollData ? pollData.endsAt : serverEndsAt;
  const liveStatus = (
    pollData ? pollData.status : serverStatus
  ) as HackathonStatus;
  const livePhase = (
    pollData ? pollData.phase : serverPhase
  ) as HackathonPhase | null;

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

  const handleActionClick = useCallback(
    (item: ActionItem) => {
      if (item.action === "confirm-promote") {
        setPromoteDialogOpen(true);
      } else if (
        item.action === "open-challenge-dialog" ||
        item.action === "release-challenge"
      ) {
        router.push(`/e/${slug}/manage?tab=challenges`);
      } else if (item.action === "open-agenda-dialog") {
        setAgendaDialogOpen(true);
      } else if (item.action === "open-location-dialog") {
        setLocationDialogOpen(true);
      } else if (item.action === "open-team-settings-dialog") {
        setTeamSettingsDialogOpen(true);
      } else if (item.action === "open-submission-deadline-dialog") {
        submissionDeadlineRef.current?.openDialog();
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
      hackathonStatus: liveStatus,
      hackathonPhase: livePhase,
      challengeExists: liveChallengeExists,
      slug,
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
      liveStatus,
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
        onSaved={() => markComplete("check-submission-deadline")}
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
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        hackathonId={hackathonId}
        initialData={locationInitialData}
        onSaved={refreshPoll}
      />
      <TeamSettingsDialog
        open={teamSettingsDialogOpen}
        onOpenChange={setTeamSettingsDialogOpen}
        hackathonId={hackathonId}
        initialData={teamSettingsInitialData}
        onSaved={() => markComplete("review-team-settings")}
      />
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
    </ActionItemsContext.Provider>
  );
}

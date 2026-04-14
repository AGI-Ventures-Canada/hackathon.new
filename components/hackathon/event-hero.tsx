import { OptimizedImage } from "@/components/ui/optimized-image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Moon, Sun, Calendar, CalendarDays, Zap, MapPin, Video, Settings, Scale, Pencil } from "lucide-react";
import type {
  HackathonStatus,
  TenantProfile,
  Submission,
} from "@/lib/db/hackathon-types";
import { RegistrationButton } from "./registration-button";
import { SubmissionButton } from "./submission-button";
import { CountdownBadge } from "./countdown-badge";
import { getTimelineState } from "@/lib/utils/timeline";
import { formatDateRange } from "@/lib/utils/format";

interface RegistrationProps {
  hackathonSlug: string;
  status: HackathonStatus;
  endsAt: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  maxParticipants: number | null;
  participantCount: number;
  isRegistered: boolean;
  requireLocationVerification?: boolean;
  submission?: Submission | null;
  onRegistrationSuccess?: () => void;
  teamSizeWarning?: string | null;
}

interface EventHeroProps {
  name: string;
  bannerUrl: string | null;
  status: HackathonStatus;
  startsAt: string | null;
  endsAt: string | null;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  organizer: Pick<TenantProfile, "name" | "slug" | "logo_url" | "logo_url_dark">;
  locationType?: "in_person" | "virtual" | null;
  locationName?: string | null;
  locationUrl?: string | null;
  onNameClick?: () => void;
  onDatesClick?: () => void;
  onLocationClick?: () => void;
  nameEditSlot?: React.ReactNode;
  datesEditSlot?: React.ReactNode;
  locationEditSlot?: React.ReactNode;
  registrationProps?: RegistrationProps;
  isRegistered?: boolean;
  hideRegistrationButton?: boolean;
  isOrganizer?: boolean;
  isJudge?: boolean;
  hackathonSlug?: string;
  tabsSlot?: React.ReactNode;
  statusSlot?: React.ReactNode;
  bannerSlot?: React.ReactNode;
  orgNameWrapper?: (orgName: React.ReactNode) => React.ReactNode;
}

function formatTimeRange(
  startsAt: string | null,
  endsAt: string | null,
): string | null {
  if (!startsAt || !endsAt) return null;

  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };

  const startTime = start.toLocaleTimeString("en-US", timeFormat);
  const endTime = end.toLocaleTimeString("en-US", timeFormat);

  return `${startTime} - ${endTime}`;
}

interface DurationInfo {
  label: string;
  icon: typeof Clock;
  description: string;
}

function getDurationInfo(
  startsAt: string | null,
  endsAt: string | null,
): DurationInfo | null {
  if (!startsAt || !endsAt) return null;

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  const startDay = start.getDate();
  const endDay = end.getDate();
  const crossesMidnight =
    endDay !== startDay || end.getMonth() !== start.getMonth();

  if (hours <= 0) return null;

  if (hours < 3) {
    return { label: "Quick Sprint", icon: Zap, description: "Under 3 hours" };
  }

  if (hours < 6) {
    return {
      label: "Half Day",
      icon: Sun,
      description: `${Math.round(hours)} hours`,
    };
  }

  if (hours < 12) {
    return {
      label: "Day Event",
      icon: Sun,
      description: `${Math.round(hours)} hours`,
    };
  }

  if (hours < 24 && crossesMidnight) {
    return {
      label: "Overnight",
      icon: Moon,
      description: `${Math.round(hours)} hours`,
    };
  }

  if (hours < 24) {
    return {
      label: "Full Day",
      icon: Sun,
      description: `${Math.round(hours)} hours`,
    };
  }

  if (hours < 48) {
    return { label: "Overnight", icon: Moon, description: "~1 day" };
  }

  if (hours < 72) {
    return { label: "Weekend", icon: Calendar, description: "2-3 days" };
  }

  if (hours < 168) {
    return {
      label: "Week Long",
      icon: CalendarDays,
      description: `${Math.round(hours / 24)} days`,
    };
  }

  return {
    label: "Multi-Week",
    icon: CalendarDays,
    description: `${Math.round(hours / 24)} days`,
  };
}

export function EventHero({
  name,
  bannerUrl,
  status,
  startsAt,
  endsAt,
  registrationOpensAt,
  registrationClosesAt,
  locationType,
  locationName,
  locationUrl,
  organizer,
  onNameClick,
  onDatesClick,
  onLocationClick,
  nameEditSlot,
  datesEditSlot,
  locationEditSlot,
  registrationProps,
  isRegistered = false,
  hideRegistrationButton = false,
  isOrganizer = false,
  isJudge = false,
  hackathonSlug,
  tabsSlot,
  statusSlot,
  bannerSlot,
  orgNameWrapper,
}: EventHeroProps) {
  const durationInfo = getDurationInfo(startsAt, endsAt);
  const timeRange = formatTimeRange(startsAt, endsAt);
  const timelineState = getTimelineState({
    status,
    registration_opens_at: registrationOpensAt,
    registration_closes_at: registrationClosesAt,
    starts_at: startsAt,
    ends_at: endsAt,
  });

  const showCountdown =
    isRegistered &&
    startsAt &&
    new Date(startsAt) > new Date() &&
    status !== "active" &&
    status !== "completed" &&
    status !== "judging";

  const datesContent = (
    <div className="flex flex-col gap-1">
      <p className="text-lg text-muted-foreground">
        {formatDateRange(startsAt, endsAt)}
      </p>
      {timeRange && (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {timeRange}
          {durationInfo && (
            <span className="text-muted-foreground/70">
              ({durationInfo.description})
            </span>
          )}
        </p>
      )}
    </div>
  );

  const locationLabel =
    locationType === "in_person"
      ? locationName || "In Person"
      : locationName || locationUrl || "Virtual";

  const LocationIcon = locationType === "in_person" ? MapPin : Video;

  const locationContent = (
    <div className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground text-left">
      <LocationIcon className="mt-0.5 size-3.5 shrink-0" />
      <span className="block min-w-0 break-words text-left">
        {locationLabel}
      </span>
    </div>
  );

  const contentColumn = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {showCountdown ? (
          <CountdownBadge startsAt={startsAt!} />
        ) : (
          <Badge variant={timelineState.variant}>
            {timelineState.label}
          </Badge>
        )}
        {durationInfo && (
          <Badge variant="outline" className="gap-1">
            <durationInfo.icon className="size-3" />
            {durationInfo.label}
          </Badge>
        )}
      </div>
      {nameEditSlot ? (
        <div data-edit-section="name" className="scroll-mt-24">
          {nameEditSlot}
        </div>
      ) : onNameClick ? (
        <button
          type="button"
          onClick={onNameClick}
          data-edit-section="name"
          className="group w-fit max-w-full rounded-md px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-muted/80 text-left scroll-mt-24"
        >
          <div className="flex items-center gap-2">
            <h1 className="text-3xl md:text-5xl font-bold text-foreground break-words">
              {name || (
                <span className="text-muted-foreground/60">Add your hackathon name</span>
              )}
            </h1>
            <span className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity self-end mb-2">
              <Pencil className="size-3" />
              Edit
            </span>
          </div>
        </button>
      ) : (
        <h1 className="text-3xl md:text-5xl font-bold text-foreground break-words">
          {name}
        </h1>
      )}
      {datesEditSlot ? (
        <div data-edit-section="dates" className="scroll-mt-24">
          {datesEditSlot}
        </div>
      ) : onDatesClick ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDatesClick();
          }}
          data-edit-section="dates"
          className="group w-fit rounded-md px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-muted/80 text-left scroll-mt-24"
        >
          <div className="flex items-center gap-2">
            {datesContent}
            <span className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-3" />
              Edit
            </span>
          </div>
        </button>
      ) : (
        datesContent
      )}
      {locationEditSlot ? (
        <div data-edit-section="location" className="scroll-mt-24">
          {locationEditSlot}
        </div>
      ) : locationType ? (
        onLocationClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLocationClick();
            }}
            data-edit-section="location"
            className="group max-w-full rounded-md px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-muted/80 text-left scroll-mt-24"
          >
            <div className="flex max-w-full items-start gap-2">
              <div className="min-w-0 flex-1">
                {locationContent}
              </div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="size-3" />
                Edit
              </span>
            </div>
          </button>
        ) : (
          locationContent
        )
      ) : onLocationClick ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLocationClick();
          }}
          data-edit-section="location"
          className="w-fit rounded-md px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-muted/80 scroll-mt-24"
        >
          <span className="text-xs text-muted-foreground">
            + Add location
          </span>
        </button>
      ) : null}
      <div className="flex items-center gap-2">
        {organizer.logo_url && (
          <>
            <OptimizedImage
              src={organizer.logo_url}
              alt={organizer.name}
              width={24}
              height={24}
              className="object-contain dark:hidden"
            />
            <OptimizedImage
              src={organizer.logo_url_dark || organizer.logo_url}
              alt={organizer.name}
              width={24}
              height={24}
              className="object-contain hidden dark:block"
            />
          </>
        )}
        {(() => {
          const orgNameEl = organizer.slug ? (
            <Link
              href={`/o/${organizer.slug}`}
              className="text-foreground hover:underline"
            >
              {organizer.name}
            </Link>
          ) : (
            <span className="text-foreground">{organizer.name}</span>
          )

          return (
            <span className="text-sm text-muted-foreground">
              Organized by{" "}
              {orgNameWrapper ? orgNameWrapper(orgNameEl) : orgNameEl}
            </span>
          )
        })()}
      </div>
      {statusSlot}
      {isOrganizer && hackathonSlug ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href={`/e/${hackathonSlug}/manage`}>
              <Settings className="size-4" />
              Manage
            </Link>
          </Button>
          {isJudge && (
            <Button variant="outline" asChild>
              <Link href={`/e/${hackathonSlug}/judge`}>
                <Scale className="size-4" />
                Judge
              </Link>
            </Button>
          )}
        </div>
      ) : registrationProps && (
        <div className="flex flex-wrap items-center gap-2">
          {!hideRegistrationButton && !isRegistered && (
            <RegistrationButton
              hackathonSlug={registrationProps.hackathonSlug}
              status={status}
              endsAt={registrationProps.endsAt}
              registrationOpensAt={registrationProps.registrationOpensAt}
              registrationClosesAt={registrationProps.registrationClosesAt}
              maxParticipants={registrationProps.maxParticipants}
              participantCount={registrationProps.participantCount}
              isRegistered={registrationProps.isRegistered}
              requireLocationVerification={registrationProps.requireLocationVerification}
              onRegistrationSuccess={registrationProps.onRegistrationSuccess}
            />
          )}
          <SubmissionButton
            hackathonSlug={registrationProps.hackathonSlug}
            status={registrationProps.status}
            isRegistered={registrationProps.isRegistered}
            submission={registrationProps.submission ?? null}
            teamSizeWarning={registrationProps.teamSizeWarning}
          />
          {tabsSlot}
        </div>
      )}
    </div>
  );

  const hasRightColumn = bannerUrl || bannerSlot;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {hasRightColumn ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="order-2 md:order-1 min-w-0">{contentColumn}</div>
          <div className="order-1 md:order-2">
            {bannerSlot ? (
              bannerSlot
            ) : bannerUrl ? (
              <div className="aspect-square rounded-xl border bg-muted overflow-hidden relative">
                <OptimizedImage
                  src={bannerUrl}
                  alt={`${name} banner`}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        contentColumn
      )}
    </div>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { HackathonJudgeDisplay } from "@/lib/db/hackathon-types"
import { getDisplayName } from "@/lib/utils/person-display"

interface JudgeCardProps {
  judge: HackathonJudgeDisplay
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function JudgeCard({ judge }: JudgeCardProps) {
  const displayName = getDisplayName({ name: judge.name, fallback: "Judge" })

  return (
    <div className="flex w-32 max-w-full flex-col items-center gap-2 sm:w-36">
      <Avatar className="size-16">
        {judge.headshot_url && <AvatarImage src={judge.headshot_url} alt={displayName} />}
        <AvatarFallback className="text-sm">{getInitials(displayName)}</AvatarFallback>
      </Avatar>
      <div className="w-full min-w-0 space-y-0.5 text-center">
        <p className="text-sm font-medium leading-tight break-words">{displayName}</p>
        {judge.title && (
          <p className="text-xs text-muted-foreground leading-tight break-words">{judge.title}</p>
        )}
        {judge.organization && (
          <p className="text-xs text-muted-foreground leading-tight break-words">{judge.organization}</p>
        )}
      </div>
    </div>
  )
}


import type { TimelineEvent, TimelineEventType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  PlayCircle,
  GitCommit,
  UserPlus,
  Bug,
  FileCheck,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FileX,
  Edit,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';


interface TimelineEventCardProps {
  event: TimelineEvent;
  hideIcon?: boolean;
}

const eventIcons: Record<TimelineEventType, React.ElementType> = {
  TASK_CREATED: PlayCircle,
  MAIN_TASK_UPDATED: Edit,
  STATUS_CHANGED: CheckCircle2,
  ASSIGNMENT_CHANGED: UserPlus,
  ISSUE_CREATED: Bug,
  ISSUE_STATUS_CHANGED: AlertCircle,
  ATTACHMENT_ADDED: Paperclip,
  ISSUE_DELETED: Trash2,
  ATTACHMENT_DELETED: FileX,
};

export function TimelineEventCard({ event, hideIcon = false }: TimelineEventCardProps) {
  const Icon = eventIcons[event.type] || GitCommit;

  return (
    <div className="relative flex items-start gap-4">
      {!hideIcon && (
        <div className="absolute left-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-background border-2 border-border -translate-x-1/2 z-10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      )}
      <div className={cn("flex-1 space-y-1", !hideIcon && "pl-8")}>
        <p className="text-sm text-foreground">
            <span className="font-semibold">{event.author.name}</span> {event.description}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(event.timestamp, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

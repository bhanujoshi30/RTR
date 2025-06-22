
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
  RotateCcw,
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
  ATTACHMENT_DELETED: FileX,
  ISSUE_DELETED: Trash2,
  ATTACHMENT_ADDED: Paperclip,
  MAIN_TASK_COMPLETED: CheckCircle2,
  MAIN_TASK_REOPENED: RotateCcw,
};

const renderDescription = (event: TimelineEvent) => {
  if (event.type === 'ATTACHMENT_ADDED' && event.details?.url && event.details?.filename) {
    const filename = event.details.filename as string;
    // Ensure description is a string before splitting
    const description = typeof event.description === 'string' ? event.description : '';
    const parts = description.split(`"${filename}"`);
    return (
      <p className="text-sm text-foreground">
        <span className="font-semibold">{event.author.name}</span>
        {parts[0]}
        <a href={event.details.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
          "{filename}"
        </a>
        {parts[1]}
      </p>
    );
  }
  return (
    <p className="text-sm text-foreground">
      <span className="font-semibold">{event.author.name}</span> {event.description}
    </p>
  );
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
        {renderDescription(event)}
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(event.timestamp, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

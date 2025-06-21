
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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserCircle } from 'lucide-react';

interface TimelineEventCardProps {
  event: TimelineEvent;
}

const eventIcons: Record<TimelineEventType, React.ElementType> = {
  TASK_CREATED: PlayCircle,
  STATUS_CHANGED: CheckCircle2,
  ASSIGNMENT_CHANGED: UserPlus,
  ISSUE_CREATED: Bug,
  ISSUE_STATUS_CHANGED: AlertCircle,
  ATTACHMENT_ADDED: Paperclip,
  ISSUE_DELETED: Trash2,
  ATTACHMENT_DELETED: FileX,
};

export function TimelineEventCard({ event }: TimelineEventCardProps) {
  const Icon = eventIcons[event.type] || GitCommit;

  return (
    <div className="relative flex items-start gap-4">
      <div className="absolute left-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-background border-2 border-border -translate-x-1/2 z-10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 space-y-1 pl-8">
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

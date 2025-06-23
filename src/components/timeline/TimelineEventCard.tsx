
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
import { useTranslation } from '@/hooks/useTranslation';


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

const renderDescription = (event: TimelineEvent, t: (key: string, params?: any) => string) => {
  // New event format with descriptionKey
  if (event.descriptionKey) {
    const statusToKey = (status: string) => `status.${status.toLowerCase().replace(/ /g, '')}`;

    const detailsForTranslation = { ...event.details };
    if (event.details.newStatus) {
      detailsForTranslation.newStatus = t(statusToKey(event.details.newStatus));
    }
    if (event.details.oldStatus) {
      detailsForTranslation.oldStatus = t(statusToKey(event.details.oldStatus));
    }
    
    const descriptionText = t(event.descriptionKey, detailsForTranslation);

    if (event.type === 'ATTACHMENT_ADDED' && event.details?.url && event.details?.filename) {
      const filename = event.details.filename as string;
      const parts = descriptionText.split(filename);
      return (
        <p className="text-sm text-foreground">
          <span className="font-semibold">{event.author.name}</span>
          {parts.length > 1 ? (
            <>
              {parts[0]}
              <a href={event.details.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                {filename}
              </a>
              {parts[1]}
            </>
          ) : (
            ` ${descriptionText}` // fallback if split fails
          )}
        </p>
      );
    }
    return (
      <p className="text-sm text-foreground">
        <span className="font-semibold">{event.author.name}</span> {descriptionText}
      </p>
    );
  }

  // Fallback for old events that have the `description` field
  const legacyDescription = (event as any).description as string | undefined;
  if (legacyDescription) {
    let translationKey: string | undefined;

    // Map legacy event types to new translation keys
    switch (event.type) {
      case 'MAIN_TASK_COMPLETED':
        translationKey = 'timeline.mainTaskCompleted';
        break;
      case 'MAIN_TASK_UPDATED':
        translationKey = 'timeline.mainTaskUpdated';
        break;
      case 'TASK_CREATED':
        // This is a simplification; we assume it's a main task based on context
        // where this component is used for main task events.
        translationKey = 'timeline.mainTaskCreated';
        break;
      case 'MAIN_TASK_REOPENED':
        // Use a generic key for legacy events, which doesn't need params.
        translationKey = 'timeline.mainTaskReopenedLegacy';
        break;
      // Other legacy types can be added here
    }

    // If we found a key, use it. Otherwise, fallback to the stored English text.
    const textToShow = translationKey ? t(translationKey) : legacyDescription;

    return (
      <p className="text-sm text-foreground">
        <span className="font-semibold">{event.author.name}</span> {textToShow}
      </p>
    );
  }

  // Final fallback if nothing is found
  return (
    <p className="text-sm text-foreground">
      <span className="font-semibold">{event.author.name}</span> performed an event.
    </p>
  );
};


export function TimelineEventCard({ event, hideIcon = false }: TimelineEventCardProps) {
  const { t } = useTranslation();
  const Icon = eventIcons[event.type] || GitCommit;

  return (
    <div className="relative flex items-start gap-4">
      {!hideIcon && (
        <div className="absolute left-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-background border-2 border-border -translate-x-1/2 z-10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      )}
      <div className={cn("flex-1 space-y-1", !hideIcon && "pl-8")}>
        {renderDescription(event, t)}
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(event.timestamp, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

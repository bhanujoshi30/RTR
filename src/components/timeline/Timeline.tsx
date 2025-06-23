
"use client";

import { useEffect, useState } from 'react';
import type { TimelineEvent } from '@/types';
import { getTimelineForTask } from '@/services/timelineService';
import { Loader2, History } from 'lucide-react';
import { TimelineEventCard } from './TimelineEventCard';
import { useTranslation } from '@/hooks/useTranslation';

interface TimelineProps {
  taskId: string;
}

export function Timeline({ taskId }: TimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchTimeline = async () => {
      if (!taskId) return;
      try {
        setLoading(true);
        const fetchedEvents = await getTimelineForTask(taskId);
        setEvents(fetchedEvents);
        setError(null);
      } catch (err: any) {
        setError('Failed to load timeline events.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTimeline();
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">{t('common.loadingTimeline')}</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">{t('timeline.noHistoryTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('timeline.noHistorySubTask')}
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[35px] top-2 bottom-2 w-0.5 bg-border -translate-x-1/2"></div>
      <div className="space-y-8">
        {events.map((event) => (
          <TimelineEventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

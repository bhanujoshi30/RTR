
"use client";

import { useEffect, useState } from 'react';
import type { AggregatedEvent } from '@/types';
import { getTimelineForMainTask } from '@/services/taskService';
import { Loader2, History } from 'lucide-react';
import { MainTaskTimelineEventCard } from './MainTaskTimelineEventCard';

interface MainTaskTimelineProps {
  mainTaskId: string;
}

export function MainTaskTimeline({ mainTaskId }: MainTaskTimelineProps) {
  const [events, setEvents] = useState<AggregatedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTimeline = async () => {
      if (!mainTaskId) return;
      try {
        setLoading(true);
        const fetchedEvents = await getTimelineForMainTask(mainTaskId);
        setEvents(fetchedEvents);
        setError(null);
      } catch (err: any) {
        setError('Failed to load aggregated timeline.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTimeline();
  }, [mainTaskId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading timeline...</p>
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
        <h3 className="mt-3 font-headline text-lg font-semibold">No History Yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The timeline for this main task is empty.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[35px] top-2 bottom-2 w-0.5 bg-border -translate-x-1/2"></div>
      <div className="space-y-2">
        {events.map((event) => (
          <MainTaskTimelineEventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

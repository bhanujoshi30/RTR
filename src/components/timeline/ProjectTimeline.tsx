
"use client";

import { useEffect, useState } from 'react';
import type { ProjectAggregatedEvent } from '@/types';
import { getTimelineForProject } from '@/services/taskService';
import { Loader2, History } from 'lucide-react';
import { ProjectTimelineEventCard } from './ProjectTimelineEventCard';
import { useAuth } from '@/hooks/useAuth';

interface ProjectTimelineProps {
  projectId: string;
}

export function ProjectTimeline({ projectId }: ProjectTimelineProps) {
  const [eventGroups, setEventGroups] = useState<ProjectAggregatedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const fetchTimeline = async () => {
      if (!projectId || !user) return;
      try {
        setLoading(true);
        const isClientOrAdmin = user.role === 'client' || user.role === 'admin';
        const fetchedEvents = await getTimelineForProject(projectId);
        
        const filteredEvents = isClientOrAdmin
          ? fetchedEvents
          : fetchedEvents.filter(group => group.data.mainTaskInfo.taskType !== 'collection');
        
        setEventGroups(filteredEvents);
        setError(null);
      } catch (err: any) {
        setError('Failed to load project timeline.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTimeline();
  }, [projectId, user]);

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

  if (eventGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No History Yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No events have been recorded for this project yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {eventGroups.map((group) => (
        <ProjectTimelineEventCard key={group.id} eventGroup={group} />
      ))}
    </div>
  );
}

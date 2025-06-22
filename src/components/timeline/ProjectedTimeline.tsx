
"use client";

import { useEffect, useState } from 'react';
import type { Task } from '@/types';
import { getAllProjectTasks } from '@/services/taskService';
import { Loader2, GanttChartSquare } from 'lucide-react';
import { ProjectedTimelineItem } from './ProjectedTimelineItem';

interface ProjectedTimelineProps {
  projectId: string;
}

export function ProjectedTimeline({ projectId }: ProjectedTimelineProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTasks = async () => {
      if (!projectId) return;
      try {
        setLoading(true);
        const fetchedTasks = await getAllProjectTasks(projectId);
        const sortedTasks = fetchedTasks
          .filter(task => task.dueDate) // Only include tasks with a due date
          .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
        setTasks(sortedTasks);
        setError(null);
      } catch (err: any) {
        setError('Failed to load projected timeline.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [projectId]);

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

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <GanttChartSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No Tasks with Due Dates</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This project has no tasks with scheduled due dates to build a timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 border-l-2 border-border">
      <div className="space-y-8">
        {tasks.map((task) => (
          <ProjectedTimelineItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

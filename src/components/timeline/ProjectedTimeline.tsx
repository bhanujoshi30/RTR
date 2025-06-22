"use client";

import { useEffect, useState } from 'react';
import type { Task } from '@/types';
import { getAllProjectTasks } from '@/services/taskService';
import { getOpenIssuesForTaskIds } from '@/services/issueService';
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

        const mainTasks = fetchedTasks.filter(t => !t.parentId);
        const subTasks = fetchedTasks.filter(t => !!t.parentId);

        const subTasksByMainTaskId = subTasks.reduce((acc, subTask) => {
            const mainTaskId = subTask.parentId!;
            if (!acc[mainTaskId]) {
                acc[mainTaskId] = [];
            }
            acc[mainTaskId].push(subTask);
            return acc;
        }, {} as Record<string, Task[]>);

        mainTasks.forEach(mainTask => {
            if (mainTask.taskType === 'collection') {
                mainTask.progress = 0;
                return;
            }
            const relatedSubTasks = subTasksByMainTaskId[mainTask.id] || [];
            if (relatedSubTasks.length > 0) {
                const completedSubTasks = relatedSubTasks.filter(st => st.status === 'Completed').length;
                mainTask.progress = Math.round((completedSubTasks / relatedSubTasks.length) * 100);
            } else {
                mainTask.progress = 0;
            }
        });
        
        const subTaskIds = subTasks.map(t => t.id);
        const openIssues = await getOpenIssuesForTaskIds(subTaskIds);
        const issuesBySubTaskId = openIssues.reduce((acc, issue) => {
            acc[issue.taskId] = (acc[issue.taskId] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        subTasks.forEach(subTask => {
          subTask.openIssueCount = issuesBySubTaskId[subTask.id] || 0;
        });

        const tasksWithDetails = [...mainTasks, ...subTasks];
        
        const sortedTasks = tasksWithDetails
          .filter(task => task.dueDate) // Only include tasks with a due date
          .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
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
      <div className="space-y-4">
        {tasks.map((task) => (
          <ProjectedTimelineItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

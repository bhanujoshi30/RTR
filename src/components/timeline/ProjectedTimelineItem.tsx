
"use client";

import type { Task } from '@/types';
import { format } from 'date-fns';
import { Layers, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectedTimelineItemProps {
  task: Task;
}

const RupeeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg>

const getTaskType = (task: Task) => {
  if (task.taskType === 'collection') return { icon: RupeeIcon, label: 'Collection' };
  if (task.parentId) return { icon: ListChecks, label: 'Sub-task' };
  return { icon: Layers, label: 'Main Task' };
};

export function ProjectedTimelineItem({ task }: ProjectedTimelineItemProps) {
  const { icon: Icon, label } = getTaskType(task);

  return (
    <div className="relative flex items-start gap-4">
      <div className="absolute left-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-background border-2 border-primary/20 -translate-x-1/2 z-10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className={cn("flex-1 space-y-1 pl-8")}>
        <div className="flex justify-between items-center">
            <div>
                 <p className="text-sm font-semibold text-foreground">{task.name}</p>
                 <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <div className="text-right">
                <p className="text-sm font-medium text-foreground">{format(task.dueDate, 'PP')}</p>
                <p className="text-xs text-muted-foreground">Due Date</p>
            </div>
        </div>
      </div>
    </div>
  );
}

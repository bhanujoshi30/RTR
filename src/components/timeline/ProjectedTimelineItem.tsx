
"use client";

import type { Task } from '@/types';
import { format, differenceInCalendarDays } from 'date-fns';
import { Layers, ListChecks, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import React from 'react';
import { Progress } from '@/components/ui/progress';

const RupeeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg>

const getTaskType = (task: Task) => {
  if (task.taskType === 'collection') return { icon: RupeeIcon, label: 'Collection Task' };
  if (task.parentId) return { icon: ListChecks, label: 'Sub-task' };
  return { icon: Layers, label: 'Main Task' };
};

const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'To Do': return 'bg-amber-500 hover:bg-amber-500';
      case 'In Progress': return 'bg-sky-500 hover:bg-sky-500';
      case 'Completed': return 'bg-emerald-500 hover:bg-emerald-500';
      default: return 'bg-primary';
    }
};

interface ProjectedTimelineItemProps {
  task: Task;
}

export function ProjectedTimelineItem({ task }: ProjectedTimelineItemProps) {
  const { icon: Icon, label } = getTaskType(task);

  const daysRemaining = task.dueDate ? differenceInCalendarDays(task.dueDate, new Date()) : null;
  const showReminder = task.taskType === 'collection' && task.status !== 'Completed' && daysRemaining !== null && task.reminderDays && daysRemaining >= 0 && daysRemaining <= task.reminderDays;
  const hasOpenIssues = typeof task.openIssueCount === 'number' && task.openIssueCount > 0;
  const isStandardMainTask = !task.parentId && task.taskType !== 'collection';

  return (
    <div className="relative flex items-start gap-4">
      <div className="absolute left-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-background border-2 border-primary/20 -translate-x-1/2 z-10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className={cn("flex-1 space-y-2 pl-8 pb-4")}>
        <div className="flex justify-between items-start">
            <div className="flex-1">
                 <p className="text-sm font-semibold text-foreground pr-4">{task.name}</p>
                 <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-sm font-medium text-foreground">{task.dueDate ? format(task.dueDate, 'PP') : ''}</p>
                <p className="text-xs text-muted-foreground">Due Date</p>
            </div>
        </div>
        
        {isStandardMainTask && task.progress !== undefined && (
          <div className="pt-1">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{Math.round(task.progress)}%</span>
            </div>
            <Progress value={task.progress} className="h-1.5 w-full" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
            {showReminder && (
                <Badge variant="destructive" className="animate-pulse">
                    Reminder: {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left
                </Badge>
            )}
            {hasOpenIssues && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {task.openIssueCount} Open Issue{task.openIssueCount !== 1 ? 's' : ''}
                </Badge>
            )}
            <Badge variant="secondary" className={`${getStatusColor(task.status)} text-primary-foreground`}>
              {task.status}
            </Badge>
        </div>
      </div>
    </div>
  );
}

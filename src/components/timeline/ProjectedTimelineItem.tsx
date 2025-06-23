
"use client";

import type { Task } from '@/types';
import { format, differenceInCalendarDays } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { Layers, ListChecks, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { numberToWordsInr, replaceDevanagariNumerals } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

const RupeeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg>

const getTaskTypeInfo = (task: Task, t: (key: string) => string) => {
  if (task.taskType === 'collection') return { icon: RupeeIcon, label: t('taskForm.collectionTask') };
  if (task.parentId) return { icon: ListChecks, label: t('projectDetails.subTask') };
  return { icon: Layers, label: t('projectDetails.mainTasks') };
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
  isSubTask?: boolean;
}

export function ProjectedTimelineItem({ task, isSubTask = false }: ProjectedTimelineItemProps) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;
  const { icon: Icon, label } = getTaskTypeInfo(task, t);
  const { user } = useAuth();
  const canViewFinancials = user?.role === 'client' || user?.role === 'admin';

  const daysRemaining = task.dueDate ? differenceInCalendarDays(task.dueDate, new Date()) : null;
  
  const hasOpenIssues = typeof task.openIssueCount === 'number' && task.openIssueCount > 0;
  const isStandardMainTask = !task.parentId && task.taskType !== 'collection';
  const isCollectionTask = task.taskType === 'collection';
  
  const showReminder = task.taskType === 'collection' && task.status !== 'Completed' && daysRemaining !== null && task.reminderDays && daysRemaining >= 0 && daysRemaining <= task.reminderDays;
  
  const reminderText = () => {
    if (!showReminder || daysRemaining === null) return '';
    if (daysRemaining <= 0) return t('taskCard.reminderDueToday');
    const key = daysRemaining === 1 ? 'taskCard.reminderDayLeft' : 'taskCard.reminderDaysLeft';
    const daysStr = daysRemaining.toString();
    const translatedDays = locale === 'hi' ? replaceDevanagariNumerals(daysStr) : daysStr;
    return t(key, { count: translatedDays });
  };

  const openIssuesText = () => {
    if (!hasOpenIssues) return '';
    const key = task.openIssueCount === 1 ? 'taskCard.openIssue' : 'taskCard.openIssues';
    return t(key, { count: task.openIssueCount!.toString() });
  };
  
  const formattedDueDate = task.dueDate ? format(task.dueDate, 'PP', { locale: dateLocale }) : '';
  const displayDueDate = locale === 'hi' ? replaceDevanagariNumerals(formattedDueDate) : formattedDueDate;

  return (
    <div className="flex flex-col space-y-2">
      <div className="flex justify-between items-start gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
             {!isSubTask && <Icon className="h-5 w-5 text-primary shrink-0" />}
             <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate" title={task.name}>{task.name}</p>
                {!isSubTask && <p className="text-xs text-muted-foreground">{label}</p>}
             </div>
          </div>
          <div className="text-right flex-shrink-0">
              <p className="text-sm font-medium text-foreground">{displayDueDate}</p>
              <p className="text-xs text-muted-foreground">{t('projectedTimeline.dueDate')}</p>
          </div>
      </div>
      
      {isStandardMainTask && task.progress !== undefined && (
        <div className="pt-1">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{t('projectedTimeline.progress')}</span>
            <span>{Math.round(task.progress)}%</span>
          </div>
          <Progress value={task.progress} className="h-1.5 w-full" />
        </div>
      )}

      {canViewFinancials && isCollectionTask && task.cost && task.cost > 0 && (
         <div className="flex items-baseline gap-2 text-sm text-foreground pt-1">
            <span className="font-semibold text-green-700 dark:text-green-500">{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0 }).format(task.cost)}</span>
            <span className="text-xs text-muted-foreground">({numberToWordsInr(task.cost, locale)})</span>
         </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
          {canViewFinancials && showReminder && (
              <Badge variant="destructive" className="animate-pulse">
                  {reminderText()}
              </Badge>
          )}
          {hasOpenIssues && (
              <Badge variant="outline" className="border-amber-500 text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {openIssuesText()}
              </Badge>
          )}
          <Badge variant="secondary" className={`${getStatusColor(task.status)} text-primary-foreground`}>
            {t(`status.${task.status.toLowerCase().replace(/ /g, '')}`)}
          </Badge>
      </div>
    </div>
  );
}

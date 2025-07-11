
"use client";

import { useEffect, useState } from 'react';
import type { Task } from '@/types';
import { getAllProjectTasks } from '@/services/taskService';
import { getOpenIssuesForTaskIds } from '@/services/issueService';
import { Loader2, GanttChartSquare, Layers, ListChecks } from 'lucide-react';
import { ProjectedTimelineItem } from './ProjectedTimelineItem';
import { useAuth } from '@/hooks/useAuth';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useTranslation } from '@/hooks/useTranslation';

interface MainTaskWithSubTasks extends Task {
    subTasks: Task[];
}

interface ProjectedTimelineProps {
    projectId: string;
}

export function ProjectedTimeline({ projectId }: ProjectedTimelineProps) {
  const [mainTasks, setMainTasks] = useState<MainTaskWithSubTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const fetchAndGroupTasks = async () => {
      if (!projectId || !user) return;
      try {
        setLoading(true);
        // Pass user role and UID to ensure queries are correctly scoped
        let allTasks = await getAllProjectTasks(projectId, user.role, user.uid);

        const openIssues = await getOpenIssuesForTaskIds(allTasks.map(t => t.id));
        const issuesByTaskId = openIssues.reduce((acc, issue) => {
            acc[issue.taskId] = (acc[issue.taskId] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        allTasks.forEach(task => {
            task.openIssueCount = issuesByTaskId[task.id] || 0;
        });

        const subTasksByParentId = allTasks
          .filter(t => !!t.parentId)
          .reduce((acc, subTask) => {
            const parentId = subTask.parentId!;
            if (!acc[parentId]) acc[parentId] = [];
            acc[parentId].push(subTask);
            return acc;
          }, {} as Record<string, Task[]>);

        const projectMainTasks = allTasks
          .filter(t => !t.parentId)
          .map(mainTask => {
            const relatedSubTasks = subTasksByParentId[mainTask.id] || [];
            
            if (mainTask.taskType !== 'collection') {
                if (relatedSubTasks.length > 0) {
                    const completedSubTasks = relatedSubTasks.filter(st => st.status === 'Completed').length;
                    mainTask.progress = Math.round((completedSubTasks / relatedSubTasks.length) * 100);
                    if (mainTask.progress === 100) mainTask.status = 'Completed';
                    else if (mainTask.progress > 0 || relatedSubTasks.some(st => st.status === 'In Progress')) mainTask.status = 'In Progress';
                    else mainTask.status = 'To Do';
                } else {
                    mainTask.progress = 0;
                    mainTask.status = 'To Do';
                }
            }

            return {
              ...mainTask,
              subTasks: relatedSubTasks.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)),
            };
          })
          .filter(task => task.dueDate)
          .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));

        setMainTasks(projectMainTasks);
        setError(null);
      } catch (err: any) {
        setError('Failed to load projected timeline data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAndGroupTasks();
  }, [projectId, user]);

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

  if (mainTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <GanttChartSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">{t('projectedTimeline.noTasksTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('projectedTimeline.noTasksDesc')}
        </p>
      </div>
    );
  }

  return (
    <Accordion type="multiple" className="w-full space-y-2">
      {mainTasks.map(mainTask => {
        const hasSubTasks = mainTask.subTasks && mainTask.subTasks.length > 0;
        
        if (hasSubTasks) {
          return (
            <AccordionItem key={mainTask.id} value={mainTask.id} className="border bg-card rounded-lg shadow-sm">
              <AccordionTrigger className="p-4 hover:no-underline [&[data-state=open]>svg]:rotate-90">
                <div className="flex-1">
                    <ProjectedTimelineItem task={mainTask} />
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="pl-12 pr-4 pb-4">
                    <div className="relative pl-6 border-l-2 border-border space-y-4">
                        {mainTask.subTasks.map(subTask => (
                           <div key={subTask.id} className="relative">
                               <div className="absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background border -translate-x-1/2 z-10">
                                   <ListChecks className="h-3 w-3 text-muted-foreground" />
                               </div>
                               <div className="pl-6">
                                   <ProjectedTimelineItem task={subTask} isSubTask />
                               </div>
                           </div>
                        ))}
                   </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        }

        // Render non-expandable card if no subtasks
        return (
            <div key={mainTask.id} className="border bg-card rounded-lg shadow-sm p-4">
                 <ProjectedTimelineItem task={mainTask} />
            </div>
        );
      })}
    </Accordion>
  );
}

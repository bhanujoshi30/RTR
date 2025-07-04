
"use client";

import type { Task, TaskStatus } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress'; 
import { CalendarDays, Edit2, Trash2, ListChecks, Eye, Layers, User, Users, Loader2, AlertTriangle, CheckCircle, RotateCcw, IndianRupee } from 'lucide-react';
import { formatDistanceToNow, format, differenceInCalendarDays } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { updateTaskStatus, deleteTask } from '@/services/taskService';
import { hasOpenIssues } from '@/services/issueService';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ProgressReportDialog } from '@/components/attachments/ProgressReportDialog';
import { numberToWordsInr, replaceDevanagariNumerals } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface TaskCardProps {
  task: Task;
  onTaskUpdated: () => void;
  isMainTaskView?: boolean;
  isSubTaskView?: boolean;
}

const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Completed'];

export function TaskCard({ task: initialTask, onTaskUpdated, isMainTaskView = false, isSubTaskView = false }: TaskCardProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;
  const [task, setTask] = useState<Task>(initialTask);
  const [showProofDialog, setShowProofDialog] = useState(false);
  const { user } = useAuth();
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isStatusChanging, setIsStatusChanging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (initialTask.taskType === 'collection' && initialTask.dueDate) {
        const remaining = differenceInCalendarDays(initialTask.dueDate, new Date());
        setDaysRemaining(remaining);
    }
  }, [initialTask.dueDate, initialTask.taskType]);


  const isActuallyMainTask = !task.parentId;
  const isCollectionTask = isActuallyMainTask && task.taskType === 'collection';
  
  const { role: userRole } = useAuth().user || {};
  const isOwner = user && task?.ownerUid === user.uid;
  const isAdmin = userRole === 'admin';
  const canFullyEditOrDeleteThisTask = isOwner || isAdmin;

  const isAssignedToThisSubTask = !isActuallyMainTask && (task.assignedToUids?.includes(user?.uid || '') ?? false);
  const isOwnerOfThisTask = user && task.ownerUid === user.uid;
  const canChangeSubTaskStatus = user && (isOwnerOfThisTask || isAssignedToThisSubTask || isAdmin);
  const canViewFinancials = user?.role === 'client' || user?.role === 'admin';


  useEffect(() => {
    setTask(initialTask); 
  }, [initialTask]);

  const handleProofSuccess = async () => {
    setShowProofDialog(false);
    if (!user) return;
    try {
      await updateTaskStatus(task.id, user.uid, 'Completed', user.role);
      toast({ title: t('taskCard.taskCompleted'), description: t('taskCard.taskMarkedComplete').replace('{name}', `"${task.name}"`) });
      onTaskUpdated();
    } catch (error: any) {
      toast({ title: t('common.updateFailed'), description: error.message || t('common.couldNotUpdateStatus'), variant: 'destructive' });
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (isActuallyMainTask || !user) {
      toast({ title: 'Info', description: t('taskCard.mainTaskStatusInfo')});
      return;
    }
    if (!canChangeSubTaskStatus) {
      toast({ title: t('common.permissionDenied'), description: t('taskCard.cannotChangeStatus'), variant: 'destructive'});
      return;
    }

    if (newStatus === 'Completed') {
      try {
        const openIssuesExist = await hasOpenIssues(task.id);
        if (openIssuesExist) {
          toast({
            title: t('taskCard.cannotComplete'),
            description: t('taskCard.openIssuesExist'),
            variant: 'destructive',
          });
          onTaskUpdated(); // Refreshes the select to its original value
          return;
        }
        setShowProofDialog(true);
      } catch (error: any) {
         toast({ title: t('common.error'), description: t('taskCard.couldNotVerifyIssues').replace('{error}', (error as Error).message), variant: 'destructive' });
      }
    } else {
      try {
        await updateTaskStatus(task.id, user.uid, newStatus, user.role);
        toast({ title: t('common.taskUpdated'), description: t('taskCard.statusChanged').replace('{name}', `"${task.name}"`).replace('{status}', t(`status.${newStatus.toLowerCase().replace(/ /g, '')}`)) });
        onTaskUpdated(); 
      } catch (error: any) {
        toast({ title: t('common.updateFailed'), description: error.message || t('common.couldNotUpdateStatus'), variant: 'destructive' });
      }
    }
  };
  
  const handleCollectionStatusChange = async (newStatus: TaskStatus) => {
    if (!user || !isOwnerOfThisTask || !isCollectionTask) return;
    setIsStatusChanging(true);
    try {
      await updateTaskStatus(task.id, user.uid, newStatus, user.role);
      toast({ title: t('common.taskUpdated'), description: t('taskCard.statusChanged').replace('{name}', `"${task.name}"`).replace('{status}', t(`status.${newStatus.toLowerCase().replace(/ /g, '')}`)) });
      onTaskUpdated();
    } catch (error: any) {
      toast({ title: t('common.updateFailed'), description: error.message || t('common.couldNotUpdateStatus'), variant: 'destructive' });
    } finally {
        setIsStatusChanging(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!user || !task.id || !canFullyEditOrDeleteThisTask) {
         toast({ title: t('common.permissionDenied'), description: t('taskCard.cannotDeleteTask'), variant: 'destructive'});
        return;
    }
    setIsDeleting(true);
    try {
      await deleteTask(task.id, user.uid);
      toast({ title: t('common.taskDeleted'), description: t('common.taskDeletedSuccess').replace('{name}', `"${task.name}"`) });
      onTaskUpdated();
    } catch (error: any) {
      toast({
        title: t('common.deletionFailed'),
        description: error.message || t('common.couldNotDeleteTask'),
        variant: 'destructive',
      });
    } finally {
        setIsDeleting(false);
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'To Do': return 'bg-amber-500 hover:bg-amber-500';
      case 'In Progress': return 'bg-sky-500 hover:bg-sky-500';
      case 'Completed': return 'bg-emerald-500 hover:bg-emerald-500';
      default: return 'bg-primary';
    }
  };

  const handleViewTask = () => {
    if (isActuallyMainTask) {
      setIsNavigating(true);
    }
    router.push(`/projects/${task.projectId}/tasks/${task.id}`);
  };

  const handleEditTask = () => {
    if (!isOwnerOfThisTask) {
         toast({ title: t('common.permissionDenied'), description: t('taskCard.cannotEditTask'), variant: 'destructive'});
        return;
    }
    router.push(`/projects/${task.projectId}/tasks/${task.id}/edit`);
  };

  const RupeeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg>;
  const cardIcon = isCollectionTask ? <RupeeIcon /> : (isActuallyMainTask ? <Layers className="h-6 w-6 text-primary" /> : <ListChecks className="h-6 w-6 text-primary" />);
  const showEditButton = isOwnerOfThisTask || isAdmin;
  const displayAssignedNames = task.assignedToNames && task.assignedToNames.length > 0 
    ? task.assignedToNames.join(', ') 
    : 'N/A';

  const hasOpenIssuesForCard = typeof task.openIssueCount === 'number' && task.openIssueCount > 0;
  
  const reminderText = () => {
    if (!showReminder || daysRemaining === null) return '';
    if (daysRemaining <= 0) return t('taskCard.reminderDueToday');
    const key = daysRemaining === 1 ? 'taskCard.reminderDayLeft' : 'taskCard.reminderDaysLeft';
    const daysStr = daysRemaining.toString();
    const translatedDays = locale === 'hi' ? replaceDevanagariNumerals(daysStr) : daysStr;
    return t(key, { count: translatedDays });
  };

  const openIssuesText = () => {
    if (!hasOpenIssuesForCard) return '';
    const key = task.openIssueCount === 1 ? 'taskCard.openIssue' : 'taskCard.openIssues';
    return t(key, { count: task.openIssueCount!.toString() });
  };

  const showReminder = task.taskType === 'collection' && task.status !== 'Completed' && daysRemaining !== null && task.reminderDays && daysRemaining >= 0 && daysRemaining <= task.reminderDays;
  
  const createdAtText = task.createdAt ? formatDistanceToNow(task.createdAt, { addSuffix: true, locale: dateLocale }) : 'N/A';
  const dueDateText = task.dueDate ? format(task.dueDate, 'PP', { locale: dateLocale }) : '';

  return (
    <>
      {user && (
        <ProgressReportDialog
          open={showProofDialog}
          onOpenChange={setShowProofDialog}
          taskId={task.id}
          projectId={task.projectId}
          reportType="completion-proof"
          onSuccess={handleProofSuccess}
        />
      )}
      <Card className="shadow-md transition-shadow hover:shadow-lg relative">
        {isNavigating && (
          <div className="absolute inset-0 bg-card/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}
        <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={handleViewTask}>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {cardIcon}
              <CardTitle className="font-headline text-lg">{task.name}</CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {task.isOverdue && (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {t('issueCard.overdue')}
                </Badge>
              )}
              {canViewFinancials && showReminder && (
                <Badge variant="destructive" className="animate-pulse">
                    {reminderText()}
                </Badge>
              )}
              {hasOpenIssuesForCard && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {openIssuesText()}
                </Badge>
              )}
              {task.status && (isActuallyMainTask || isSubTaskView) && (
                <Badge variant="secondary" className={`${getStatusColor(task.status)} text-primary-foreground`}>
                  {t(`status.${task.status.toLowerCase().replace(/ /g, '')}`)}
                </Badge>
              )}
              {isActuallyMainTask && !isCollectionTask && task.displaySubTaskCountLabel && (
                <Badge variant="outline">{task.displaySubTaskCountLabel}</Badge>
              )}
              {isCollectionTask && <Badge variant="secondary">{t('taskDetails.collectionTaskType')}</Badge>}
            </div>
          </div>
          {(!isActuallyMainTask && task.description) && (
            <CardDescription className="pt-1 line-clamp-2">{task.description}</CardDescription>
          )}
          {canViewFinancials && isCollectionTask && task.cost && task.cost > 0 && (
            <div className="flex items-baseline gap-2 text-sm text-foreground pt-1">
                <IndianRupee className="h-4 w-4 text-green-600 self-center" />
                <span className="font-semibold text-green-700 dark:text-green-500">{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0 }).format(task.cost)}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pt-2 pb-4">
          <div className="flex flex-col gap-y-2">
            <div className="flex items-center text-xs text-muted-foreground">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              {t('common.created')} {locale === 'hi' ? replaceDevanagariNumerals(createdAtText) : createdAtText}
              {task.dueDate && (
                <span className="ml-2 border-l pl-2">
                  {t('common.due')}: {locale === 'hi' ? replaceDevanagariNumerals(dueDateText) : dueDateText}
                </span>
              )}
            </div>
            {!isActuallyMainTask && task.assignedToNames && task.assignedToNames.length > 0 && (
              <div className="flex items-center text-xs text-muted-foreground">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                {t('common.assignedTo')} {displayAssignedNames}
              </div>
            )}
          </div>

          {isActuallyMainTask && !isCollectionTask && task.progress !== undefined && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{t('taskCard.mainTaskProgress')}</span>
                <span>{Math.round(task.progress)}%</span>
              </div>
              <Progress value={task.progress} className="h-2 w-full" aria-label={`Main task progress: ${Math.round(task.progress)}%`} />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
              {isCollectionTask && isOwnerOfThisTask && task.status !== 'Completed' && (
                <Button size="sm" variant="outline" onClick={() => handleCollectionStatusChange('Completed')} disabled={isStatusChanging}>
                    {isStatusChanging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} {t('taskCard.markComplete')}
                </Button>
              )}
              {isCollectionTask && isOwnerOfThisTask && task.status === 'Completed' && (
                <Button size="sm" variant="outline" onClick={() => handleCollectionStatusChange('To Do')} disabled={isStatusChanging}>
                    {isStatusChanging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />} {t('taskCard.reopenTask')}
                </Button>
              )}
              {!isActuallyMainTask && (
                <Select
                  value={task.status}
                  onValueChange={handleStatusChange}
                  disabled={!user || !canChangeSubTaskStatus}
                >
                  <SelectTrigger className="w-full h-9 text-xs sm:w-[150px]">
                    <SelectValue placeholder={t('common.changeStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    {taskStatuses.map(status => (
                      <SelectItem key={status} value={status} className="text-xs">
                        {t(`status.${status.toLowerCase().replace(/ /g, '')}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" size="icon" className="h-9 w-9" title={t('common.viewDetails')} onClick={handleViewTask}>
                  <Eye className="h-4 w-4" />
                  <span className="sr-only">{t('common.viewDetails')}</span>
              </Button>
              {showEditButton && (
               <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  title={t('common.edit')}
                  onClick={handleEditTask}
                >
                  <Edit2 className="h-4 w-4" />
                   <span className="sr-only">{t('common.edit')}</span>
              </Button>
              )}
              {canFullyEditOrDeleteThisTask && (
               <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 hover:bg-destructive hover:text-destructive-foreground" title={isActuallyMainTask ? t('taskDetails.deleteMainTaskDesc') : t('taskDetails.deleteSubTaskDesc')} disabled={!user}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">{t('common.delete')}</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('taskDetails.deleteTaskTitle').replace('{name}', task.name)}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {isActuallyMainTask
                          ? t('taskDetails.deleteMainTaskDesc')
                          : t('taskDetails.deleteSubTaskDesc')
                        }
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('taskDetails.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('taskDetails.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
        </CardContent>
      </Card>
    </>
  );
}

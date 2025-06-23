
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTaskById, deleteTask, updateTaskStatus } from '@/services/taskService';
import type { Task, User as AppUser, UserRole, TaskStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueList } from '@/components/issues/IssueList';
import { SubTaskList } from '@/components/tasks/SubTaskList';
import { TaskForm } from '@/components/tasks/TaskForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogTaskTitle, AlertDialogDescription as AlertDialogTaskDescription, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, ArrowLeft, CalendarDays, Info, ListChecks, Paperclip, Clock, Edit, PlusCircle, Layers, Trash2, Users, Camera, CheckCircle, RotateCcw, IndianRupee } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { ProgressReportDialog } from '@/components/attachments/ProgressReportDialog';
import { AttachmentList } from '@/components/attachments/AttachmentList';
import { Timeline } from '@/components/timeline/Timeline';
import { MainTaskTimeline } from '@/components/timeline/MainTaskTimeline';
import { numberToWordsInr } from '@/lib/currencyUtils';
import { useTranslation } from '@/hooks/useTranslation';
import { getAllUsers } from '@/services/userService';


export default function TaskDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.projectId as string;
  const taskId = params.taskId as string; 

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;
  
  const [showEditTaskDialog, setShowEditTaskDialog] = useState(false);
  const [showAddSubTaskDialog, setShowAddSubTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined | null>(null); 
  
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("details");
  const [showDailyReportDialog, setShowDailyReportDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isStatusChanging, setIsStatusChanging] = useState(false);
  
  const [isPreparingSubTask, setIsPreparingSubTask] = useState(false);
  const [preloadedUsers, setPreloadedUsers] = useState<AppUser[] | null>(null);


  const isSupervisor = user?.role === 'supervisor';
  const isMainTask = task && !task.parentId;
  const isCollectionTask = isMainTask && task?.taskType === 'collection';
  const isSubTask = task && !!task.parentId;
  
  const isOwner = user && task?.ownerUid === user.uid;
  
  const canEditCurrentTask = isOwner;
  const canDeleteCurrentTask = isOwner; 
  const canAddSubTask = isOwner && isMainTask && !isCollectionTask;
  const canChangeCollectionStatus = isOwner && isCollectionTask;
  const canViewFinancials = user?.role === 'client' || user?.role === 'admin';


  const fetchTaskDetails = async () => {
    if (authLoading || !user || !taskId) return;
    try {
      setLoading(true);
      setError(null);
      setOwnerDisplayName(null);

      const fetchedTask = await getTaskById(taskId, user.uid, user.role as UserRole);
      if (fetchedTask && fetchedTask.projectId === projectId) {
        setTask(fetchedTask);
        if (fetchedTask.ownerName) {
          setOwnerDisplayName(fetchedTask.ownerName);
        } else if (fetchedTask.ownerUid) {
          setOwnerDisplayName(`User ID: ${fetchedTask.ownerUid}`);
          console.warn(`Task ${fetchedTask.id} is missing ownerName. Displaying UID as fallback.`);
        }
      } else {
        setError(`Task not found (ID: ${taskId}) or it does not belong to this project.`);
      }
    } catch (err: any) {
      console.error(`TaskDetailsPage: Error fetching task details for task ${taskId}:`, err);
      let errorMessage = `Failed to load task details for ${taskId}. ${err.message || 'Unknown error'}`;
       if (err.message?.includes('permission') || err.message?.includes('Access denied')) {
        errorMessage = `Failed to load task: ${err.message}. This is likely an issue with your Firestore security rules.`;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if(user && !authLoading){
      fetchTaskDetails();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, projectId, user, authLoading]);

  const handleAddSubTaskClick = async () => {
    if (!user) return;
    setIsPreparingSubTask(true);
    try {
      const allUsers = await getAllUsers(user.uid);
      const assignable = allUsers.filter(u => u.role === 'supervisor' || u.role === 'member');
      setPreloadedUsers(assignable);
      setShowAddSubTaskDialog(true);
    } catch (error) {
      toast({ title: "Error", description: "Could not prepare the sub-task form.", variant: "destructive" });
    } finally {
      setIsPreparingSubTask(false);
    }
  };

  const handleTaskFormSuccess = () => {
    setShowAddSubTaskDialog(false);
    setShowEditTaskDialog(false);
    setEditingTask(null);
    fetchTaskDetails();
    router.refresh();
  };

  const handleReportSuccess = () => {
    setShowDailyReportDialog(false);
    // Optionally refresh the attachments list if it's visible
    // For now, closing the dialog is enough. The list will refresh on tab switch.
  };

  const handleDeleteCurrentTask = async () => {
    if (!task || !user || !canDeleteCurrentTask) {
        toast({ title: 'Permission Denied', description: 'You do not have permission to delete this task.', variant: 'destructive' });
        return;
    }
    setIsDeleting(true);
    try {
      await deleteTask(task.id, user.uid);
      toast({ title: 'Task Deleted', description: `"${task.name}" has been deleted.` });
      if (task.parentId) {
        router.push(`/projects/${projectId}/tasks/${task.parentId}`);
      } else {
        router.push(`/projects/${projectId}`);
      }
      router.refresh();
    } catch (error: any) {
      toast({
        title: 'Deletion Failed',
        description: error.message || 'Could not delete the task.',
        variant: 'destructive',
      });
    } finally {
        setIsDeleting(false);
    }
  };

  const handleCollectionStatusChange = async (newStatus: TaskStatus) => {
    if (!task || !user || !canChangeCollectionStatus) return;
    setIsStatusChanging(true);
    try {
      await updateTaskStatus(task.id, user.uid, newStatus, user.role);
      toast({ title: 'Task Updated', description: `"${task.name}" has been marked as ${newStatus}.` });
      fetchTaskDetails(); // Refetch to update UI
    } catch (error: any) {
      toast({
        title: 'Update Failed',
        description: error.message || 'Could not update the task status.',
        variant: 'destructive',
      });
    } finally {
        setIsStatusChanging(false);
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'To Do': return 'bg-amber-500 hover:bg-amber-500';
      case 'In Progress': return 'bg-sky-500 hover:bg-sky-500';
      case 'Completed': return 'bg-emerald-500 hover:bg-emerald-500';
      default: return 'bg-primary';
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  if (!task) {
    return <p className="text-center text-muted-foreground py-10">Task details could not be loaded.</p>;
  }

  const backButtonPath = isSubTask ? `/projects/${projectId}/tasks/${task.parentId}` : `/projects/${projectId}`;
  const backButtonText = isSubTask ? t('taskDetails.backToMainTask') : t('taskDetails.backToProject');
  const displayAssignedNames = task.assignedToNames && task.assignedToNames.length > 0 
    ? task.assignedToNames.join(', ') 
    : 'N/A';

  const canSubmitProgress = user && (isOwner || task.assignedToUids?.includes(user.uid));


  return (
    <>
      {user && isSubTask && (
         <ProgressReportDialog
            open={showDailyReportDialog}
            onOpenChange={setShowDailyReportDialog}
            taskId={taskId}
            projectId={projectId}
            reportType="daily-progress"
            onSuccess={handleReportSuccess}
        />
      )}
      <div className="space-y-8">
        <Button variant="outline" onClick={() => router.push(backButtonPath)} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> {backButtonText}
        </Button>

        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                  {isCollectionTask ? <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-primary"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg> : (isMainTask ? <Layers className="h-7 w-7 text-primary" /> : <ListChecks className="h-7 w-7 text-primary" />)}
                  <CardTitle className="font-headline text-3xl tracking-tight">{task.name}</CardTitle>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {task.status && (isSubTask || isCollectionTask) && (
                  <Badge variant="secondary" className={`${getStatusColor(task.status)} text-primary-foreground text-base px-3 py-1`}>
                    {t(`status.${task.status.toLowerCase().replace(/ /g, '')}`)}
                  </Badge>
                )}
                 {isCollectionTask && <Badge variant="secondary">{t('taskDetails.collectionTaskType')}</Badge>}
                {isSubTask && canSubmitProgress && (
                    <Button variant="outline" size="sm" onClick={() => setShowDailyReportDialog(true)}>
                        <Camera className="mr-2 h-4 w-4" /> {t('taskDetails.dailyProgress')}
                    </Button>
                )}
                {isCollectionTask && canChangeCollectionStatus && task.status !== 'Completed' && (
                  <Button variant="outline" size="sm" onClick={() => handleCollectionStatusChange('Completed')} disabled={isStatusChanging}>
                      {isStatusChanging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} {t('taskCard.markComplete')}
                  </Button>
                )}
                {isCollectionTask && canChangeCollectionStatus && task.status === 'Completed' && (
                  <Button variant="outline" size="sm" onClick={() => handleCollectionStatusChange('To Do')} disabled={isStatusChanging}>
                      {isStatusChanging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />} {t('taskCard.reopenTask')}
                  </Button>
                )}
                {canEditCurrentTask && (
                  <Dialog open={showEditTaskDialog} onOpenChange={setShowEditTaskDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => { setEditingTask(task); setShowEditTaskDialog(true); }}>
                        <Edit className="mr-2 h-4 w-4" /> {isSubTask ? t('taskDetails.editSubTask') : t('taskDetails.editMainTask')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl">
                      <DialogHeader>
                        <DialogTitle className="font-headline text-xl">
                          {isSubTask ? t('taskDetails.editSubTask') : t('taskDetails.editMainTask')}
                        </DialogTitle>
                        <DialogDescription>
                            {isSubTask ? t('taskDetails.modifySubTask') : t('taskDetails.modifyMainTask')}
                        </DialogDescription>
                      </DialogHeader>
                      {editingTask && user && isOwner && (
                          <TaskForm projectId={projectId} task={editingTask} parentId={editingTask.parentId} onFormSuccess={handleTaskFormSuccess} />
                      )}
                      {editingTask && user && !isOwner && (
                          <p className="p-4 text-sm text-muted-foreground">Only the task owner can edit these details. Supervisors assigned to sub-tasks can update status, description, and due date via other mechanisms if available.</p>
                      )}
                    </DialogContent>
                  </Dialog>
                )}
                {canDeleteCurrentTask && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4"/>{t('common.delete')}</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTaskTitle>{t('taskDetails.deleteTaskTitle', { name: task.name })}</AlertDialogTaskTitle>
                        <AlertDialogTaskDescription>
                          {isSubTask ? t('taskDetails.deleteSubTaskDesc') : t('taskDetails.deleteMainTaskDesc')}
                        </AlertDialogTaskDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('taskDetails.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteCurrentTask} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
                           {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t('common.delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
            {isSubTask && task.description && (
              <CardDescription className="mt-2 text-lg">{task.description}</CardDescription>
            )}
             {isMainTask && !isCollectionTask && (
               <CardDescription className="mt-2 text-lg">{t('taskDetails.subTaskDesc')} {isSupervisor && t('taskDetails.subTaskDescSupervisor')}</CardDescription>
             )}
             {isCollectionTask && (
                 <CardDescription className="mt-2 text-lg">{t('taskDetails.collectionTaskDesc')} {task.description}</CardDescription>
             )}
            {canViewFinancials && isCollectionTask && task.cost && task.cost > 0 && (
                <div className="pt-4">
                    <div className="flex items-center text-base">
                        <IndianRupee className="mr-2 h-4 w-4 text-green-600" />
                        <span className="text-muted-foreground">{t('taskDetails.collectionAmount')}&nbsp;</span>
                        <span className="font-semibold text-foreground">{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0 }).format(task.cost)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">{numberToWordsInr(task.cost, locale)}</p>
                </div>
            )}
          </CardHeader>
          <CardContent>
              {isSubTask && (
                   <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div>
                          <p className="text-sm font-medium text-muted-foreground">{t('common.createdAt')}</p>
                          <div className="flex items-center text-base">
                              <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                              {task.createdAt ? format(task.createdAt, 'PPP p', { locale: dateLocale }) : 'N/A'}
                          </div>
                      </div>
                      {task.dueDate && (
                          <div>
                              <p className="text-sm font-medium text-muted-foreground">{t('common.dueDate')}</p>
                              <div className="flex items-center text-base">
                                  <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                                  {format(task.dueDate, 'PPP', { locale: dateLocale })}
                              </div>
                          </div>
                      )}
                  </div>
              )}
               {isMainTask && (
                   <div className="flex items-center text-sm text-muted-foreground">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {t('taskDetails.createdLabel')} {task.createdAt ? format(task.createdAt, 'PPP p', { locale: dateLocale }) : 'N/A'}
                      {task.dueDate && <span className="ml-2 border-l pl-2">{t('taskDetails.dueByLabel')} {format(task.dueDate, 'PPP', { locale: dateLocale })}</span>}
                   </div>
               )}
          </CardContent>
        </Card>

        {isMainTask && !isCollectionTask && task.ownerUid && (
          <Tabs defaultValue="subtasks" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="subtasks"><ListChecks className="mr-2 h-4 w-4" /> {t('projectDetails.subTasks')}</TabsTrigger>
              <TabsTrigger value="timeline"><Clock className="mr-2 h-4 w-4" /> {t('taskDetails.mainTaskTimelineTitle')}</TabsTrigger>
            </TabsList>
            <TabsContent value="subtasks" className="mt-6">
              <div className="space-y-6">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center rounded-lg border bg-card p-6 shadow-sm">
                  <h2 className="font-headline text-2xl font-semibold flex items-center">
                    <ListChecks className="mr-3 h-7 w-7 text-primary" />
                    {t('projectDetails.subTasks')}
                  </h2>
                  {canAddSubTask && (
                    <>
                      <Button onClick={handleAddSubTaskClick} disabled={isPreparingSubTask}>
                        {isPreparingSubTask ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PlusCircle className="mr-2 h-4 w-4" />
                        )}
                        {t('taskForm.addSubTaskBtn')}
                      </Button>
                      <Dialog open={showAddSubTaskDialog} onOpenChange={setShowAddSubTaskDialog}>
                        <DialogContent className="sm:max-w-xl">
                            <DialogHeader>
                                <DialogTitle className="font-headline text-xl">{t('taskForm.addSubTask')}</DialogTitle>
                                <DialogDescription>{t('taskForm.subTaskDescPlaceholder')}</DialogDescription>
                            </DialogHeader>
                            {user && preloadedUsers && (
                                <TaskForm
                                    projectId={projectId}
                                    parentId={taskId}
                                    onFormSuccess={() => {
                                        setShowAddSubTaskDialog(false);
                                        handleTaskFormSuccess();
                                    }}
                                    preloadedAssignableUsers={preloadedUsers}
                                />
                            )}
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                </div>
                {user && task && task.ownerUid && <SubTaskList mainTaskId={taskId} projectId={projectId} mainTaskOwnerUid={task.ownerUid} />}
              </div>
            </TabsContent>
            <TabsContent value="timeline" className="mt-6">
               <Card>
                  <CardHeader>
                      <CardTitle className="flex items-center"><Clock className="mr-2 h-5 w-5" /> {t('taskDetails.mainTaskTimelineTitle')}</CardTitle>
                      <CardDescription>{t('taskDetails.mainTaskTimelineDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <MainTaskTimeline mainTaskId={taskId} />
                  </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {isSubTask && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 sm:w-auto sm:inline-flex">
              <TabsTrigger value="details" className="text-sm"><Info className="mr-2 h-4 w-4" /> {t('taskDetails.tabs.details')}</TabsTrigger>
              <TabsTrigger value="issues" className="text-sm"><ListChecks className="mr-2 h-4 w-4" /> {t('taskDetails.tabs.issues')}</TabsTrigger>
              <TabsTrigger value="attachments" className="text-sm"><Paperclip className="mr-2 h-4 w-4" /> {t('taskDetails.tabs.attachments')}</TabsTrigger>
              <TabsTrigger value="timeline" className="text-sm"><Clock className="mr-2 h-4 w-4" /> {t('taskDetails.tabs.timeline')}</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-6">
              <Card>
                <CardHeader><CardTitle>{t('taskDetails.infoTitle')}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><h4 className="font-semibold">{t('taskDetails.infoName')}</h4><p>{task.name}</p></div>
                  {task.description && (<div><h4 className="font-semibold">{t('taskDetails.infoDesc')}</h4><p className="whitespace-pre-wrap">{task.description}</p></div>)}
                  <div><h4 className="font-semibold">{t('taskDetails.infoStatus')}</h4><p>{t(`status.${task.status.toLowerCase().replace(/ /g, '')}`)}</p></div>
                  {task.assignedToNames && task.assignedToNames.length > 0 && (
                    <div>
                      <h4 className="font-semibold">{t('taskDetails.infoAssignedTo')}</h4>
                      <p>{displayAssignedNames}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="font-semibold">{t('taskDetails.infoCreatedBy')}</h4>
                    <p>{ownerDisplayName || task.ownerUid}</p>
                  </div>
                  <div><h4 className="font-semibold">{t('common.createdAt')}</h4><p>{task.createdAt ? format(task.createdAt, 'PPP p', { locale: dateLocale }) : 'N/A'}</p></div>
                  {task.dueDate && (<div><h4 className="font-semibold">{t('common.dueDate')}</h4><p>{format(task.dueDate, 'PPP', { locale: dateLocale })}</p></div>)}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="issues" className="mt-6">
              {user && <IssueList projectId={projectId} taskId={taskId} onIssueListChange={fetchTaskDetails} />}
            </TabsContent>
            <TabsContent value="attachments" className="mt-6">
                <Card>
                    <CardHeader><CardTitle>{t('taskDetails.tabs.attachments')}</CardTitle></CardHeader>
                    <CardContent>
                        <AttachmentList taskId={taskId} projectId={projectId}/>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="timeline" className="mt-6">
              <Card>
                  <CardHeader>
                      <CardTitle>{t('taskDetails.tabs.timeline')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <Timeline taskId={taskId} />
                  </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}

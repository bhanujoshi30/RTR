
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTaskById, deleteTask } from '@/services/taskService';
import { getUserDisplayName } from '@/services/userService'; 
import type { Task, UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueList } from '@/components/issues/IssueList';
import { SubTaskList } from '@/components/tasks/SubTaskList';
import { TaskForm } from '@/components/tasks/TaskForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertDialogTaskTitle, AlertDialogDescription as AlertDialogTaskDescription, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, ArrowLeft, CalendarDays, Info, ListChecks, Paperclip, Clock, Edit, PlusCircle, Layers, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

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
  const [showAddEditTaskModal, setShowAddEditTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined | null>(null); 
  const [ownerDisplayName, setOwnerDisplayName] = useState<string | null>(null);
  const [isFetchingOwnerName, setIsFetchingOwnerName] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("details");

  const isSupervisor = user?.role === 'supervisor';
  const isMainTask = task && !task.parentId;
  const isSubTask = task && !!task.parentId;
  
  const isOwner = user && task?.ownerUid === user.uid;
  
  const canEditCurrentTask = isOwner;
  const canDeleteCurrentTask = isOwner; 
  const canAddSubTask = isOwner && isMainTask; 

  const fetchTaskDetails = async () => {
    if (authLoading || !user || !taskId) return;
    try {
      setLoading(true);
      setIsFetchingOwnerName(false);
      setOwnerDisplayName(null);

      const fetchedTask = await getTaskById(taskId, user.uid, user.role as UserRole);
      if (fetchedTask && fetchedTask.projectId === projectId) {
        setTask(fetchedTask);
        if (fetchedTask.ownerUid) {
          setIsFetchingOwnerName(true);
          getUserDisplayName(fetchedTask.ownerUid)
            .then(name => setOwnerDisplayName(name))
            .catch(err => {
              console.error("TaskDetailsPage: Failed to fetch owner display name:", err);
              setOwnerDisplayName(fetchedTask.ownerUid); 
            })
            .finally(() => setIsFetchingOwnerName(false));
        }
      } else {
        console.error(`TaskDetailsPage: Fetched task is null or projectId mismatch. Task ID: ${taskId}, Project ID from params: ${projectId}, Fetched Task Project ID: ${fetchedTask?.projectId}`);
        setError(`Task not found (ID: ${taskId}) or does not belong to this project (Project ID from task: ${fetchedTask?.projectId}, Expected: ${projectId}). Check console for more details from taskService.`);
        // router.push(`/projects/${projectId}`); 
      }
    } catch (err: any) {
      console.error(`TaskDetailsPage: Error fetching task details for task ${taskId}:`, err);
      setError(`Failed to load task details for ${taskId}. ${err.message || 'Unknown error'}. Check console for more details from taskService.`);
      // router.push(`/projects/${projectId}`); 
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

  const handleTaskFormSuccess = () => {
    setShowAddEditTaskModal(false);
    setEditingTask(null);
    fetchTaskDetails();
    router.refresh();
  };

  const handleDeleteCurrentTask = async () => {
    if (!task || !user || !canDeleteCurrentTask) {
        toast({ title: 'Permission Denied', description: 'You do not have permission to delete this task.', variant: 'destructive' });
        return;
    }
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
  const backButtonText = isSubTask ? "Back to Main Task" : "Back to Project";
  const displayAssignedNames = task.assignedToNames && task.assignedToNames.length > 0 
    ? task.assignedToNames.join(', ') 
    : 'N/A';


  return (
    <div className="space-y-8">
      <Button variant="outline" onClick={() => router.push(backButtonPath)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> {backButtonText}
      </Button>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
                {isMainTask ? <Layers className="h-7 w-7 text-primary" /> : <ListChecks className="h-7 w-7 text-primary" />}
                <CardTitle className="font-headline text-3xl tracking-tight">{task.name}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isSubTask && task.status && (
                <Badge variant="secondary" className={`${getStatusColor(task.status)} text-primary-foreground text-base px-3 py-1`}>
                  {task.status}
                </Badge>
              )}
              {canEditCurrentTask && (
                <Dialog open={showAddEditTaskModal && !!editingTask} onOpenChange={(isOpen) => { if(!isOpen) setEditingTask(null); setShowAddEditTaskModal(isOpen);}}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => { setEditingTask(task); setShowAddEditTaskModal(true); }}>
                      <Edit className="mr-2 h-4 w-4" /> Edit {isSubTask ? "Sub-task" : "Main Task"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                      <DialogTitle className="font-headline text-xl">
                        Edit {isSubTask ? "Sub-task" : "Main Task"}
                      </DialogTitle>
                      <DialogDescription>
                          {isSubTask ? "Modify the details of this sub-task." : "Update the name or details of this main task."}
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
                    <Button variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4"/>Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTaskTitle>Delete "{task.name}"?</AlertDialogTaskTitle>
                      <AlertDialogTaskDescription>
                        This action cannot be undone and will permanently delete this {isSubTask ? "sub-task and its issues." : "main task, all its sub-tasks, and their issues."}
                      </AlertDialogTaskDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteCurrentTask} className="bg-destructive hover:bg-destructive/90">
                        Delete
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
           {isMainTask && (
             <CardDescription className="mt-2 text-lg">This is a main task. Manage its sub-tasks below. {isSupervisor && "You will see sub-tasks assigned to you if applicable."}</CardDescription>
           )}
        </CardHeader>
        <CardContent>
            {isSubTask && (
                 <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Created At</p>
                        <div className="flex items-center text-base">
                            <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                            {task.createdAt ? format(task.createdAt, 'PPP p') : 'N/A'}
                        </div>
                    </div>
                    {task.dueDate && (
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                            <div className="flex items-center text-base">
                                <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                                {format(task.dueDate, 'PPP')}
                            </div>
                        </div>
                    )}
                </div>
            )}
             {isMainTask && (
                 <div className="flex items-center text-sm text-muted-foreground">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Created {task.createdAt ? format(task.createdAt, 'PPP p') : 'N/A'}
                 </div>
             )}
        </CardContent>
      </Card>

      {isMainTask && task && task.ownerUid && (
        <div className="space-y-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="font-headline text-2xl font-semibold flex items-center">
              <ListChecks className="mr-3 h-7 w-7 text-primary" />
              Sub-tasks
            </h2>
            {canAddSubTask && (
              <Dialog open={showAddEditTaskModal && !editingTask} onOpenChange={(isOpen) => { if(!isOpen) setEditingTask(null); setShowAddEditTaskModal(isOpen); }}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditingTask(null); setShowAddEditTaskModal(true); }}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New Sub-task
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle className="font-headline text-xl">Add New Sub-task</DialogTitle>
                    <DialogDescription>Fill in the details for the new sub-task.</DialogDescription>
                  </DialogHeader>
                  {user && <TaskForm projectId={projectId} parentId={taskId} onFormSuccess={handleTaskFormSuccess} />}
                </DialogContent>
              </Dialog>
            )}
          </div>
          {user && task && task.ownerUid && <SubTaskList mainTaskId={taskId} projectId={projectId} mainTaskOwnerUid={task.ownerUid} />}
        </div>
      )}

      {isSubTask && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 sm:w-auto sm:inline-flex">
            <TabsTrigger value="details" className="text-sm"><Info className="mr-2 h-4 w-4" /> Details</TabsTrigger>
            <TabsTrigger value="issues" className="text-sm"><ListChecks className="mr-2 h-4 w-4" /> Issues</TabsTrigger>
            <TabsTrigger value="timeline" className="text-sm"><Clock className="mr-2 h-4 w-4" /> Timeline</TabsTrigger>
            <TabsTrigger value="attachments" className="text-sm"><Paperclip className="mr-2 h-4 w-4" /> Attachments</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-6">
            <Card>
              <CardHeader><CardTitle>Sub-task Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><h4 className="font-semibold">Name:</h4><p>{task.name}</p></div>
                {task.description && (<div><h4 className="font-semibold">Description:</h4><p className="whitespace-pre-wrap">{task.description}</p></div>)}
                <div><h4 className="font-semibold">Status:</h4><p>{task.status}</p></div>
                {task.assignedToNames && task.assignedToNames.length > 0 && (
                  <div>
                    <h4 className="font-semibold">Assigned To:</h4>
                    <p>{displayAssignedNames}</p>
                  </div>
                )}
                <div>
                  <h4 className="font-semibold">Created By:</h4>
                  <p>{isFetchingOwnerName ? 'Loading...' : (ownerDisplayName || task.ownerUid)}</p>
                </div>
                <div><h4 className="font-semibold">Created At:</h4><p>{task.createdAt ? format(task.createdAt, 'PPP p') : 'N/A'}</p></div>
                {task.dueDate && (<div><h4 className="font-semibold">Due Date:</h4><p>{format(task.dueDate, 'PPP')}</p></div>)}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="issues" className="mt-6">
            {user && <IssueList projectId={projectId} taskId={taskId} onIssueListChange={fetchTaskDetails} />}
          </TabsContent>
          <TabsContent value="timeline" className="mt-6">
            <Card><CardHeader><CardTitle>Timeline</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Timeline for this sub-task (to be implemented).</p></CardContent></Card>
          </TabsContent>
          <TabsContent value="attachments" className="mt-6">
            <Card><CardHeader><CardTitle>Attachments</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Attachments for this sub-task (to be implemented).</p></CardContent></Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

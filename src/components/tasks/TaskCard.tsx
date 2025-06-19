
"use client";

import type { Task, TaskStatus } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Edit2, Trash2, ListChecks, Eye, Layers, User, Users } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { updateTaskStatus, deleteTask, getSubTasks, getAssignedSubTasksForUser } from '@/services/taskService';
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

interface TaskCardProps {
  task: Task;
  onTaskUpdated: () => void;
  isMainTaskView?: boolean;
  isSubTaskView?: boolean;
}

const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Completed'];

export function TaskCard({ task, onTaskUpdated, isMainTaskView = false, isSubTaskView = false }: TaskCardProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [subTaskCount, setSubTaskCount] = useState(0);
  const [subTaskCountLabel, setSubTaskCountLabel] = useState("Sub-tasks");
  const { user } = useAuth();

  const isActuallyMainTask = !task.parentId;
  const isSupervisor = user?.role === 'supervisor';

  const isOwnerOfThisTask = user && task.ownerUid === user.uid;

  // For sub-tasks, only owner can perform full edit or delete.
  // For main tasks, only owner can perform full edit or delete.
  const canFullyEditOrDeleteThisTask = isOwnerOfThisTask;

  // For sub-tasks, status can be changed by owner OR any user assigned to it.
  const isAssignedToThisSubTask = !isActuallyMainTask && (task.assignedToUids?.includes(user?.uid || '') ?? false);
  const canChangeSubTaskStatus = user && (isOwnerOfThisTask || isAssignedToThisSubTask);


  useEffect(() => {
    console.log(`[TaskCard Debug] useEffect for task '${task.name}' (ID: ${task.id}). isActuallyMainTask: ${isActuallyMainTask}, User: ${user?.uid}, Task ID: ${task.id}`);
    if (isActuallyMainTask && user && task.id) {
      const fetchCount = async () => {
        console.log(`[TaskCard Debug] fetchCount called for main task '${task.name}' (ID: ${task.id}). Supervisor: ${isSupervisor}, Owner: ${isOwnerOfThisTask}`);
        try {
          if (isSupervisor && !isOwnerOfThisTask) {
            console.log(`[TaskCard Debug] Fetching assigned sub-tasks for supervisor ${user.uid} under main task ${task.id}`);
            const assignedSubtasks = await getAssignedSubTasksForUser(task.id, user.uid);
            console.log(`[TaskCard Debug] Fetched assignedSubtasks for ${task.id}:`, assignedSubtasks);
            setSubTaskCount(assignedSubtasks.length);
            const count = assignedSubtasks.length;
            const taskWord = count === 1 ? "Sub-task" : "Sub-tasks";
            const newLabel = `${count} ${taskWord} (assigned to you)`;
            setSubTaskCountLabel(newLabel);
            console.log(`[TaskCard Debug] Set label for ${task.id} (supervisor): ${newLabel}`);
          } else { 
            console.log(`[TaskCard Debug] Fetching all sub-tasks for main task ${task.id}`);
            const allSubtasks = await getSubTasks(task.id);
            console.log(`[TaskCard Debug] Fetched allSubtasks for ${task.id}:`, allSubtasks);
            setSubTaskCount(allSubtasks.length);
            const count = allSubtasks.length;
            const taskWord = count === 1 ? "Sub-task" : "Sub-tasks";
            const newLabel = `${count} ${taskWord}`;
            setSubTaskCountLabel(newLabel);
            console.log(`[TaskCard Debug] Set label for ${task.id} (owner/other): ${newLabel}`);
          }
        } catch (error: any) {
            if (error.message && (error.message.includes("index is currently building") || error.message.includes("index is building"))) {
                console.warn(`[TaskCard Debug] Sub-task count for main task ${task.id} is unavailable because a Firestore index is still building. Displaying 0 for now. Error: ${error.message}`);
            } else {
                console.error("[TaskCard Debug] Failed to fetch sub-task count for main task:", task.id, error);
            }
            setSubTaskCount(0); 
            const errorLabel = isSupervisor && !isOwnerOfThisTask ? "0 Sub-tasks (assigned to you)" : "0 Sub-tasks";
            setSubTaskCountLabel(errorLabel);
            console.log(`[TaskCard Debug] Set label for ${task.id} (error fallback): ${errorLabel}`);
        }
      };
      fetchCount();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.name, task.ownerUid, isActuallyMainTask, user, isSupervisor]);


  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (isActuallyMainTask || !user) {
      toast({ title: 'Info', description: 'Main task status is derived and not directly set here.'});
      return;
    }
    if (!canChangeSubTaskStatus) {
      toast({ title: 'Permission Denied', description: 'You cannot change the status of this sub-task.', variant: 'destructive'});
      return;
    }
    try {
      await updateTaskStatus(task.id, user.uid, newStatus, user.role);
      toast({ title: 'Task Updated', description: `Status of "${task.name}" changed to ${newStatus}.` });
      onTaskUpdated();
    } catch (error: any) {
      toast({ title: 'Update Failed', description: error.message || 'Could not update task status.', variant: 'destructive' });
    }
  };

  const handleDeleteTask = async () => {
    if (!user || !task.id || !canFullyEditOrDeleteThisTask) {
         toast({ title: 'Permission Denied', description: 'Only the task owner can delete this task.', variant: 'destructive'});
        return;
    }
    try {
      await deleteTask(task.id, user.uid);
      toast({ title: 'Task Deleted', description: `"${task.name}" has been deleted.` });
      onTaskUpdated();
    } catch (error: any) {
      toast({
        title: 'Deletion Failed',
        description: error.message || 'Could not delete the task.',
        variant: 'destructive',
      });
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
    router.push(`/projects/${task.projectId}/tasks/${task.id}`);
  };

  const handleEditTask = () => {
    if (!isOwnerOfThisTask) {
         toast({ title: 'Permission Denied', description: 'Only the task owner can edit task details.', variant: 'destructive'});
        return;
    }
    router.push(`/projects/${task.projectId}/tasks/${task.id}/edit`);
  };

  const cardIcon = isActuallyMainTask ? <Layers className="h-6 w-6 text-primary" /> : <ListChecks className="h-6 w-6 text-primary" />;
  
  const showEditButton = isOwnerOfThisTask;
  
  const displayAssignedNames = task.assignedToNames && task.assignedToNames.length > 0 ? task.assignedToNames.join(', ') : 'N/A';

  if (isActuallyMainTask) {
    console.log(`[TaskCard Debug] Rendering main task '${task.name}', subTaskCountLabel: '${subTaskCountLabel}'`);
  }

  return (
    <Card className="shadow-md transition-shadow hover:shadow-lg">
      <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={handleViewTask}>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {cardIcon}
            <CardTitle className="font-headline text-lg">{task.name}</CardTitle>
          </div>
          {!isActuallyMainTask && task.status && (
            <Badge variant="secondary" className={`${getStatusColor(task.status)} text-primary-foreground`}>
              {task.status}
            </Badge>
          )}
          {isActuallyMainTask && (
             <Badge variant="outline">
              {subTaskCountLabel}
            </Badge>
          )}
        </div>
        {(!isActuallyMainTask && task.description) && (
          <CardDescription className="pt-1 line-clamp-2">{task.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-2 pb-4">
        <div className="flex flex-col gap-y-2">
          <div className="flex items-center text-xs text-muted-foreground">
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
            Created {task.createdAt ? formatDistanceToNow(task.createdAt, { addSuffix: true }) : 'N/A'}
            {(!isActuallyMainTask && task.dueDate) && (
              <span className="ml-2 border-l pl-2">
                Due: {format(task.dueDate, 'PP')}
              </span>
            )}
          </div>
          {!isActuallyMainTask && task.assignedToNames && task.assignedToNames.length > 0 && (
            <div className="flex items-center text-xs text-muted-foreground">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Assigned to: {displayAssignedNames}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
            {!isActuallyMainTask && (
              <Select
                value={task.status}
                onValueChange={handleStatusChange}
                disabled={!user || !canChangeSubTaskStatus}
              >
                <SelectTrigger className="w-full h-9 text-xs sm:w-[150px]">
                  <SelectValue placeholder="Change status" />
                </SelectTrigger>
                <SelectContent>
                  {taskStatuses.map(status => (
                    <SelectItem key={status} value={status} className="text-xs">
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="icon" className="h-9 w-9" title="View Details" onClick={handleViewTask}>
                <Eye className="h-4 w-4" />
                <span className="sr-only">View Details</span>
            </Button>
            {showEditButton && (
             <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                title="Edit Task"
                onClick={handleEditTask}
              >
                <Edit2 className="h-4 w-4" />
                 <span className="sr-only">Edit Task</span>
            </Button>
            )}
            {canFullyEditOrDeleteThisTask && (
             <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 hover:bg-destructive hover:text-destructive-foreground" title={isActuallyMainTask ? "Delete Main Task & Sub-tasks" : "Delete Sub-task"} disabled={!user}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{task.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {isActuallyMainTask
                        ? "This action cannot be undone. This will permanently delete this main task and all its sub-tasks and associated issues."
                        : "This action cannot be undone. This will permanently delete this sub-task and its associated issues."
                      }
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
      </CardContent>
    </Card>
  );
}

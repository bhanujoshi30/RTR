
"use client";

import type { Task, TaskStatus } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Edit2, Trash2, ListChecks, Eye, Layers } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { updateTaskStatus, deleteTask, getSubTasks } from '@/services/taskService';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
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
  const { user } = useAuth();

  const isActuallyMainTask = !task.parentId; 

  useEffect(() => {
    if (isActuallyMainTask && user) {
      const fetchCount = async () => {
        try {
          const subtasks = await getSubTasks(task.id, user.uid);
          setSubTaskCount(subtasks.length);
        } catch (error) {
          console.error("Failed to fetch sub-task count for main task:", task.id, error);
        }
      };
      fetchCount();
    }
  }, [task.id, isActuallyMainTask, user]);


  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (isActuallyMainTask || !user) { 
      toast({ title: 'Info', description: 'Main task status is derived from sub-tasks or not applicable.'});
      return;
    }
    try {
      await updateTaskStatus(task.id, user.uid, newStatus);
      toast({ title: 'Task Updated', description: `Status of "${task.name}" changed to ${newStatus}.` });
      onTaskUpdated(); 
    } catch (error) {
      toast({ title: 'Update Failed', description: 'Could not update task status.', variant: 'destructive' });
    }
  };
  
  const handleDeleteTask = async () => {
    if (!user) return;
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

  const cardIcon = isActuallyMainTask ? <Layers className="h-6 w-6 text-primary" /> : <ListChecks className="h-6 w-6 text-primary" />;

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
              {subTaskCount} Sub-task{subTaskCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {(!isActuallyMainTask && task.description) && (
          <CardDescription className="pt-1 line-clamp-2">{task.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center text-xs text-muted-foreground">
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
            Created {task.createdAt ? formatDistanceToNow(task.createdAt, { addSuffix: true }) : 'N/A'}
            {(!isActuallyMainTask && task.dueDate) && (
              <span className="ml-2 border-l pl-2">
                Due: {format(task.dueDate, 'PP')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isActuallyMainTask && (
              <Select value={task.status} onValueChange={handleStatusChange} disabled={!user}>
                <SelectTrigger className="w-full sm:w-[150px] h-9 text-xs">
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
            <Button variant="outline" size="icon" className="h-9 w-9" title="Edit Task" onClick={handleViewTask}>
                <Edit2 className="h-4 w-4" />
                 <span className="sr-only">Edit Task</span>
            </Button>
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import type { Task, TaskStatus } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Edit2, Trash2, ListChecks } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { updateTaskStatus, deleteTask } from '@/services/taskService';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
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

interface TaskCardProps {
  task: Task;
  onTaskUpdated: () => void;
}

const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Completed'];

export function TaskCard({ task, onTaskUpdated }: TaskCardProps) {
  const { toast } = useToast();

  const handleStatusChange = async (newStatus: TaskStatus) => {
    try {
      await updateTaskStatus(task.id, newStatus);
      toast({ title: 'Task Updated', description: `Status of "${task.name}" changed to ${newStatus}.` });
      onTaskUpdated(); // Notify parent to refetch tasks
    } catch (error) {
      toast({ title: 'Update Failed', description: 'Could not update task status.', variant: 'destructive' });
    }
  };
  
  const handleDeleteTask = async () => {
    try {
      await deleteTask(task.id);
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

  return (
    <Card className="shadow-md transition-shadow hover:shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" />
            <CardTitle className="font-headline text-lg">{task.name}</CardTitle>
          </div>
          <Badge variant="secondary" className={`${getStatusColor(task.status)} text-primary-foreground`}>
            {task.status}
          </Badge>
        </div>
        {task.description && (
          <CardDescription className="pt-1 line-clamp-2">{task.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center text-xs text-muted-foreground">
            <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
            Created {task.createdAt ? formatDistanceToNow(task.createdAt.toDate(), { addSuffix: true }) : 'N/A'}
            {task.dueDate && (
              <span className="ml-2 border-l pl-2">
                Due: {format(task.dueDate.toDate(), 'PP')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={task.status} onValueChange={handleStatusChange}>
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
            <Button variant="outline" size="icon" className="h-9 w-9" asChild>
              <Link href={`/projects/${task.projectId}/tasks/${task.id}/edit`}>
                <Edit2 className="h-4 w-4" />
                <span className="sr-only">Edit Task</span>
              </Link>
            </Button>
             <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 hover:bg-destructive hover:text-destructive-foreground">
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete Task</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Task "{task.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the task.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive hover:bg-destructive/90">
                      Delete Task
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

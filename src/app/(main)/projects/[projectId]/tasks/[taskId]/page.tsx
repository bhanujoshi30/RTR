
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTaskById } from '@/services/taskService';
import type { Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueList } from '@/components/issues/IssueList';
import { Loader2, ArrowLeft, CalendarDays, Info, ListChecks, Paperclip, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

export default function TaskDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const taskId = params.taskId as string;

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user || !taskId) return;

    const fetchTask = async () => {
      try {
        setLoading(true);
        const fetchedTask = await getTaskById(taskId);
        if (fetchedTask && fetchedTask.projectId === projectId) {
          setTask(fetchedTask);
        } else {
          setError('Task not found or does not belong to this project.');
        }
      } catch (err) {
        console.error('Error fetching task:', err);
        setError('Failed to load task details.');
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
  }, [taskId, projectId, user, authLoading]);

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

  return (
    <div className="space-y-8">
      <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Project
      </Button>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <CardTitle className="font-headline text-3xl tracking-tight">{task.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={`${getStatusColor(task.status)} text-primary-foreground text-base px-3 py-1`}>
                {task.status}
              </Badge>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${projectId}/tasks/${taskId}/edit`}>
                  Edit Task
                </Link>
              </Button>
            </div>
          </div>
          {task.description && (
            <CardDescription className="mt-2 text-lg">{task.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                    <p className="text-sm font-medium text-muted-foreground">Created At</p>
                    <div className="flex items-center text-base">
                        <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                        {task.createdAt ? format(task.createdAt.toDate(), 'PPP p') : 'N/A'}
                    </div>
                </div>
                {task.dueDate && (
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                        <div className="flex items-center text-base">
                            <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                            {format(task.dueDate.toDate(), 'PPP')}
                        </div>
                    </div>
                )}
            </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 sm:w-auto sm:inline-flex">
          <TabsTrigger value="details" className="text-sm">
            <Info className="mr-2 h-4 w-4" /> Details
          </TabsTrigger>
          <TabsTrigger value="issues" className="text-sm">
            <ListChecks className="mr-2 h-4 w-4" /> Issues
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-sm">
            <Clock className="mr-2 h-4 w-4" /> Timeline
          </TabsTrigger>
          <TabsTrigger value="attachments" className="text-sm">
            <Paperclip className="mr-2 h-4 w-4" /> Attachments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Task Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold">Name:</h4>
                <p>{task.name}</p>
              </div>
              {task.description && (
                 <div>
                    <h4 className="font-semibold">Description:</h4>
                    <p className="whitespace-pre-wrap">{task.description}</p>
                 </div>
              )}
               <div>
                <h4 className="font-semibold">Status:</h4>
                <p>{task.status}</p>
              </div>
               <div>
                <h4 className="font-semibold">Created:</h4>
                <p>{task.createdAt ? format(task.createdAt.toDate(), 'PPP p') : 'N/A'}</p>
              </div>
              {task.dueDate && (
                <div>
                    <h4 className="font-semibold">Due Date:</h4>
                    <p>{format(task.dueDate.toDate(), 'PPP')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="mt-6">
          <IssueList projectId={projectId} taskId={taskId} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Timeline functionality will be implemented here.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments" className="mt-6">
          <Card>
            <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Attachment management will be implemented here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

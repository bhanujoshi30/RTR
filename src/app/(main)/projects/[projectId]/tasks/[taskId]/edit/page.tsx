"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TaskForm } from '@/components/tasks/TaskForm';
import { getTaskById } from '@/services/taskService';
import type { Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function EditTaskPage() {
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
        const fetchedTask = await getTaskById(taskId, user.uid, user.role); 
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

  const handleFormSuccess = () => {
    router.push(`/projects/${projectId}/tasks/${taskId}`);
    router.refresh();
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
  
  const backPath = task.parentId 
    ? `/projects/${projectId}/tasks/${task.parentId}` 
    : `/projects/${projectId}`;

  return (
    <div className="mx-auto max-w-2xl">
       <Button variant="outline" onClick={() => router.push(backPath)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">
        Edit {task.parentId ? 'Sub-task' : 'Main Task'}
      </h1>
      <TaskForm projectId={projectId} task={task} parentId={task.parentId} onFormSuccess={handleFormSuccess} />
    </div>
  );
}

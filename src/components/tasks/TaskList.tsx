"use client";

import { useEffect, useState } from 'react';
import { getProjectTasks } from '@/services/taskService';
import type { Task } from '@/types';
import { TaskCard } from './TaskCard';
import { Loader2, CheckSquare, ListTodo } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface TaskListProps {
  projectId: string;
}

export function TaskList({ projectId }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  const fetchTasks = async () => {
    if (authLoading || !user) return;
    try {
      setLoading(true);
      const projectTasks = await getProjectTasks(projectId);
      setTasks(projectTasks);
      setError(null);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user, authLoading]);

  const onTaskUpdated = () => {
    fetchTasks(); // Refetch tasks when one is updated (e.g. status change)
  }

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading tasks...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive">{error}</p>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <ListTodo className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No tasks yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add tasks to this project to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onTaskUpdated={onTaskUpdated} />
      ))}
    </div>
  );
}

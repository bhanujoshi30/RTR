
"use client";

import { useEffect, useState } from 'react';
import { getProjectMainTasks } from '@/services/taskService'; // Changed to getProjectMainTasks
import type { Task } from '@/types';
import { TaskCard } from './TaskCard';
import { Loader2, CheckSquare, ListTodo } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface TaskListProps {
  projectId: string;
}

export function TaskList({ projectId }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]); // Will hold main tasks
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  const fetchMainTasks = async () => {
    if (authLoading || !user) return;
    try {
      setLoading(true);
      const mainTasks = await getProjectMainTasks(projectId); // Fetch only main tasks
      setTasks(mainTasks);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching main tasks:', err);
      setError(`Failed to load tasks. ${err.message?.includes("index") ? "A database index might be required for main tasks. Check console." : ""}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMainTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user, authLoading]);

  const onTaskUpdated = () => {
    fetchMainTasks(); 
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
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <ListTodo className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No main tasks yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add main tasks to this project to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => ( // These are main tasks
        <TaskCard key={task.id} task={task} onTaskUpdated={onTaskUpdated} isMainTaskView={true} />
      ))}
    </div>
  );
}

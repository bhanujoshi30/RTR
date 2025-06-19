
"use client";

import { useEffect, useState } from 'react';
import { getSubTasks } from '@/services/taskService';
import type { Task } from '@/types';
import { TaskCard } from './TaskCard';
import { Loader2, ListChecks } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface SubTaskListProps {
  mainTaskId: string;
  projectId: string; // Pass projectId for navigation within TaskCard potentially
}

export function SubTaskList({ mainTaskId, projectId }: SubTaskListProps) {
  const [subTasks, setSubTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  const fetchSubTasks = async () => {
    if (authLoading || !user || !mainTaskId) return;
    try {
      setLoading(true);
      const fetchedSubTasks = await getSubTasks(mainTaskId);
      setSubTasks(fetchedSubTasks);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching sub-tasks:', err);
      setError(`Failed to load sub-tasks. ${err.message?.includes("index") ? "A database index might be required for sub-tasks. Check console." : ""}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTaskId, user, authLoading]);

  const onSubTaskUpdated = () => {
    fetchSubTasks(); 
  };

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading sub-tasks...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  if (subTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No sub-tasks yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add sub-tasks to this main task.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {subTasks.map((subTask) => (
        <TaskCard 
            key={subTask.id} 
            task={subTask} 
            onTaskUpdated={onSubTaskUpdated}
            isSubTaskView={true}
        />
      ))}
    </div>
  );
}

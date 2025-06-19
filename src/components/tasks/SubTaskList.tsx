
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
    console.log('SubTaskList: fetchSubTasks called. mainTaskId:', mainTaskId, 'Auth Loading:', authLoading, 'User:', user ? user.uid : 'null');
    if (authLoading || !user || !mainTaskId) {
      console.log('SubTaskList: Skipping fetch, auth loading, no user, or no mainTaskId.');
      if(!authLoading && !user && mainTaskId) setLoading(false); // Stop loading if auth is done and no user, but mainTaskId is present
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      console.log(`SubTaskList: Attempting to fetch sub-tasks for mainTaskId: ${mainTaskId}, userUid: ${user.uid}`);
      const fetchedSubTasks = await getSubTasks(mainTaskId, user.uid);
      console.log('SubTaskList: Fetched sub-tasks:', fetchedSubTasks);
      setSubTasks(fetchedSubTasks);
    } catch (err: any) {
      console.error('SubTaskList: Error fetching sub-tasks:', err);
      setError(`Failed to load sub-tasks. ${err.message?.includes("index") ? "A database index might be required for sub-tasks. Check console for details from taskService." : (err.message || "Unknown error")}`);
    } finally {
      setLoading(false);
      console.log('SubTaskList: fetchSubTasks finished. Loading set to false.');
    }
  };

  useEffect(() => {
    console.log('SubTaskList: useEffect triggered. mainTaskId:', mainTaskId, 'User available:', !!user, 'Auth loading:', authLoading);
    if (mainTaskId && user && !authLoading) {
        fetchSubTasks();
    } else if (!mainTaskId) {
        console.warn('SubTaskList: mainTaskId is undefined or null, skipping fetch.');
        setLoading(false);
        setError('Cannot load sub-tasks: Main task ID is missing.');
    } else if (!user && !authLoading) {
        console.warn('SubTaskList: User not available, skipping fetch.');
        setLoading(false);
        setError('Cannot load sub-tasks: User not authenticated.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTaskId, user, authLoading]);

  const onSubTaskUpdated = () => {
    console.log('SubTaskList: onSubTaskUpdated called, re-fetching sub-tasks.');
    fetchSubTasks(); 
  };

  if (loading) {
    console.log('SubTaskList: Render - Loading state true.');
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading sub-tasks...</p>
      </div>
    );
  }

  if (error) {
    console.log('SubTaskList: Render - Error state:', error);
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  if (subTasks.length === 0) {
    console.log('SubTaskList: Render - No sub-tasks found.');
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
  console.log('SubTaskList: Render - Displaying sub-tasks:', subTasks);
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

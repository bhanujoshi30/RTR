
"use client";

import { useEffect, useState } from 'react';
import { getSubTasks } from '@/services/taskService';
import type { Task } from '@/types';
import { TaskCard } from './TaskCard';
import { Loader2, ListChecks } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface SubTaskListProps {
  mainTaskId: string;
  projectId: string; 
}

export function SubTaskList({ mainTaskId, projectId }: SubTaskListProps) {
  const [subTasks, setSubTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  
  const isSupervisor = user?.role === 'supervisor';

  const fetchSubTasksData = async () => {
    console.log('SubTaskList: fetchSubTasksData called. mainTaskId:', mainTaskId, 'Auth Loading:', authLoading, 'User:', user ? user.uid : 'null');
    if (authLoading || !user || !mainTaskId) {
      console.log('SubTaskList: Skipping fetch, auth loading, no user, or no mainTaskId.');
      if(!authLoading && !user && mainTaskId) setLoading(false); 
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      // getSubTasks now always fetches ALL sub-tasks for the mainTaskId
      const fetchedSubTasks = await getSubTasks(mainTaskId);
      console.log('SubTaskList: Fetched sub-tasks:', fetchedSubTasks);
      setSubTasks(fetchedSubTasks);
    } catch (err: any) {
      console.error('SubTaskList: Error fetching sub-tasks:', err);
      setError(`Failed to load sub-tasks. ${err.message?.includes("index") ? "A database index might be required for sub-tasks (parentId ASC, createdAt ASC). Check console." : (err.message || "Unknown error")}`);
    } finally {
      setLoading(false);
      console.log('SubTaskList: fetchSubTasksData finished. Loading set to false.');
    }
  };

  useEffect(() => {
    console.log('SubTaskList: useEffect triggered. mainTaskId:', mainTaskId, 'User available:', !!user, 'Auth loading:', authLoading);
    if (mainTaskId && user && !authLoading) {
        fetchSubTasksData();
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
    fetchSubTasksData(); 
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
    // The message can be generic as supervisors will see all sub-tasks anyway.
    // Specific assigned work is visible when they drill down into a sub-task's issues.
    const message = "No sub-tasks yet for this main task. Add sub-tasks to get started.";
    console.log('SubTaskList: Render - No sub-tasks found.');
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No Sub-tasks Yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {message}
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
            isSubTaskView={true} // Indicates this card represents a sub-task in this list
        />
      ))}
    </div>
  );
}

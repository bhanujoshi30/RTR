
"use client";

import { useEffect, useState } from 'react';
import { getProjectMainTasks } from '@/services/taskService'; 
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
  const { user, loading: authLoading } = useAuth(); // Keep authLoading to ensure user state is resolved

  const fetchMainTasks = async () => {
    console.log('TaskList: fetchMainTasks called. projectId:', projectId, 'Auth Loading:', authLoading);
    // Wait for auth to resolve before proceeding, even if user object isn't directly used in the service call
    if (authLoading) { 
      console.log('TaskList: Skipping fetch, auth still loading.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      console.log(`TaskList: Attempting to fetch main tasks for projectId: ${projectId}`);
      // Call getProjectMainTasks without userUid, as it now fetches all main tasks for the project
      const mainTasks = await getProjectMainTasks(projectId); 
      console.log('TaskList: Fetched main tasks:', mainTasks);
      setTasks(mainTasks);
    } catch (err: any) {
      console.error('TaskList: Error fetching main tasks:', err);
      setError(`Failed to load tasks. ${err.message?.includes("index") ? "A database index might be required for main tasks. Check console for details from taskService." : (err.message || "Unknown error")}`);
    } finally {
      setLoading(false);
      console.log('TaskList: fetchMainTasks finished. Loading set to false.');
    }
  };

  useEffect(() => {
    console.log('TaskList: useEffect triggered. projectId:', projectId, 'Auth loading:', authLoading);
    if (projectId && !authLoading) { // Fetch tasks once projectId is available and auth is resolved
        fetchMainTasks();
    } else if (!projectId) {
        console.warn('TaskList: projectId is undefined or null, skipping fetch.');
        setLoading(false); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authLoading]); // Depend on projectId and authLoading

  const onTaskUpdated = () => {
    console.log('TaskList: onTaskUpdated called, re-fetching main tasks.');
    fetchMainTasks();
  }

  if (loading) { 
    console.log('TaskList: Render - Loading state true.');
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading tasks...</p>
      </div>
    );
  }

  if (error) {
    console.log('TaskList: Render - Error state:', error);
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  if (tasks.length === 0) {
    console.log('TaskList: Render - No tasks found.');
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <ListTodo className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No main tasks yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {/* Message can be dynamic based on whether user can add tasks, but for now, it's generic */}
          Add main tasks to this project to get started.
        </p>
      </div>
    );
  }
  console.log('TaskList: Render - Displaying tasks:', tasks);
  return (
    <div className="space-y-4">
      {tasks.map((task) => ( 
        <TaskCard key={task.id} task={task} onTaskUpdated={onTaskUpdated} isMainTaskView={true} />
      ))}
    </div>
  );
}

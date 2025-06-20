
"use client";

import { useEffect, useState } from 'react';
import { getProjectMainTasks, getAllTasksAssignedToUser } from '@/services/taskService';
import type { Task } from '@/types';
import { TaskCard } from './TaskCard';
import { Loader2, ListTodo } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface TaskListProps {
  projectId: string;
}

export function TaskList({ projectId }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]); // Will hold main tasks
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  const isSupervisorOrMember = user?.role === 'supervisor' || user?.role === 'member';

  const fetchMainTasks = async () => {
    console.log('TaskList: fetchMainTasks called. projectId:', projectId, 'Auth Loading:', authLoading, 'User Role:', user?.role);
    if (authLoading || !user) {
      console.log('TaskList: Skipping fetch, auth loading or no user.');
      if (!authLoading && !user) setLoading(false); // Stop loading if auth resolved and no user
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log(`TaskList: Attempting to fetch all main tasks for projectId: ${projectId}`);
      const allMainTasks = await getProjectMainTasks(projectId);
      console.log('TaskList: Fetched all main tasks:', allMainTasks.length > 0 ? allMainTasks : 'None');

      if (isSupervisorOrMember) {
        console.log(`TaskList: User is ${user.role}. Fetching all sub-tasks assigned to user ${user.uid}.`);
        const allAssignedSubTasks = await getAllTasksAssignedToUser(user.uid);
        console.log('TaskList: Fetched all assigned sub-tasks globally:', allAssignedSubTasks.length > 0 ? allAssignedSubTasks : 'None');

        const projectSpecificAssignedSubTasks = allAssignedSubTasks.filter(
          (subTask) => subTask.projectId === projectId && subTask.parentId
        );
        console.log(`TaskList: Filtered to ${projectSpecificAssignedSubTasks.length} sub-tasks assigned to user in project ${projectId}.`);

        if (projectSpecificAssignedSubTasks.length > 0) {
          const mainTaskIdsUserIsInvolvedWith = new Set(
            projectSpecificAssignedSubTasks.map((subTask) => subTask.parentId!)
          );
          console.log('TaskList: Main task IDs user is involved with in this project:', Array.from(mainTaskIdsUserIsInvolvedWith));

          const filteredMainTasks = allMainTasks.filter((mainTask) =>
            mainTaskIdsUserIsInvolvedWith.has(mainTask.id)
          );
          console.log('TaskList: Filtered main tasks for supervisor/member:', filteredMainTasks.length > 0 ? filteredMainTasks : 'None');
          setTasks(filteredMainTasks);
        } else {
          console.log(`TaskList: User ${user.uid} has no sub-tasks assigned in project ${projectId}. Displaying no main tasks.`);
          setTasks([]); // No sub-tasks assigned in this project, so no main tasks to show for them
        }
      } else {
        // Admin or project owner sees all main tasks
        console.log('TaskList: User is admin/owner. Displaying all main tasks.');
        setTasks(allMainTasks);
      }
    } catch (err: any) {
      console.error('TaskList: Error fetching main tasks:', err);
      setError(`Failed to load tasks. ${err.message?.includes("index") ? "A database index might be required for main tasks. Check console for details from taskService." : (err.message || "Unknown error")}`);
      setTasks([]); // Clear tasks on error
    } finally {
      setLoading(false);
      console.log('TaskList: fetchMainTasks finished. Loading set to false.');
    }
  };

  useEffect(() => {
    console.log('TaskList: useEffect triggered. projectId:', projectId, 'Auth loading:', authLoading, 'User role:', user?.role);
    if (projectId && !authLoading && user) {
      fetchMainTasks();
    } else if (!projectId) {
      console.warn('TaskList: projectId is undefined or null, skipping fetch.');
      setLoading(false);
      setError("Project ID is missing, cannot load tasks.");
    } else if (!authLoading && !user) {
      // Auth has loaded, but there's no user. Stop loading, potentially show "not authenticated" or rely on parent to redirect.
      setLoading(false);
      setError("User not authenticated. Cannot load tasks.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authLoading, user]); // Depend on projectId, authLoading, and user

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
    console.log('TaskList: Render - No tasks to display.');
    const message = isSupervisorOrMember
      ? "You are not assigned to any sub-tasks under main tasks in this project, or there are no main tasks with such assignments."
      : "No main tasks have been created for this project yet.";
    const title = isSupervisorOrMember
      ? "No Relevant Main Tasks"
      : "No Main Tasks Yet";
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <ListTodo className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    );
  }
  console.log('TaskList: Render - Displaying tasks:', tasks.length > 0 ? tasks : 'None');
  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onTaskUpdated={onTaskUpdated} isMainTaskView={true} />
      ))}
    </div>
  );
}

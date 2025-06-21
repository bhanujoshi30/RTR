
"use client";

import { useEffect, useState } from 'react';
import { getSubTasks, getAssignedSubTasksForUser } from '@/services/taskService';
import { countOpenIssuesForTask } from '@/services/issueService';
import type { Task } from '@/types';
import { TaskCard } from './TaskCard';
import { Loader2, ListChecks } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface SubTaskListProps {
  mainTaskId: string;
  projectId: string; 
  mainTaskOwnerUid: string; // UID of the owner of the main task
}

export function SubTaskList({ mainTaskId, projectId, mainTaskOwnerUid }: SubTaskListProps) {
  const [subTasks, setSubTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  
  const isViewerMainTaskOwner = user?.uid === mainTaskOwnerUid;

  const fetchSubTasksData = async () => {
    console.log('[SubTaskList Debug] fetchSubTasksData called. mainTaskId:', mainTaskId, 'Auth Loading:', authLoading, 'User:', user ? user.uid : 'null', 'MainTaskOwnerUid:', mainTaskOwnerUid);
    if (authLoading || !user || !mainTaskId) {
      console.log('[SubTaskList Debug] Skipping fetch, auth loading, no user, or no mainTaskId.');
      if(!authLoading && !user && mainTaskId) setLoading(false); 
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      let fetchedSubTasks: Task[];
      if (isViewerMainTaskOwner) {
        console.log(`[SubTaskList Debug] User ${user.uid} IS the main task owner. Fetching all sub-tasks for main task ${mainTaskId}.`);
        fetchedSubTasks = await getSubTasks(mainTaskId);
      } else {
        console.log(`[SubTaskList Debug] User ${user.uid} is NOT the main task owner. Fetching assigned sub-tasks only for main task ${mainTaskId}.`);
        fetchedSubTasks = await getAssignedSubTasksForUser(mainTaskId, user.uid);
      }

      const subTasksWithIssueCounts = await Promise.all(
        fetchedSubTasks.map(async (task) => {
          const openIssueCount = await countOpenIssuesForTask(task.id);
          return { ...task, openIssueCount };
        })
      );

      setSubTasks(subTasksWithIssueCounts);
      console.log(`[SubTaskList Debug] Set ${subTasksWithIssueCounts.length} sub-tasks for display with issue counts.`);

    } catch (err: any) {
      console.error('[SubTaskList Debug] Error fetching sub-tasks for mainTaskId', mainTaskId, ':', err);
      let displayError = `Failed to load sub-tasks. ${err.message || "Unknown error"}`;
      if (err.message?.toLowerCase().includes("index")) {
        displayError = `Failed to load sub-tasks. A Firestore query error occurred, likely due to a missing database index. Please check the browser console for detailed error messages from 'taskService' which may include a link to create the required index. Ensure an index on 'tasks' for 'parentId' (ASC) and 'createdAt' (ASC) exists.`;
      }
      setError(displayError);
    } finally {
      setLoading(false);
      console.log('[SubTaskList Debug] fetchSubTasksData finished for mainTaskId', mainTaskId, '. Loading set to false.');
    }
  };

  useEffect(() => {
    console.log('[SubTaskList Debug] useEffect triggered. mainTaskId:', mainTaskId, 'User available:', !!user, 'Auth loading:', authLoading, 'MainTaskOwnerUid:', mainTaskOwnerUid);
    if (!mainTaskId) {
        console.warn('[SubTaskList Debug] mainTaskId is undefined or null, skipping fetch.');
        setLoading(false);
        setError('Cannot load sub-tasks: Main task ID is missing.');
        return;
    }
    if (!mainTaskOwnerUid && user && !authLoading) {
        console.warn('[SubTaskList Debug] mainTaskOwnerUid is undefined or null, but user is available. Filtering behavior might be unexpected or default to showing all. Ensure mainTaskOwnerUid is passed.');
    }
    if (user && !authLoading) {
        fetchSubTasksData();
    } else if (!user && !authLoading) {
        console.warn('[SubTaskList Debug] User not available, skipping fetch.');
        setLoading(false);
        setError('Cannot load sub-tasks: User not authenticated.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTaskId, user, authLoading, mainTaskOwnerUid]); // Added mainTaskOwnerUid as dependency

  const onSubTaskUpdated = () => {
    console.log('[SubTaskList Debug] onSubTaskUpdated called, re-fetching sub-tasks for mainTaskId:', mainTaskId);
    fetchSubTasksData(); 
  };

  if (loading) {
    console.log('[SubTaskList Debug] Render - Loading state true for mainTaskId:', mainTaskId);
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading sub-tasks...</p>
      </div>
    );
  }

  if (error) {
    console.log('[SubTaskList Debug] Render - Error state for mainTaskId:', mainTaskId, 'Error:', error);
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  if (subTasks.length === 0) {
    let noSubTasksMessage = "No sub-tasks yet for this main task. Add sub-tasks to get started.";
    if (user && mainTaskOwnerUid && user.uid !== mainTaskOwnerUid) {
      noSubTasksMessage = "No sub-tasks assigned to you under this main task.";
    }
    console.log('[SubTaskList Debug] Render - No sub-tasks to display for mainTaskId:', mainTaskId, 'Message:', noSubTasksMessage);
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">{isViewerMainTaskOwner ? "No Sub-tasks Yet" : "No Assigned Sub-tasks"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {noSubTasksMessage}
        </p>
      </div>
    );
  }
  console.log('[SubTaskList Debug] Render - Displaying sub-tasks for mainTaskId:', mainTaskId, 'Count:', subTasks.length, 'SubTasks:', subTasks);
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

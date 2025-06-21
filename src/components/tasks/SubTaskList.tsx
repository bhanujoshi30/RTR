
"use client";

import { useEffect, useState } from 'react';
import { countOpenIssuesForTask } from '@/services/issueService';
import type { Task } from '@/types';
import { TaskCard } from './TaskCard';
import { Loader2, ListChecks } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { query, where, getDocs, orderBy, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';


// This helper function is now local to avoid service dependency issues
const mapDocumentToTask = (docSnapshot: any): Task => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    projectId: data.projectId,
    projectOwnerUid: data.projectOwnerUid,
    parentId: data.parentId || null,
    name: data.name,
    description: data.description || '',
    status: data.status as Task['status'],
    ownerUid: data.ownerUid,
    assignedToUids: data.assignedToUids || [],
    assignedToNames: data.assignedToNames || [],
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
    dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : (data.parentId ? new Date() : null)),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : undefined),
    progress: data.progress,
    openIssueCount: data.openIssueCount,
  };
};

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
  const isAdmin = user?.role === 'admin';

  const fetchSubTasksData = async () => {
    if (authLoading || !user || !mainTaskId) {
      if(!authLoading && !user && mainTaskId) setLoading(false); 
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const tasksCollectionRef = collection(db, 'tasks');
      let subTasksQuery;

      if (isViewerMainTaskOwner || isAdmin) {
        // Owners/Admins see all subtasks. This query requires an index on parentId (ASC), createdAt (ASC).
        subTasksQuery = query(
          tasksCollectionRef,
          where('parentId', '==', mainTaskId),
          orderBy('createdAt', 'asc')
        );
      } else {
        // Supervisors/Members only see assigned subtasks.
        // THIS QUERY REQUIRES A COMPOSITE INDEX in Firestore.
        // The error message in the browser console will provide a direct link to create it.
        // Index fields: parentId (ASC), assignedToUids (ARRAY-CONTAINS), createdAt (ASC)
        subTasksQuery = query(
          tasksCollectionRef,
          where('parentId', '==', mainTaskId),
          where('assignedToUids', 'array-contains', user.uid),
          orderBy('createdAt', 'asc')
        );
      }

      const querySnapshot = await getDocs(subTasksQuery);
      const fetchedSubTasks = querySnapshot.docs.map(mapDocumentToTask);

      const subTasksWithIssueCounts = await Promise.all(
        fetchedSubTasks.map(async (task) => {
          const openIssueCount = await countOpenIssuesForTask(task.id);
          return { ...task, openIssueCount };
        })
      );

      setSubTasks(subTasksWithIssueCounts);

    } catch (err: any) {
      console.error('[SubTaskList] Error fetching sub-tasks:', err);
      let displayError = `Failed to load sub-tasks. This is likely due to a missing database index. Please open your browser's developer console (F12) for an error message from Firestore that contains a direct link to create the required index automatically.`;
      setError(displayError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mainTaskId) {
        setLoading(false);
        setError('Cannot load sub-tasks: Main task ID is missing.');
        return;
    }
    if (user && !authLoading) {
        fetchSubTasksData();
    } else if (!user && !authLoading) {
        setLoading(false);
        setError('Cannot load sub-tasks: User not authenticated.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTaskId, user, authLoading]);

  const onSubTaskUpdated = () => {
    fetchSubTasksData(); 
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading sub-tasks...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-4 whitespace-pre-wrap">{error}</p>;
  }

  if (subTasks.length === 0) {
    let noSubTasksMessage = "No sub-tasks yet for this main task. Add sub-tasks to get started.";
    if (user && mainTaskOwnerUid && user.uid !== mainTaskOwnerUid && !isAdmin) {
      noSubTasksMessage = "No sub-tasks have been assigned to you under this main task.";
    }
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

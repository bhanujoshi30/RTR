
"use client";

import { useEffect, useState } from 'react';
import { getOpenIssuesForTaskIds } from '@/services/issueService';
import type { Task, Issue } from '@/types';
import { TaskCard } from './TaskCard';
import { Loader2, ListChecks } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { query, where, getDocs, orderBy, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTranslation } from '@/hooks/useTranslation';


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
  const { t } = useTranslation();
  
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
        // The orderBy was removed to prevent errors from missing composite indexes. Sorting is now done client-side.
        subTasksQuery = query(
          tasksCollectionRef,
          where('parentId', '==', mainTaskId),
          where('assignedToUids', 'array-contains', user.uid)
        );
      }

      const querySnapshot = await getDocs(subTasksQuery);
      let fetchedSubTasks = querySnapshot.docs.map(mapDocumentToTask);
      
      // Client-side sorting for the member/supervisor query
      if (!isViewerMainTaskOwner && !isAdmin) {
          fetchedSubTasks.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
      }
      
      if (fetchedSubTasks.length > 0) {
        const subTaskIds = fetchedSubTasks.map(t => t.id);
        const openIssues = await getOpenIssuesForTaskIds(subTaskIds);
        
        const issuesByTaskId = openIssues.reduce((acc, issue) => {
            if (!acc[issue.taskId]) {
                acc[issue.taskId] = [];
            }
            acc[issue.taskId].push(issue);
            return acc;
        }, {} as Record<string, Issue[]>);

        const now = new Date();
        const subTasksWithDetails = fetchedSubTasks.map(subTask => {
            const relatedIssues = issuesByTaskId[subTask.id] || [];
            
            const isTaskItselfOverdue = subTask.dueDate && now > subTask.dueDate && subTask.status !== 'Completed';
            const isAnyIssueOverdue = relatedIssues.some(issue => issue.dueDate && now > issue.dueDate && issue.status === 'Open');

            return {
                ...subTask,
                openIssueCount: relatedIssues.length,
                isOverdue: isTaskItselfOverdue || isAnyIssueOverdue,
            };
        });
        setSubTasks(subTasksWithDetails);
      } else {
         setSubTasks([]);
      }

    } catch (err: any) {
      console.error('[SubTaskList] Error fetching sub-tasks:', err);
      let displayError = `Failed to load sub-tasks. Missing or insufficient permissions.`;
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
        <p className="ml-2">{t('taskList.loadingSubTasks')}</p>
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

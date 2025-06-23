
"use client";

import { useEffect, useState } from 'react';
import { getTaskIssues } from '@/services/issueService';
import { getTaskById } from '@/services/taskService'; 
import type { Issue, Task } from '@/types';
import { IssueCard } from '@/components/issues/IssueCard';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Bug } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';

interface IssueListProps {
  projectId: string;
  taskId: string;
  onIssueListChange?: () => void; 
}

export function IssueList({ projectId, taskId, onIssueListChange }: IssueListProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const [parentTask, setParentTask] = useState<Task | null>(null);
  const router = useRouter();
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const { t } = useTranslation();

  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';
  
  const isUserAssignedToParentTask = user && parentTask?.assignedToUids?.includes(user.uid);
  const isUserOwnerOfParentTask = user && parentTask?.ownerUid === user.uid;

  const canManageIssuesForThisTask = isUserOwnerOfParentTask || ((isSupervisor || isMember) && isUserAssignedToParentTask);

  const fetchParentTaskAndIssues = async () => {
    if (authLoading || !user || !taskId) return;
    try {
      setLoading(true);
      const fetchedTask = await getTaskById(taskId, user.uid, user.role); 
      setParentTask(fetchedTask);

      const taskIssues = await getTaskIssues(taskId, user.uid, (isSupervisor || isMember) && fetchedTask?.assignedToUids?.includes(user.uid));
      setIssues(taskIssues);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching issues or parent task for task:', taskId, err);
      setError(`Failed to load issues. ${err.message?.includes("index") ? "A database index might be required. Check console for details." : ""}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) { 
        fetchParentTaskAndIssues();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, user, authLoading]);

  const handleIssueCardUpdate = async () => {
    await fetchParentTaskAndIssues(); 
    if (onIssueListChange) {
      onIssueListChange(); 
    }
  };
  
  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">{t('common.loadingIssues')}</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h3 className="font-headline text-xl font-semibold flex items-center">
          <Bug className="mr-3 h-6 w-6 text-primary" />
          {t('issueList.title')}
        </h3>
        {canManageIssuesForThisTask && (
          <Button
            size="sm"
            onClick={() => {
              setIsCreatingIssue(true);
              router.push(`/projects/${projectId}/tasks/${taskId}/issues/create`);
            }}
            disabled={isCreatingIssue}
          >
            {isCreatingIssue ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="mr-2 h-4 w-4" />
            )}
            {t('issueList.addNew')}
          </Button>
        )}
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
          <Bug className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-3 font-headline text-lg font-semibold">{t('issueList.noIssuesTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManageIssuesForThisTask ? t('issueList.noIssuesDescOwner') : t('issueList.noIssuesDescMember')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {issues.map((issue) => (
            <IssueCard 
                key={issue.id} 
                issue={issue} 
                projectId={projectId} 
                taskId={taskId} 
                onIssueUpdated={handleIssueCardUpdate}
                canManageIssue={isUserOwnerOfParentTask || ((isSupervisor || isMember) && issue.assignedToUids?.includes(user?.uid || ''))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

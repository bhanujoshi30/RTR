
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { IssueForm } from '@/components/issues/IssueForm';
import { getIssueById } from '@/services/issueService';
import type { Issue } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';

export default function EditIssuePage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();

  const projectId = params.projectId as string;
  const taskId = params.taskId as string;
  const issueId = params.issueId as string;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user || !issueId) return;

    const fetchIssue = async () => {
      try {
        setLoading(true);
        const fetchedIssue = await getIssueById(issueId, user.uid);
        if (fetchedIssue && fetchedIssue.taskId === taskId) {
          setIssue(fetchedIssue);
        } else {
          setError('Issue not found or does not belong to this task.');
        }
      } catch (err) {
        console.error('Error fetching issue:', err);
        setError('Failed to load issue details.');
      } finally {
        setLoading(false);
      }
    };

    fetchIssue();
  }, [issueId, taskId, user, authLoading]);

  const handleFormSuccess = () => {
    router.push(`/projects/${projectId}/tasks/${taskId}`);
    router.refresh();
  };
  
  const backPath = `/projects/${projectId}/tasks/${taskId}`;

  if (loading || authLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-10">{error}</p>;
  }
  
  if (!issue) {
    return <p className="text-center text-muted-foreground py-10">Issue details could not be loaded.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
       <Button variant="outline" onClick={() => router.push(backPath)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> {t('issueDetails.backToSubTask')}
      </Button>
      <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">
        {t('issueDetails.editIssue')}
      </h1>
      <IssueForm projectId={projectId} taskId={taskId} issue={issue} onFormSuccess={handleFormSuccess} />
    </div>
  );
}

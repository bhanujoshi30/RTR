
"use client";

import { IssueForm } from '@/components/issues/IssueForm';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export default function CreateIssuePage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const projectId = params.projectId as string;
  const taskId = params.taskId as string;
  
  if (!projectId || !taskId) {
    return <p>Project or Task ID is missing.</p>;
  }
  
  const backPath = `/projects/${projectId}/tasks/${taskId}`;
  const handleFormSuccess = () => {
    router.push(backPath);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="outline" onClick={() => router.push(backPath)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> {t('issueDetails.backToSubTask')}
      </Button>
      <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">{t('issueForm.addTitle')}</h1>
      <IssueForm projectId={projectId} taskId={taskId} onFormSuccess={handleFormSuccess} />
    </div>
  );
}

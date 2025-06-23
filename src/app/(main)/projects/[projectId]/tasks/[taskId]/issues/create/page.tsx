
"use client";

import { IssueForm } from '@/components/issues/IssueForm';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function CreateIssuePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const taskId = params.taskId as string;

  if (!projectId || !taskId) {
    return <p>Project or Task ID is missing.</p>;
  }
  
  const handleFormSuccess = () => {
    router.push(`/projects/${projectId}/tasks/${taskId}`);
    router.refresh();
  };
  
  const backPath = `/projects/${projectId}/tasks/${taskId}`;

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="outline" onClick={() => router.push(backPath)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sub-task
      </Button>
      <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">
        Create New Issue
      </h1>
      <IssueForm projectId={projectId} taskId={taskId} onFormSuccess={handleFormSuccess} />
    </div>
  );
}

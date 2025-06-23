
// This file is no longer used and can be deleted.
// The "Add Issue" functionality has been moved back to a dialog in IssueList.tsx.
"use client";

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function CreateIssuePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const taskId = params.taskId as string;
  
  useEffect(() => {
      // Redirect to the parent task page as this page is deprecated.
      if (taskId && projectId) {
          router.replace(`/projects/${projectId}/tasks/${taskId}`);
      } else {
          router.replace('/dashboard');
      }
  }, [router, taskId, projectId]);


  return (
    <div className="flex h-[calc(100vh-10rem)] w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3">Redirecting...</p>
    </div>
  );
}

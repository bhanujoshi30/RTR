
"use client";

// This file is no longer used and can be deleted.
// The "Add Issue" functionality has been moved back to a dialog in IssueList.tsx.

import { IssueForm } from '@/components/issues/IssueForm';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';

export default function CreateIssuePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const taskId = params.taskId as string;
  const { user, loading: authLoading } = useAuth();
  
  useEffect(() => {
      // Redirect to the parent task page as this page is deprecated.
      if (taskId && projectId) {
          router.replace(`/projects/${projectId}/tasks/${taskId}`);
      } else {
          router.replace('/dashboard');
      }
  }, [router, taskId, projectId]);


  if (authLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">Redirecting...</h1>
        <p>This page is no longer in use.</p>
    </div>
  );
}


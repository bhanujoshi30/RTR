
"use client";

import { TaskForm } from '@/components/tasks/TaskForm';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';

export default function CreateTaskPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { user, loading: authLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (user?.role === 'supervisor' || user?.role === 'member') {
        router.push(`/projects/${projectId}`); // Redirect disallowed roles
      } else if (user) {
        // User is allowed, so we can show the form
        setIsReady(true);
      }
      // The AuthGuard will handle cases where the user is not logged in.
    }
  }, [user, authLoading, router, projectId]);

  // Show a loader until we have checked auth and determined the user is allowed to be here.
  if (!isReady || authLoading) {
     return (
      <div className="flex h-[calc(100vh-10rem)] w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!projectId) {
    return <p>Project ID is missing.</p>;
  }
  
  // Render the form only when we are sure the user is allowed.
  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Project
      </Button>
      <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">Add New Main Task</h1>
      {/* TaskForm without parentId creates a main task */}
      <TaskForm projectId={projectId} onFormSuccess={() => router.push(`/projects/${projectId}`)} />
    </div>
  );
}

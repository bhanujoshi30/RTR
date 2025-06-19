
"use client";

import { TaskForm } from '@/components/tasks/TaskForm';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export default function CreateTaskPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user?.role === 'supervisor') {
      router.push(`/projects/${projectId}`); // Redirect supervisor to project page
    }
  }, [user, loading, router, projectId]);

  if (loading || (user && user.role === 'supervisor')) {
     return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!projectId) {
    return <p>Project ID is missing.</p>;
  }
  
  if (!loading && user && user.role !== 'supervisor') {
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
  return null;
}

    
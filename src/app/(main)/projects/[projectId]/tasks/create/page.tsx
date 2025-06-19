
"use client";

import { TaskForm } from '@/components/tasks/TaskForm';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function CreateTaskPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  if (!projectId) {
    return <p>Project ID is missing.</p>;
  }
  
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

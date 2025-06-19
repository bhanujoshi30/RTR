
"use client";

import { ProjectForm } from '@/components/projects/ProjectForm';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function CreateProjectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role === 'supervisor') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading || (user && user.role === 'supervisor')) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // Render form if not loading and user is not a supervisor (or no user, though AuthGuard should prevent this)
  if (!loading && user && user.role !== 'supervisor') {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">Create New Project</h1>
        <ProjectForm />
      </div>
    );
  }

  // Fallback or if user is null and not loading (AuthGuard should handle this ideally)
  return null; 
}

    
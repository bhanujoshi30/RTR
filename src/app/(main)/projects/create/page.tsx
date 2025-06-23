
"use client";

import { ProjectForm } from '@/components/projects/ProjectForm';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export default function CreateProjectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (!loading && (user?.role === 'supervisor' || user?.role === 'member')) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading || (user && (user.role === 'supervisor' || user.role === 'member'))) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // Render form if not loading and user is not a supervisor or member
  if (!loading && user && user.role !== 'supervisor' && user.role !== 'member') {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">{t('projectForm.pageTitle')}</h1>
        <ProjectForm />
      </div>
    );
  }

  // Fallback or if user is null and not loading (AuthGuard should handle this ideally)
  return null; 
}

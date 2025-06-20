"use client";

import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/toaster';

export function AuthContentWrapper({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}

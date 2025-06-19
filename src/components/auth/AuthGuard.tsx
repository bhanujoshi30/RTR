
"use client";

import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user && pathname !== '/login' && pathname !== '/register') {
        // User is not authenticated and not on an auth page, redirect to login
        router.push('/login');
      } else if (user && (pathname === '/login' || pathname === '/register' || pathname === '/')) {
        // User is authenticated and on an auth page OR on the root page, redirect to dashboard
        router.push('/dashboard');
      }
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // This condition handles the state where a redirect might be pending for an unauthenticated user on a protected route.
  if (!user && pathname !== '/login' && pathname !== '/register') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If we reach here, it means:
  // 1. `loading` is false.
  // 2. EITHER the user is authenticated (`user` is truthy) AND is not on a path that needs redirection (e.g. already on /dashboard or other protected route)
  // 3. OR the user is not authenticated (`!user`) AND they are on the `/login` or `/register` page.
  // In these cases, we should render the children.
  return <>{children}</>;
}

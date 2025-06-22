
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

  // Show loader while auth state is being determined.
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // After loading, if a redirect is imminent, continue showing the loader
  // to prevent the "flash" of the wrong page content.
  const isUnauthenticatedOnProtectedRoute = !user && pathname !== '/login' && pathname !== '/register';
  const isAuthenticatedOnAuthRoute = user && (pathname === '/login' || pathname === '/register' || pathname === '/');

  if (isUnauthenticatedOnProtectedRoute || isAuthenticatedOnAuthRoute) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If no loading and no redirect is pending, render the children.
  // This means the user is in the correct state for the current route.
  return <>{children}</>;
}

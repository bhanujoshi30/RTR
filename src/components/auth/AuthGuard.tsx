
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

  console.log('AuthGuard: Instance created. Pathname:', pathname, 'Initial User:', user, 'Initial Loading:', loading);

  useEffect(() => {
    console.log('AuthGuard: useEffect running. Pathname:', pathname, 'User:', user, 'Loading:', loading);
    if (!loading) {
      if (!user && pathname !== '/login' && pathname !== '/register') {
        console.log('AuthGuard: useEffect - Not logged in and not on auth pages. Redirecting to /login.');
        router.push('/login');
      } else if (user && (pathname === '/login' || pathname === '/register')) {
        console.log('AuthGuard: useEffect - Logged in and on auth page. Redirecting to /dashboard.');
        router.push('/dashboard');
      } else {
        console.log('AuthGuard: useEffect - No redirect needed for current state.');
      }
    } else {
      console.log('AuthGuard: useEffect - Still loading, no redirection logic executed.');
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    console.log('AuthGuard: Render - Loading is true, showing loader. Pathname:', pathname);
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // This condition handles the state where a redirect might be pending for an unauthenticated user on a protected route.
  if (!user && pathname !== '/login' && pathname !== '/register') {
    console.log('AuthGuard: Render - Not logged in and not on auth pages. Showing loader (pending redirect by useEffect). Pathname:', pathname);
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If we reach here, it means:
  // 1. `loading` is false.
  // 2. EITHER the user is authenticated (`user` is truthy)
  // 3. OR the user is not authenticated (`!user`) AND they are on the `/login` or `/register` page.
  // In these cases, we should render the children.
  console.log('AuthGuard: Render - Conditions met to render children. Pathname:', pathname, 'User:', user);
  return <>{children}</>;
}

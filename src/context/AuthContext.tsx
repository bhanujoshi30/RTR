
"use client";

import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { createContext, useEffect, useState, ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('AuthContext: useEffect mounting. Initializing onAuthStateChanged listener.');
    
    if (!auth) {
        console.error("AuthContext: Firebase auth object is not available. Firebase might not be initialized correctly.");
        setLoading(false); // Prevent infinite loader
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      console.log('AuthContext: onAuthStateChanged triggered. Firebase user:', firebaseUser);
      setUser(firebaseUser as User | null);
      setLoading(false);
      console.log('AuthContext: setLoading(false). Current user state:', firebaseUser as User | null);
    }, (error) => {
      console.error('AuthContext: onAuthStateChanged error:', error);
      setUser(null); // Ensure user is null on auth error
      setLoading(false); // Also set loading false on error to prevent infinite loader
    });

    return () => {
      console.log('AuthContext: useEffect unmounting. Unsubscribing from onAuthStateChanged.');
      unsubscribe();
    }
  }, []);

  console.log('AuthProvider rendering. User:', user, 'Loading:', loading);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

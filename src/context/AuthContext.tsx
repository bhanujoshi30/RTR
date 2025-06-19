
"use client";

import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { createContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase'; // Import db
import { User, type UserRole } from '@/types';
import { doc, getDoc, Timestamp } from 'firebase/firestore'; // Import doc and getDoc

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
    if (!auth) {
        console.error("AuthContext: Firebase auth object is not available. Firebase might not be initialized correctly.");
        setLoading(false); 
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(userDocRef);

          let role: UserRole | undefined = undefined;
          let createdAt: Date | undefined = undefined;
          let updatedAt: Date | undefined = undefined;

          if (docSnap.exists()) {
            const firestoreData = docSnap.data();
            role = firestoreData.role as UserRole;
            createdAt = firestoreData.createdAt ? (firestoreData.createdAt as Timestamp).toDate() : undefined;
            updatedAt = firestoreData.updatedAt ? (firestoreData.updatedAt as Timestamp).toDate() : undefined;
          } else {
            console.warn(`AuthContext: User document not found in Firestore for UID: ${firebaseUser.uid}. Role will be undefined.`);
          }
          
          const appUser: User = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            role: role,
            createdAt: createdAt,
            updatedAt: updatedAt,
          };
          setUser(appUser);

        } catch (error) {
          console.error("AuthContext: Error fetching user role from Firestore:", error);
          // Fallback to user data without role from Firestore
          const appUserWithoutRole: User = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
          };
          setUser(appUserWithoutRole);
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    }, (error) => {
      console.error('AuthContext: onAuthStateChanged error:', error);
      setUser(null); 
      setLoading(false); 
    });

    return () => {
      unsubscribe();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

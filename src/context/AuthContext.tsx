
"use client";

import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { createContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase'; // Import db
import { User, type UserRole } from '@/types';
import { doc, getDoc, setDoc, Timestamp, collection, query, getDocs, limit, serverTimestamp } from 'firebase/firestore';

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
          let docSnap = await getDoc(userDocRef);

          // If user document doesn't exist, create it.
          if (!docSnap.exists()) {
            console.log(`AuthContext: User document for ${firebaseUser.uid} not found. Creating it...`);
            
            // Check if this is the very first user, to make them an admin.
            const usersCollectionRef = collection(db, 'users');
            const firstUserQuery = query(usersCollectionRef, limit(1));
            const existingUsersSnapshot = await getDocs(firstUserQuery);
            const isFirstUser = existingUsersSnapshot.empty;
            const newRole: UserRole = isFirstUser ? 'admin' : 'member';

            console.log(`AuthContext: Is first user? ${isFirstUser}. Assigning role: ${newRole}.`);

            const newUserDocData = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || firebaseUser.email,
                photoURL: firebaseUser.photoURL || null,
                role: newRole,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                emailVerified: firebaseUser.emailVerified,
            };
            
            await setDoc(userDocRef, newUserDocData);
            console.log(`AuthContext: User document created for ${firebaseUser.uid} with role ${newRole}.`);
            
            // Re-fetch the document to get the server-generated timestamps
            docSnap = await getDoc(userDocRef); 
          }

          // At this point, docSnap is guaranteed to exist.
          const firestoreData = docSnap.data();
          if (!firestoreData) {
            throw new Error("Could not read created user document.");
          }

          const role = firestoreData.role as UserRole;
          const createdAt = firestoreData.createdAt ? (firestoreData.createdAt as Timestamp).toDate() : undefined;
          const updatedAt = firestoreData.updatedAt ? (firestoreData.updatedAt as Timestamp).toDate() : undefined;
          
          const appUser: User = {
            uid: firebaseUser.uid,
            displayName: firestoreData.displayName || firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firestoreData.photoURL || firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            role: role,
            createdAt: createdAt,
            updatedAt: updatedAt,
          };
          setUser(appUser);

        } catch (error) {
          console.error("AuthContext: Error fetching or creating user document:", error);
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


"use client";

import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { createContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase'; // Import db
import { User, type UserRole } from '@/types';
import { doc, getDoc, setDoc, Timestamp, collection, query, getDocs, limit, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from './LanguageContext';

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
  const { setLocale } = useLanguage();

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

          if (!docSnap.exists()) {
            console.log(`AuthContext: User document for ${firebaseUser.uid} not found. Creating it...`);
            
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
                preferredLanguage: 'en', // Default language for new users
            };
            
            await setDoc(userDocRef, newUserDocData);
            console.log(`AuthContext: User document created for ${firebaseUser.uid} with role ${newRole}.`);
            
            docSnap = await getDoc(userDocRef); 
          }

          const firestoreData = docSnap.data();
          if (!firestoreData) {
            throw new Error("Could not read created user document.");
          }

          const role = firestoreData.role as UserRole;
          const createdAt = firestoreData.createdAt ? (firestoreData.createdAt as Timestamp).toDate() : undefined;
          const updatedAt = firestoreData.updatedAt ? (firestoreData.updatedAt as Timestamp).toDate() : undefined;
          const preferredLanguage = firestoreData.preferredLanguage || 'en';
          
          const appUser: User = {
            uid: firebaseUser.uid,
            displayName: firestoreData.displayName || firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firestoreData.photoURL || firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            role: role,
            createdAt: createdAt,
            updatedAt: updatedAt,
            preferredLanguage: preferredLanguage,
          };
          setUser(appUser);
          setLocale(preferredLanguage); // Set language on login

        } catch (error) {
          console.error("AuthContext: Error fetching or creating user document:", error);
          const appUserWithoutRole: User = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
          };
          setUser(appUserWithoutRole);
          setLocale('en'); // Fallback to English
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLocale('en'); // Reset to English on logout
        setLoading(false);
      }
    }, (error) => {
      console.error('AuthContext: onAuthStateChanged error:', error);
      setUser(null); 
      setLocale('en'); // Reset to English on error
      setLoading(false); 
    });

    return () => {
      unsubscribe();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

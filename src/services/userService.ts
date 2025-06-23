
import { db } from '@/lib/firebase';
import type { User, UserRole } from '@/types';
import { collection, query, where, getDocs, orderBy, doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp, documentId, updateDoc } from 'firebase/firestore';

const usersCollection = collection(db, 'users');

const mapDocumentToUser = (docSnap: any): User => {
  const data = docSnap.data();
  return {
    uid: docSnap.id,
    displayName: data.displayName || null,
    email: data.email || null,
    photoURL: data.photoURL || null,
    emailVerified: data.emailVerified || false,
    role: data.role as UserRole,
    createdAt: data.createdAt ? (data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt)) : undefined,
    updatedAt: data.updatedAt ? (data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt)) : undefined,
    preferredLanguage: data.preferredLanguage || 'en',
  };
};

export const updateUserLanguagePreference = async (uid: string, locale: 'en' | 'hi'): Promise<void> => {
    if (!uid) throw new Error("User UID is required to update language preference.");
    const userDocRef = doc(db, 'users', uid);
    try {
        await updateDoc(userDocRef, {
            preferredLanguage: locale,
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error(`userService: Failed to update language for UID ${uid}`, error);
        throw error;
    }
};

export const getUserDisplayName = async (uid: string): Promise<string | null> => {
  if (!uid) return null;
  try {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
      return docSnap.data().displayName || uid;
    }
    console.warn(`userService: User document not found for UID ${uid} when fetching display name. Returning UID.`);
    return uid;
  } catch (error) {
    console.error(`userService: Error fetching display name for UID ${uid}:`, error);
    return uid;
  }
};

export const getUsersByIds = async (uids: string[]): Promise<User[]> => {
    if (!uids || uids.length === 0) {
      return [];
    }
    const users: User[] = [];
    const userChunks: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
        userChunks.push(uids.slice(i, i + 30));
    }
  
    for (const chunk of userChunks) {
        if (chunk.length === 0) continue;
        const q = query(collection(db, 'users'), where(documentId(), 'in', chunk));
        try {
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((docSnap) => {
                users.push(mapDocumentToUser(docSnap));
            });
        } catch (error) {
            console.error(`Error fetching user chunk:`, error);
        }
    }
    users.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    return users;
  };

export const getAllUsers = async (requestingUserUid: string): Promise<User[]> => {
  console.log(`userService: getAllUsers called by user: ${requestingUserUid}`);
  // Query without ordering to avoid index requirement
  const q = query(usersCollection);
  try {
    const querySnapshot = await getDocs(q);
    const allUsers = querySnapshot.docs.map(mapDocumentToUser);

    // Sort in application code
    allUsers.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    
    console.log(`userService: Fetched ${allUsers.length} total users.`);
    return allUsers;
  } catch (error: any)
 {
    console.error(`userService: Error fetching all users:`, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export interface UserDocumentData {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string | null;
  emailVerified?: boolean;
  preferredLanguage?: 'en' | 'hi';
}

export const upsertUserDocument = async (
  requestingUserUid: string,
  userData: UserDocumentData
): Promise<void> => {
  console.log(`userService: upsertUserDocument called by ${requestingUserUid} for user UID: ${userData.uid}`);
  const userDocRef = doc(db, 'users', userData.uid);

  try {
    const userSnap = await getDoc(userDocRef);
    const payload: any = {
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName,
      role: userData.role,
      photoURL: userData.photoURL || null,
      emailVerified: userData.emailVerified === undefined ? false : userData.emailVerified,
    };

    if (userSnap.exists()) {
      payload.updatedAt = serverTimestamp() as Timestamp;
    } else {
      payload.createdAt = serverTimestamp() as Timestamp;
      payload.updatedAt = serverTimestamp() as Timestamp;
      payload.preferredLanguage = 'en'; // Set default language only for new users
    }

    await setDoc(userDocRef, payload, { merge: true });
    console.log(`userService: User document for UID ${userData.uid} ${userSnap.exists() ? 'updated' : 'created'}.`);
  } catch (error: any) {
    console.error(`userService: Error upserting user document for UID ${userData.uid}:`, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const deleteUserDocument = async (requestingUserUid: string, targetUserUid: string): Promise<void> => {
  console.log(`userService: deleteUserDocument called by ${requestingUserUid} for target UID: ${targetUserUid}`);
  if (requestingUserUid === targetUserUid) {
    throw new Error("Admin cannot delete their own user document through this function.");
  }
  const userDocRef = doc(db, 'users', targetUserUid);
  try {
    await deleteDoc(userDocRef);
    console.log(`userService: User document for UID ${targetUserUid} deleted.`);
  } catch (error: any) {
    console.error(`userService: Error deleting user document for UID ${targetUserUid}:`, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

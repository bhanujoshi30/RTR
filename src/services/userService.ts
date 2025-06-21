
import { db } from '@/lib/firebase';
import type { User, UserRole } from '@/types';
import { collection, query, where, getDocs, orderBy, doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

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
  };
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

export const getUsersByRole = async (role: UserRole): Promise<User[]> => {
  console.log(`userService: getUsersByRole called for role: ${role}`);
  // Query without ordering to avoid composite index
  const q = query(
    usersCollection,
    where('role', '==', role)
  );

  try {
    const querySnapshot = await getDocs(q);
    const usersWithRole = querySnapshot.docs.map(mapDocumentToUser);
    
    // Sort in application code
    usersWithRole.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

    console.log(`userService: Fetched ${usersWithRole.length} users with role '${role}'.`);
    return usersWithRole;
  } catch (error: any) {
    console.error(`userService: Error fetching users with role '${role}':`, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error(`Firestore query for users by role ('${role}') requires an index on 'role'. Please create this in the Firebase console.`);
    }
    throw error;
  }
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

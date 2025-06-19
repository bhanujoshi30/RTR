
'use server';

import { db } from '@/lib/firebase';
import type { User, UserRole } from '@/types';
import { collection, query, where, getDocs, orderBy, doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const usersCollection = collection(db, 'users');
// const ADMIN_EMAIL = 'joshi1bhanu@gmail.com'; // This check is done client-side based on user object

// Helper to map Firestore document to our plain User type
const mapDocumentToUser = (docSnap: any): User => {
  const data = docSnap.data();
  return {
    uid: docSnap.id, // Assuming document ID is the UID
    displayName: data.displayName || null,
    email: data.email || null,
    photoURL: data.photoURL || null,
    emailVerified: data.emailVerified || false, // Ensure this field exists in your Firestore docs or handle default
    role: data.role as UserRole,
    createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : undefined,
    updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : undefined,
  };
};

export const getUsersByRole = async (role: UserRole): Promise<User[]> => {
  console.log(`userService: getUsersByRole called for role: ${role}`);
  const q = query(
    usersCollection,
    where('role', '==', role),
    orderBy('displayName', 'asc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const usersWithRole = querySnapshot.docs.map(mapDocumentToUser);
    console.log(`userService: Fetched ${usersWithRole.length} users with role '${role}'.`);
    return usersWithRole;
  } catch (error: any) {
    console.error(`userService: Error fetching users with role '${role}':`, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error(`Firestore query for users by role ('${role}') and ordered by 'displayName' requires a composite index. Please create it in the Firebase console. The typical fields would be 'role' (ASC) and 'displayName' (ASC). The error message from Firebase usually provides a direct link to create it.`);
    }
    throw error; 
  }
};

export const getAllUsers = async (requestingUserUid: string): Promise<User[]> => {
  // Admin check should ideally be more robust (e.g., checking requestingUserUid's role from Firestore)
  // For now, relies on client-side gatekeeping for admin page access.
  console.log(`userService: getAllUsers called by user: ${requestingUserUid}`);
  const q = query(usersCollection, orderBy('displayName', 'asc'));
  try {
    const querySnapshot = await getDocs(q);
    const allUsers = querySnapshot.docs.map(mapDocumentToUser);
    console.log(`userService: Fetched ${allUsers.length} total users.`);
    return allUsers;
  } catch (error: any)
 {
    console.error(`userService: Error fetching all users:`, error.message, error.code ? `(${error.code})` : '', error.stack);
     if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for all users requires an index on 'displayName' (ASC). Please create it in the Firebase console.");
    }
    throw error;
  }
};

export interface UserDocumentData {
  uid: string; 
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string | null;
  emailVerified?: boolean; // Make sure this is part of the payload if managed
}

export const upsertUserDocument = async (
  requestingUserUid: string, 
  userData: UserDocumentData
): Promise<void> => {
  // Add proper admin check here based on requestingUserUid's role in Firestore
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
      emailVerified: userData.emailVerified === undefined ? false : userData.emailVerified, // Default to false if not provided
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
  // Add proper admin check here
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

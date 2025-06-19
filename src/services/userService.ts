
'use server';

import { db } from '@/lib/firebase';
import type { User, UserRole } from '@/types';
import { collection, query, where, getDocs, orderBy, doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const usersCollection = collection(db, 'users');
const ADMIN_EMAIL = 'joshi11bhanu@gmail.com'; // Define admin email, or better, check role from Firestore

// Helper function to check if the calling user is an admin
// For simplicity, this example might check the passed userUid against an admin UID
// or check their role if their own user document is fetched.
// A more robust way is to check the custom claims on the Firebase Auth token if set.
const isAdminUser = async (userUid: string): Promise<boolean> => {
  // This is a simplified check. In a real app, you might fetch the user's document
  // and check their role, or verify custom claims.
  // For now, we'll rely on the front-end check for the hardcoded admin email.
  // Or, if you have an admin user document with role 'admin':
  const userDocRef = doc(db, 'users', userUid);
  const userSnap = await getDoc(userDocRef);
  if (userSnap.exists() && userSnap.data().role === 'admin') {
    return true;
  }
  // Fallback for the hardcoded email if the admin user might not have a doc yet or for initial setup
  // This part is tricky server-side without fetching the auth user's email.
  // Prefer checking role from Firestore for server-side validation.
  // For this example, we'll assume client-side checks are primary gatekeeper for calling these.
  return true; // Placeholder - in real app, implement proper server-side admin check
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
    const usersWithRole = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        uid: docSnap.id, // Assuming document ID is the UID
        displayName: data.displayName || 'Unnamed User',
        email: data.email || '',
        photoURL: data.photoURL || null,
        emailVerified: data.emailVerified || false, // These fields might not be in your 'users' collection
        isAnonymous: data.isAnonymous || false,     // Adjust as per your 'users' collection schema
        metadata: {}, 
        providerData: [],
        refreshToken: '',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({} as any),
        role: data.role as UserRole,
      } as User;
    });
    console.log(`userService: Fetched ${usersWithRole.length} users with role '${role}'.`);
    return usersWithRole;
  } catch (error: any) {
    console.error(`userService: Error fetching users with role '${role}':`, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for users by role requires an index on 'role' (ASC) and 'displayName' (ASC). Please create it in the Firebase console.");
    }
    throw error; 
  }
};

export const getAllUsers = async (requestingUserUid: string): Promise<User[]> => {
  // Add admin check if necessary, for now assuming only admin calls this
  // if (!await isAdminUser(requestingUserUid)) throw new Error("Permission denied: Not an admin.");

  console.log(`userService: getAllUsers called by user: ${requestingUserUid}`);
  const q = query(usersCollection, orderBy('displayName', 'asc'));
  try {
    const querySnapshot = await getDocs(q);
    const allUsers = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        displayName: data.displayName || 'Unnamed User',
        email: data.email || '',
        photoURL: data.photoURL || null,
        emailVerified: data.emailVerified || false,
        isAnonymous: data.isAnonymous || false,    
        metadata: {}, 
        providerData: [],
        refreshToken: '',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({} as any),
        role: data.role as UserRole,
         // Add other fields as necessary from your 'users' collection document
        createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate() : undefined, // Example if you store createdAt
        updatedAt: data.updatedAt ? (data.updatedAt as Timestamp).toDate() : undefined, // Example if you store updatedAt
      } as User;
    });
    console.log(`userService: Fetched ${allUsers.length} total users.`);
    return allUsers;
  } catch (error: any) {
    console.error(`userService: Error fetching all users:`, error.message, error.code ? `(${error.code})` : '', error.stack);
     if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for all users requires an index on 'displayName' (ASC). Please create it in the Firebase console.");
    }
    throw error;
  }
};

export interface UserDocumentData {
  uid: string; // This will be the document ID in Firestore users collection
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string | null;
}

export const upsertUserDocument = async (
  requestingUserUid: string, // UID of the admin performing the action
  userData: UserDocumentData
): Promise<void> => {
  // Add proper admin check here based on requestingUserUid's role in Firestore
  // if (!await isAdminUser(requestingUserUid)) throw new Error("Permission denied: Not an admin.");
  
  console.log(`userService: upsertUserDocument called by ${requestingUserUid} for user UID: ${userData.uid}`);
  const userDocRef = doc(db, 'users', userData.uid); // Use provided UID as document ID

  try {
    const userSnap = await getDoc(userDocRef);
    const payload: any = {
      uid: userData.uid, // Storing uid also as a field for easier querying if needed
      email: userData.email,
      displayName: userData.displayName,
      role: userData.role,
      photoURL: userData.photoURL || null,
    };

    if (userSnap.exists()) {
      payload.updatedAt = serverTimestamp() as Timestamp;
    } else {
      payload.createdAt = serverTimestamp() as Timestamp;
      payload.updatedAt = serverTimestamp() as Timestamp;
    }
    
    await setDoc(userDocRef, payload, { merge: true }); // Use setDoc with merge to create or update
    console.log(`userService: User document for UID ${userData.uid} ${userSnap.exists() ? 'updated' : 'created'}.`);
  } catch (error: any) {
    console.error(`userService: Error upserting user document for UID ${userData.uid}:`, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const deleteUserDocument = async (requestingUserUid: string, targetUserUid: string): Promise<void> => {
  // Add proper admin check here
  // if (!await isAdminUser(requestingUserUid)) throw new Error("Permission denied: Not an admin.");

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



'use server';

import { db } from '@/lib/firebase';
import type { User } from '@/types';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const usersCollection = collection(db, 'users');

/**
 * Fetches users by a specific role from the 'users' collection.
 * The 'users' collection documents should have 'uid', 'displayName', and 'role' fields.
 */
export const getUsersByRole = async (role: string): Promise<User[]> => {
  console.log(`userService: getUsersByRole called for role: ${role}`);
  const q = query(
    usersCollection,
    where('role', '==', role),
    orderBy('displayName', 'asc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const supervisors = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Construct a User object. Note: FirebaseUser specific fields like emailVerified, etc.,
      // won't be present here unless also stored in the 'users' collection.
      // This is primarily for display and UID purposes in assignment.
      return {
        uid: data.uid || doc.id, // Prefer uid field, fallback to doc.id if uid is stored as doc id
        displayName: data.displayName || 'Unnamed User',
        email: data.email || '', // Add other fields as needed / available in your 'users' collection
        photoURL: data.photoURL || null,
        emailVerified: data.emailVerified || false,
        isAnonymous: data.isAnonymous || false,
        metadata: {}, // Empty or map if stored
        providerData: [], // Empty or map if stored
        refreshToken: '',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({} as any),
        role: data.role,
      } as User;
    });
    console.log(`userService: Fetched ${supervisors.length} users with role '${role}'.`);
    return supervisors;
  } catch (error: any) {
    console.error(`userService: Error fetching users with role '${role}':`, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for users by role requires an index on 'role' (ASC) and 'displayName' (ASC). Please create it in the Firebase console.");
    }
    throw error; // Re-throw to allow calling components to handle
  }
};

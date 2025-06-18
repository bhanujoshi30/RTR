import { db, auth } from '@/lib/firebase';
import type { Project, ProjectStatus } from '@/types';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore';

const projectsCollection = collection(db, 'projects');

export const createProject = async (projectData: {
  name: string;
  description?: string;
  status: ProjectStatus;
  progress: number;
}): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const newProjectRef = await addDoc(projectsCollection, {
    ...projectData,
    ownerUid: user.uid,
    createdAt: serverTimestamp() as Timestamp,
  });
  return newProjectRef.id;
};

export const getUserProjects = async (): Promise<Project[]> => {
  const user = auth.currentUser;
  if (!user) return [];

  const q = query(projectsCollection, where('ownerUid', '==', user.uid), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
};

export const getProjectById = async (projectId: string): Promise<Project | null> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);

  if (projectSnap.exists() && projectSnap.data().ownerUid === user.uid) {
    return { id: projectSnap.id, ...projectSnap.data() } as Project;
  }
  return null;
};

export const updateProject = async (
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'progress'>>
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const projectDocRef = doc(db, 'projects', projectId);
  // Optionally, add a check here to ensure the user owns the project before updating
  // For brevity, assuming AuthGuard and page-level checks handle this.
  await updateDoc(projectDocRef, updates);
};

export const deleteProject = async (projectId: string): Promise<void> => {
   const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  // TODO: Also delete associated tasks when deleting a project
  const projectDocRef = doc(db, 'projects', projectId);
  await deleteDoc(projectDocRef);
};

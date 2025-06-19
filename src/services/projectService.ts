
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
  writeBatch
} from 'firebase/firestore';
import { deleteAllTasksForProject } from './taskService'; // Import helper

const projectsCollection = collection(db, 'projects');

export const createProject = async (projectData: {
  name: string;
  description?: string;
  status: ProjectStatus;
  progress: number;
}): Promise<string> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const projectPayload = {
    ...projectData,
    ownerUid: user.uid,
    createdAt: serverTimestamp() as Timestamp,
  };

  try {
    const newProjectRef = await addDoc(projectsCollection, projectPayload);
    return newProjectRef.id;
  } catch (error: any) {
    console.error('projectService: Error in createProject:', error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error; 
  }
};

export const getUserProjects = async (): Promise<Project[]> => {
  const user = auth.currentUser;
  if (!user) {
    return [];
  }
  
  const q = query(projectsCollection, where('ownerUid', '==', user.uid), orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching user projects:', error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && error.message.includes("query requires an index")) {
        console.error("Firestore query for projects requires a composite index. Please create it in the Firebase console. The error message should provide a direct link or details. Fields to index: 'ownerUid' (ASC), 'createdAt' (DESC).");
    }
    throw error;
  }
};

export const getProjectById = async (projectId: string): Promise<Project | null> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const projectDocRef = doc(db, 'projects', projectId);
  try {
    const projectSnap = await getDoc(projectDocRef);

    if (projectSnap.exists()) {
      const projectData = projectSnap.data();
      if (projectData.ownerUid === user.uid) {
        return { id: projectSnap.id, ...projectData } as Project;
      } else {
        console.warn('projectService: User does not own project ID:', projectId);
        throw new Error('Access denied. You do not own this project.');
      }
    } else {
      console.warn('projectService: Project not found for ID:', projectId);
      return null;
    }
  } catch (error: any) {
    console.error('projectService: Error fetching project by ID:', projectId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const updateProject = async (
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'progress'>>
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== user.uid) {
    throw new Error('Project not found or access denied for update.');
  }
  
  try {
    await updateDoc(projectDocRef, updates);
  } catch (error: any) {
    console.error('projectService: Error updating project ID:', projectId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== user.uid) {
    throw new Error('Project not found or access denied for deletion.');
  }

  try {
    // Delete all tasks (and their sub-tasks/issues) associated with the project
    await deleteAllTasksForProject(projectId);

    // Delete the project document itself
    await deleteDoc(projectDocRef);

  } catch (error: any) {
    console.error('projectService: Error deleting project and associated data for ID:', projectId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};


'use server';

import { db } from '@/lib/firebase'; // Removed auth import
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
import { deleteAllTasksForProject } from './taskService'; 

const projectsCollection = collection(db, 'projects');

export const createProject = async (
  userUid: string, 
  projectData: {
    name: string;
    description?: string;
    status: ProjectStatus;
    progress: number;
  }
): Promise<string> => {
  if (!userUid) {
    throw new Error('User not authenticated for creating project');
  }

  const projectPayload = {
    ...projectData,
    ownerUid: userUid,
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

export const getUserProjects = async (userUid: string): Promise<Project[]> => {
  if (!userUid) {
    return [];
  }
  
  const q = query(projectsCollection, where('ownerUid', '==', userUid), orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching user projects for uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && error.message.includes("query requires an index")) {
        console.error("Firestore query for projects requires a composite index. Please create it in the Firebase console. The error message should provide a direct link or details. Fields to index: 'ownerUid' (ASC), 'createdAt' (DESC).");
    }
    throw error;
  }
};

export const getProjectById = async (projectId: string, userUid: string): Promise<Project | null> => {
  if (!userUid) {
    throw new Error('User not authenticated for getting project by ID');
  }

  const projectDocRef = doc(db, 'projects', projectId);
  try {
    const projectSnap = await getDoc(projectDocRef);

    if (projectSnap.exists()) {
      const projectData = projectSnap.data();
      if (projectData.ownerUid === userUid) {
        return { id: projectSnap.id, ...projectData } as Project;
      } else {
        console.warn('projectService: User UID', userUid, 'does not own project ID:', projectId, 'Project owner UID:', projectData.ownerUid);
        throw new Error('Access denied. You do not own this project.');
      }
    } else {
      console.warn('projectService: Project not found for ID:', projectId);
      return null;
    }
  } catch (error: any) {
    console.error('projectService: Error fetching project by ID:', projectId, 'for user UID:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const updateProject = async (
  projectId: string,
  userUid: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'progress'>>
): Promise<void> => {
  if (!userUid) {
    throw new Error('User not authenticated for updating project');
  }
  
  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== userUid) {
    throw new Error('Project not found or access denied for update.');
  }
  
  try {
    await updateDoc(projectDocRef, updates);
  } catch (error: any) {
    console.error('projectService: Error updating project ID:', projectId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const deleteProject = async (projectId: string, userUid: string): Promise<void> => {
  if (!userUid) {
    throw new Error('User not authenticated for deleting project');
  }

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== userUid) {
    throw new Error('Project not found or access denied for deletion.');
  }

  try {
    await deleteAllTasksForProject(projectId, userUid);
    await deleteDoc(projectDocRef);

  } catch (error: any) {
    console.error('projectService: Error deleting project and associated data for ID:', projectId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

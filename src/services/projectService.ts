
'use server';

import { db } from '@/lib/firebase'; 
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
  documentId,
} from 'firebase/firestore';
import { deleteAllTasksForProject } from './taskService'; 

const projectsCollection = collection(db, 'projects');

const mapDocumentToProject = (docSnapshot: any): Project => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    ...data,
    createdAt: (data.createdAt as Timestamp)?.toDate ? (data.createdAt as Timestamp).toDate() : new Date(data.createdAt),
  } as Project;
};

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
  console.log('projectService: createProject called with data:', projectData);
  console.log('projectService: currentUser:', userUid);

  const projectPayload = {
    ...projectData,
    ownerUid: userUid,
    createdAt: serverTimestamp() as Timestamp,
  };
  console.log('projectService: Payload for Firestore addDoc:', projectPayload);

  try {
    const newProjectRef = await addDoc(projectsCollection, projectPayload);
    console.log('projectService: Firestore addDoc successful. New project Ref ID:', newProjectRef.id);
    return newProjectRef.id;
  } catch (error: any) {
    console.error('projectService: Error in createProject:', error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error; 
  }
};

export const getUserProjects = async (userUid: string): Promise<Project[]> => {
  console.log(`projectService: getUserProjects for user: ${userUid}`);
  if (!userUid) {
    return [];
  }
  
  const q = query(projectsCollection, where('ownerUid', '==', userUid), orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(mapDocumentToProject);
    console.log(`projectService: Fetched ${projects.length} projects for owner.`);
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching user projects for uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && error.message.includes("query requires an index")) {
        console.error("Firestore query for projects requires a composite index. Please create it in the Firebase console. The error message should provide a direct link or details. Fields to index: 'ownerUid' (ASC), 'createdAt' (DESC).");
    }
    throw error;
  }
};

export const getProjectById = async (projectId: string, userUid: string, userRole?: string): Promise<Project | null> => {
  if (!userUid) {
    throw new Error('User not authenticated for getting project by ID');
  }

  const projectDocRef = doc(db, 'projects', projectId);
  try {
    const projectSnap = await getDoc(projectDocRef);

    if (projectSnap.exists()) {
      const projectData = projectSnap.data();
      // Owner can always access. Supervisor can access if they are intended to see it (e.g., due to assigned tasks).
      // The logic determining if a supervisor *should* see a project is handled by the calling component (e.g., Dashboard fetching assigned projects).
      // This function just needs to ensure the project exists. The owner check is for general cases.
      if (projectData.ownerUid === userUid || userRole === 'supervisor' || userRole === 'admin') { 
        return mapDocumentToProject(projectSnap);
      } else {
        console.warn('projectService: User UID', userUid, 'does not own project ID:', projectId, 'Project owner UID:', projectData.ownerUid);
        throw new Error('Access denied. You do not own this project or lack permissions.');
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


export const getProjectsByIds = async (projectIds: string[]): Promise<Project[]> => {
  if (!projectIds || projectIds.length === 0) {
    return [];
  }
  console.log(`projectService: getProjectsByIds for IDs: ${projectIds.join(', ')}`);
  
  // Firestore 'in' query limit is 30 items per query. Chunk if necessary.
  const MAX_IDS_PER_QUERY = 30;
  const projectChunks: string[][] = [];
  for (let i = 0; i < projectIds.length; i += MAX_IDS_PER_QUERY) {
    projectChunks.push(projectIds.slice(i, i + MAX_IDS_PER_QUERY));
  }

  const fetchedProjects: Project[] = [];

  for (const chunk of projectChunks) {
    if (chunk.length === 0) continue;
    const q = query(projectsCollection, where(documentId(), 'in', chunk));
    try {
      const querySnapshot = await getDocs(q);
      const projects = querySnapshot.docs.map(mapDocumentToProject);
      fetchedProjects.push(...projects);
    } catch (error: any) {
      console.error('projectService: Error fetching projects by IDs chunk:', chunk, error.message, error.stack);
      // Decide if one chunk failure should fail all, or try to continue
      throw error; // For now, rethrow
    }
  }
  
  // Sort to maintain some consistency, e.g., by creation date if available, or by name
  fetchedProjects.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

  console.log(`projectService: Fetched ${fetchedProjects.length} projects by IDs.`);
  return fetchedProjects;
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
    // Only owner can update project details
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
     // Only owner can delete project
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

    
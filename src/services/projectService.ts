
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
  console.log('projectService: createProject called with data:', projectData);
  const user = auth.currentUser;
  console.log('projectService: currentUser:', user ? user.uid : 'null');
  
  if (!user) {
    console.error('projectService: User not authenticated for createProject');
    throw new Error('User not authenticated');
  }

  const projectPayload = {
    ...projectData,
    ownerUid: user.uid,
    createdAt: serverTimestamp() as Timestamp,
  };
  console.log('projectService: Payload for Firestore addDoc:', projectPayload);

  try {
    const newProjectRef = await addDoc(projectsCollection, projectPayload);
    console.log('projectService: Firestore addDoc successful. New project Ref ID:', newProjectRef.id);
    return newProjectRef.id;
  } catch (error: any) {
    console.error('projectService: Error calling addDoc in createProject:', error.message, error.stack, error);
    throw error; 
  }
};

export const getUserProjects = async (): Promise<Project[]> => {
  const user = auth.currentUser;
  if (!user) {
    console.log('projectService: getUserProjects - User not authenticated, returning empty array.');
    return [];
  }
  console.log('projectService: getUserProjects for user:', user.uid);

  const q = query(projectsCollection, where('ownerUid', '==', user.uid), orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
    console.log('projectService: Fetched projects:', projects.length);
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching user projects:', error.message, error.stack, error);
    throw error;
  }
};

export const getProjectById = async (projectId: string): Promise<Project | null> => {
  console.log('projectService: getProjectById called for ID:', projectId);
  const user = auth.currentUser;
  if (!user) {
    console.error('projectService: User not authenticated for getProjectById');
    throw new Error('User not authenticated');
  }
  console.log('projectService: getProjectById - Current user:', user.uid);

  const projectDocRef = doc(db, 'projects', projectId);
  try {
    const projectSnap = await getDoc(projectDocRef);

    if (projectSnap.exists()) {
      const projectData = projectSnap.data();
      console.log('projectService: Project found. Owner UID:', projectData.ownerUid);
      if (projectData.ownerUid === user.uid) {
        console.log('projectService: User owns project. Returning project data.');
        return { id: projectSnap.id, ...projectData } as Project;
      } else {
        console.warn('projectService: User does not own project ID:', projectId);
        return null; 
      }
    } else {
      console.warn('projectService: Project not found for ID:', projectId);
      return null;
    }
  } catch (error: any) {
    console.error('projectService: Error fetching project by ID:', projectId, error.message, error.stack, error);
    throw error;
  }
};

export const updateProject = async (
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'status' | 'progress'>>
): Promise<void> => {
  console.log('projectService: updateProject called for ID:', projectId, 'with updates:', updates);
  const user = auth.currentUser;
  if (!user) {
    console.error('projectService: User not authenticated for updateProject');
    throw new Error('User not authenticated');
  }
  
  const projectDocRef = doc(db, 'projects', projectId);
  // You might want to add a check here to ensure the user owns the project before updating
  // For example, call getProjectById and see if it returns a project.
  // For now, assuming higher-level checks or rules handle this.
  console.log('projectService: Attempting to update project document.');
  try {
    await updateDoc(projectDocRef, updates);
    console.log('projectService: Project update successful for ID:', projectId);
  } catch (error: any) {
    console.error('projectService: Error updating project ID:', projectId, error.message, error.stack, error);
    throw error;
  }
};

export const deleteProject = async (projectId: string): Promise<void> => {
  console.log('projectService: deleteProject called for ID:', projectId);
   const user = auth.currentUser;
  if (!user) {
    console.error('projectService: User not authenticated for deleteProject');
    throw new Error('User not authenticated');
  }

  // TODO: Also delete associated tasks when deleting a project
  const projectDocRef = doc(db, 'projects', projectId);
  // Add ownership check here as well before deleting.
  console.log('projectService: Attempting to delete project document.');
  try {
    await deleteDoc(projectDocRef);
    console.log('projectService: Project delete successful for ID:', projectId);
  } catch (error: any) {
    console.error('projectService: Error deleting project ID:', projectId, error.message, error.stack, error);
    throw error;
  }
};

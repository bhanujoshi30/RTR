
import { db } from '@/lib/firebase';
import type { Project, ProjectStatus, Task, UserRole } from '@/types';
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
import { deleteAllTasksForProject, getProjectMainTasks, calculateMainTaskProgress } from './taskService';

const projectsCollection = collection(db, 'projects');

const mapDocumentToProject = (docSnapshot: any): Project => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    name: data.name,
    description: data.description,
    ownerUid: data.ownerUid,
    status: data.status as ProjectStatus, // Initial status from Firestore
    progress: data.progress || 0,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
  };
};

const getDynamicStatusFromProgress = (progress: number): ProjectStatus => {
  if (progress >= 100) {
    return 'Completed';
  } else if (progress > 0) {
    return 'In Progress';
  } else {
    return 'Not Started';
  }
};

const calculateProjectProgress = async (projectId: string, userUid: string, userRole?: UserRole): Promise<number> => {
  const mainTasks = await getProjectMainTasks(projectId);
  if (mainTasks.length === 0) {
    return 0;
  }

  const progressValues = await Promise.all(
    mainTasks.map(task => calculateMainTaskProgress(task.id, userUid, userRole))
  );

  const totalProgressSum = progressValues.reduce((sum, progress) => sum + progress, 0);
  return Math.round(totalProgressSum / mainTasks.length);
};


export const createProject = async (
  userUid: string,
  projectData: {
    name: string;
    description?: string;
    // status is no longer passed from form
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
    progress: 0, // Initial progress is 0
    status: 'Not Started' as ProjectStatus, // Initial status
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

export const getUserProjects = async (userUid: string, userRole?: UserRole): Promise<Project[]> => {
  console.log(`projectService: getUserProjects for user: ${userUid}`);
  if (!userUid) {
    return [];
  }

  const q = query(projectsCollection, where('ownerUid', '==', userUid), orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projectsPromises = querySnapshot.docs.map(async (docSnap) => {
      const project = mapDocumentToProject(docSnap);
      project.progress = await calculateProjectProgress(project.id, userUid, userRole);
      project.status = getDynamicStatusFromProgress(project.progress); // Set dynamic status
      return project;
    });
    const projects = await Promise.all(projectsPromises);
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

export const getProjectById = async (projectId: string, userUid: string, userRole?: UserRole): Promise<Project | null> => {
  if (!userUid) {
    throw new Error('User not authenticated for getting project by ID');
  }

  const projectDocRef = doc(db, 'projects', projectId);
  try {
    const projectSnap = await getDoc(projectDocRef);

    if (projectSnap.exists()) {
      const projectData = mapDocumentToProject(projectSnap);
      projectData.progress = await calculateProjectProgress(projectId, userUid, userRole);
      projectData.status = getDynamicStatusFromProgress(projectData.progress); // Set dynamic status
      // If getDoc succeeds, we assume access is granted by security rules.
      return projectData;
    } else {
      console.warn('projectService: Project not found for ID:', projectId);
      return null;
    }
  } catch (error: any) {
    console.error(`projectService: Error fetching project by ID ${projectId}.`, error);
    if ((error as any)?.code === 'permission-denied') {
        throw new Error(`Access denied to project ${projectId}. Check Firestore security rules.`);
    }
    throw error;
  }
};


export const getProjectsByIds = async (projectIds: string[], userUid: string, userRole?: UserRole): Promise<Project[]> => {
  if (!projectIds || projectIds.length === 0) {
    return [];
  }
  console.log(`projectService: getProjectsByIds for IDs: ${projectIds.join(', ')}`);

  const MAX_IDS_PER_QUERY = 30;
  const projectChunks: string[][] = [];
  for (let i = 0; i < projectIds.length; i += MAX_IDS_PER_QUERY) {
    projectChunks.push(projectIds.slice(i, i + MAX_IDS_PER_QUERY));
  }

  let fetchedProjectsMapped: Project[] = [];

  for (const chunk of projectChunks) {
    if (chunk.length === 0) continue;
    const q = query(projectsCollection, where(documentId(), 'in', chunk));
    try {
      const querySnapshot = await getDocs(q);
      const projectsFromChunk = querySnapshot.docs.map(mapDocumentToProject);
      fetchedProjectsMapped.push(...projectsFromChunk);
    } catch (error: any) {
      console.error('projectService: Error fetching projects by IDs chunk:', chunk, error.message, error.stack);
      throw error;
    }
  }
  
  const projectsWithProgressAndStatusPromises = fetchedProjectsMapped.map(async (project) => {
    project.progress = await calculateProjectProgress(project.id, userUid, userRole);
    project.status = getDynamicStatusFromProgress(project.progress); // Set dynamic status
    return project;
  });
  const fetchedProjects = await Promise.all(projectsWithProgressAndStatusPromises);


  fetchedProjects.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

  console.log(`projectService: Fetched ${fetchedProjects.length} projects by IDs with calculated progress and status.`);
  return fetchedProjects;
};


export const updateProject = async (
  projectId: string,
  userUid: string,
  updates: Partial<Pick<Project, 'name' | 'description'>> // Status and Progress removed
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
    // Status and progress are not updated here directly; they are dynamic
    await updateDoc(projectDocRef, {...updates, updatedAt: serverTimestamp() as Timestamp});
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

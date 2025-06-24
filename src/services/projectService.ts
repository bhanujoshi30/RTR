
import { db, storage } from '@/lib/firebase';
import type { Project, ProjectStatus, Task, UserRole, TaskStatus } from '@/types';
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
  limit,
  arrayUnion,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { deleteAllTasksForProject, getProjectMainTasks, getAllProjectTasks, mapDocumentToTask } from '@/services/taskService';
import { differenceInCalendarDays } from 'date-fns';

const projectsCollection = collection(db, 'projects');

export const uploadProjectPhoto = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const uniqueFilename = `${Date.now()}-${file.name}`;
    const filePath = `project-photos/${uniqueFilename}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {},
      (error) => {
        console.error('Project photo upload failed:', error);
        reject(error);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref)
          .then((downloadURL) => {
            resolve(downloadURL);
          })
          .catch((error) => {
            console.error('Failed to get download URL for project photo:', error);
            reject(error);
          });
      }
    );
  });
};


export const mapDocumentToProject = (docSnapshot: any): Project => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    name: data.name,
    description: data.description,
    ownerUid: data.ownerUid,
    clientUid: data.clientUid || null,
    clientName: data.clientName || null,
    status: data.status as ProjectStatus, 
    progress: data.progress || 0,
    photoURL: data.photoURL || null,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
    totalCost: data.totalCost || 0,
    memberUids: data.memberUids || [],
  };
};

export const createProject = async (
  userUid: string,
  projectData: {
    name: string;
    description?: string;
    photoURL?: string | null;
    clientUid?: string | null;
    clientName?: string | null;
  }
): Promise<string> => {
  if (!userUid) {
    throw new Error('User not authenticated for creating project');
  }

  const projectPayload = {
    ...projectData,
    ownerUid: userUid,
    createdAt: serverTimestamp() as Timestamp,
    progress: 0,
    status: 'Not Started' as ProjectStatus,
    photoURL: projectData.photoURL || null,
    clientUid: projectData.clientUid || null,
    clientName: projectData.clientName || null,
    memberUids: [],
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
  if (!userUid) return [];

  const q = query(projectsCollection, where('ownerUid', '==', userUid), orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(mapDocumentToProject);
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching user projects for uid:', userUid, error.message, error.stack);
    throw error;
  }
};

export const getAllProjects = async (userUid: string): Promise<Project[]> => {
  const userDocRef = doc(db, 'users', userUid);
  const userSnap = await getDoc(userDocRef);
  if (!userSnap.exists() || userSnap.data().role !== 'admin') {
    throw new Error('Access denied. Only admins can fetch all projects.');
  }

  const q = query(projectsCollection, orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(mapDocumentToProject);
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching all projects:', error.message, error.stack);
    throw error;
  }
};

export const getClientProjects = async (clientUid: string): Promise<Project[]> => {
  if (!clientUid) return [];

  const q = query(projectsCollection, where('clientUid', '==', clientUid), orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(mapDocumentToProject);
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching client projects for uid:', clientUid, error.message, error.stack);
    if (error.message.includes('index')) {
        console.error("A Firestore index on 'clientUid' (ASC) and 'createdAt' (DESC) is required for this query to work.");
    }
    throw error;
  }
};

export const getMemberProjects = async (memberUid: string): Promise<Project[]> => {
  if (!memberUid) return [];

  const q = query(projectsCollection, where('memberUids', 'array-contains', memberUid), orderBy('createdAt', 'desc'));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(mapDocumentToProject);
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching member projects for uid:', memberUid, error.message, error.stack);
    if (error.message.includes('index')) {
        console.error("A Firestore index on 'memberUids' (array-contains) and 'createdAt' (DESC) is required for this query to work.");
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
      return projectData;
    } else {
      console.warn(`projectService: Project with ID '${projectId}' not found or user '${userUid}' lacks permission.`);
      return null;
    }
  } catch (error: any) {
    console.error(`projectService: Error fetching project by ID ${projectId}.`, error);
    throw error;
  }
};


export const updateProject = async (
  projectId: string,
  userUid: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'photoURL' | 'clientUid' | 'clientName'>>
): Promise<void> => {
  if (!userUid) {
    throw new Error('User not authenticated for updating project');
  }

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || (projectSnap.data().ownerUid !== userUid && !(await getDoc(doc(db, 'users', userUid))).data()?.role === 'admin') ) {
    throw new Error('Project not found or access denied for update.');
  }

  try {
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
  if (!projectSnap.exists() || (projectSnap.data().ownerUid !== userUid && !(await getDoc(doc(db, 'users', userUid))).data()?.role === 'admin') ) {
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

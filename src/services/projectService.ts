
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
      (snapshot) => {
        // Optional: report progress
        // const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      },
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

const processProjectList = async (projectsFromDb: Project[], userContext: { uid: string, role: 'owner' | 'client' | 'member' | 'supervisor' }): Promise<Project[]> => {
    if (projectsFromDb.length === 0) {
        return [];
    }

    const projectIds = projectsFromDb.map(p => p.id);
    const allTasksByProject = new Map<string, Task[]>();
    
    const taskChunks: string[][] = [];
    for (let i = 0; i < projectIds.length; i += 30) {
      taskChunks.push(projectIds.slice(i, i + 30));
    }

    for (const chunk of taskChunks) {
        if (chunk.length === 0) continue;
        
        let tasksQuery;
        if (userContext.role === 'owner' || userContext.role === 'client') {
             tasksQuery = query(collection(db, 'tasks'), where('projectId', 'in', chunk));
        } else { // member or supervisor
             tasksQuery = query(collection(db, 'tasks'), where('projectId', 'in', chunk), where('assignedToUids', 'array-contains', userContext.uid));
        }
        
        try {
            const tasksSnapshot = await getDocs(tasksQuery);
            tasksSnapshot.forEach(doc => {
                const task: Task = mapDocumentToTask(doc);
                const tasks = allTasksByProject.get(task.projectId) || [];
                tasks.push(task);
                allTasksByProject.set(task.projectId, tasks);
            });
        } catch(error: any) {
            console.error(`projectService: Failed to process task chunk for role ${userContext.role}`, error);
            // Don't rethrow, just continue so the dashboard can load projects without stats
        }
    }

    const projectsWithDetails = projectsFromDb.map(project => {
      const projectTasks = allTasksByProject.get(project.id) || [];
      const mainTasks = projectTasks.filter(t => !t.parentId);
      const standardMainTasks = mainTasks.filter(mt => mt.taskType !== 'collection');
      
      if (standardMainTasks.length > 0) {
        const totalProgressSum = standardMainTasks.reduce((sum, task) => {
            const subTasks = projectTasks.filter(t => t.parentId === task.id);
            if (subTasks.length === 0) return sum;
            const completedSubTasks = subTasks.filter(st => st.status === 'Completed').length;
            const mainTaskProgress = Math.round((completedSubTasks / subTasks.length) * 100);
            return sum + mainTaskProgress;
        }, 0);
        project.progress = Math.round(totalProgressSum / standardMainTasks.length);
      } else {
        project.progress = 0;
      }
      
      const hasPendingCollectionTasks = mainTasks.some(task => task.taskType === 'collection' && task.status !== 'Completed');
      if (project.progress >= 100) {
          project.status = hasPendingCollectionTasks ? 'Payment Incomplete' : 'Completed';
      } else if (project.progress > 0) {
          project.status = 'In Progress';
      } else {
          project.status = 'Not Started';
      }

      project.totalCost = mainTasks.filter(t => t.taskType === 'collection').reduce((sum, task) => sum + (task.cost || 0), 0);

      const now = new Date();
      project.hasUpcomingReminder = mainTasks.some(task => {
        if (task.taskType !== 'collection' || task.status === 'Completed' || !task.dueDate || !task.reminderDays) {
          return false;
        }
        const daysRemaining = differenceInCalendarDays(task.dueDate, now);
        return daysRemaining >= 0 && daysRemaining <= task.reminderDays;
      });

      return project;
    });

    projectsWithDetails.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return projectsWithDetails;
}

export const getUserProjects = async (userUid: string, userRole?: UserRole): Promise<Project[]> => {
  if (!userUid) return [];

  const q = query(projectsCollection, where('ownerUid', '==', userUid));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(mapDocumentToProject);
    projects.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching user projects for uid:', userUid, error.message, error.stack);
    throw error;
  }
};

export const getClientProjects = async (clientUid: string): Promise<Project[]> => {
  if (!clientUid) return [];

  const q = query(projectsCollection, where('clientUid', '==', clientUid));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(mapDocumentToProject);
    projects.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching client projects for uid:', clientUid, error.message, error.stack);
    if (error.message.includes('index')) {
        console.error("A Firestore index on 'clientUid' is required for this query to work.");
    }
    throw error;
  }
};

export const getMemberProjects = async (memberUid: string): Promise<Project[]> => {
  if (!memberUid) return [];

  const q = query(projectsCollection, where('memberUids', 'array-contains', memberUid));
  try {
    const querySnapshot = await getDocs(q);
    const projects = querySnapshot.docs.map(mapDocumentToProject);
    projects.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching member projects for uid:', memberUid, error.message, error.stack);
    if (error.message.includes('index')) {
        console.error("A Firestore index on 'memberUids' (array-contains) is required for this query to work.");
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
      // This can happen if the document doesn't exist OR if security rules deny access.
      // Firestore does not distinguish between the two for security reasons.
      console.warn(`projectService: Project with ID '${projectId}' not found or user '${userUid}' lacks permission.`);
      return null;
    }
  } catch (error: any) {
    // This block will now more reliably catch actual network errors or misconfigurations.
    // Permission errors on a direct `get` are often returned as a "not found" state.
    console.error(`projectService: Error fetching project by ID ${projectId}.`, error);
    throw error;
  }
};


export const getProjectsByIds = async (projectIds: string[], userUid: string, userRole?: UserRole): Promise<Project[]> => {
  if (!projectIds || projectIds.length === 0) {
    return [];
  }

  const projectPromises = projectIds.map(id => 
    getProjectById(id, userUid, userRole).catch(err => {
      console.error(`Failed to fetch project ${id} within getProjectsByIds`, err);
      return null;
    })
  );

  const projects = await Promise.all(projectPromises);
  
  const validProjects = projects.filter((p): p is Project => p !== null);
  
  validProjects.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

  return validProjects;
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
  // Re-check permissions on the client side before writing, although rules are the source of truth
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
  // Re-check permissions on the client side before writing
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

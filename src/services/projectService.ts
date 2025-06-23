
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


const mapDocumentToProject = (docSnapshot: any): Project => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    name: data.name,
    description: data.description,
    ownerUid: data.ownerUid,
    clientUid: data.clientUid || null,
    clientName: data.clientName || null,
    status: data.status as ProjectStatus, // Initial status from Firestore
    progress: data.progress || 0,
    photoURL: data.photoURL || null,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
    totalCost: data.totalCost || 0,
    memberUids: data.memberUids || [],
  };
};

const getDynamicStatusFromProgress = (progress: number, allMainTasks: Task[]): ProjectStatus => {
  if (progress >= 100) {
    // Check for any collection tasks that are not yet marked as 'Completed'.
    const hasPendingCollectionTasks = allMainTasks.some(
      (task) => task.taskType === 'collection' && task.status !== 'Completed'
    );
    if (hasPendingCollectionTasks) {
      return 'Payment Incomplete';
    }
    return 'Completed';
  } else if (progress > 0) {
    return 'In Progress';
  } else {
    return 'Not Started';
  }
};

const calculateProjectProgress = async (projectId: string, mainTasks?: Task[]): Promise<number> => {
  const allMainTasks = mainTasks || await getProjectMainTasks(projectId);
  
  // Filter out collection tasks from the progress calculation
  const standardMainTasks = allMainTasks.filter(task => task.taskType !== 'collection');

  if (standardMainTasks.length === 0) {
    return 0;
  }
  
  const totalProgressSum = standardMainTasks.reduce((sum, task) => sum + (task.progress || 0), 0);
  return Math.round(totalProgressSum / standardMainTasks.length);
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
  console.log('projectService: createProject called with data:', projectData);
  console.log('projectService: currentUser:', userUid);

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

const processProjectList = async (projectsFromDb: Project[]): Promise<Project[]> => {
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
        const tasksQuery = query(collection(db, 'tasks'), where('projectId', 'in', chunk));
        const tasksSnapshot = await getDocs(tasksQuery);
        tasksSnapshot.forEach(doc => {
            const task: Task = mapDocumentToTask(doc);
            const tasks = allTasksByProject.get(task.projectId) || [];
            tasks.push(task);
            allTasksByProject.set(task.projectId, tasks);
        });
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
        project.progress = standardMainTasks.length > 0 ? 100 : 0;
        const allStandardTasksDone = standardMainTasks.every(t => t.status === 'Completed');
        if(standardMainTasks.length > 0 && allStandardTasksDone) {
            project.progress = 100;
        } else if (standardMainTasks.length === 0) {
            project.progress = 0;
        }
      }
      
      project.status = getDynamicStatusFromProgress(project.progress, mainTasks);
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
  console.log(`projectService: getUserProjects for user: ${userUid}`);
  if (!userUid) return [];

  const q = query(projectsCollection, where('ownerUid', '==', userUid));
  try {
    const querySnapshot = await getDocs(q);
    const projectsFromDb = querySnapshot.docs.map(mapDocumentToProject);
    const projects = await processProjectList(projectsFromDb);
    console.log(`projectService: Fetched ${projects.length} projects for owner.`);
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching user projects for uid:', userUid, error.message, error.stack);
    throw error;
  }
};

export const getClientProjects = async (clientUid: string): Promise<Project[]> => {
  console.log(`projectService: getClientProjects for client: ${clientUid}`);
  if (!clientUid) return [];

  const q = query(projectsCollection, where('clientUid', '==', clientUid));
  try {
    const querySnapshot = await getDocs(q);
    const projectsFromDb = querySnapshot.docs.map(mapDocumentToProject);
    const projects = await processProjectList(projectsFromDb);
    console.log(`projectService: Fetched ${projects.length} projects for client with details.`);
    return projects;
  } catch (error: any) {
    console.error('projectService: Error fetching client projects for uid:', clientUid, error.message, error.stack);
    if (error.message.includes('index')) {
        console.error("A Firestore index on 'clientUid' is required for this query to work.");
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
      
      const isOwner = projectData.ownerUid === userUid;
      const isClient = projectData.clientUid === userUid;
      const isAdmin = userRole === 'admin';
      const isServiceCall = userUid === 'dpr-service-call';
      const isMember = projectData.memberUids?.includes(userUid) ?? false;

      if (!isOwner && !isClient && !isAdmin && !isServiceCall && !isMember) {
            throw new Error(`Access denied to project ${projectId}. User is not owner, client, admin, or member.`);
      }
      
      const mainTasks = await getProjectMainTasks(projectId);
      projectData.progress = await calculateProjectProgress(projectId, mainTasks);
      projectData.status = getDynamicStatusFromProgress(projectData.progress, mainTasks);
      projectData.totalCost = mainTasks.filter(t => t.taskType === 'collection').reduce((sum, task) => sum + (task.cost || 0), 0);
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
  
  const projectsWithDetailsPromises = fetchedProjectsMapped.map(async (project) => {
    const mainTasks = await getProjectMainTasks(project.id);
    project.progress = await calculateProjectProgress(project.id, mainTasks);
    project.status = getDynamicStatusFromProgress(project.progress, mainTasks);
    project.totalCost = mainTasks.filter(task => task.taskType === 'collection').reduce((sum, task) => sum + (task.cost || 0), 0);
    return project;
  });
  const fetchedProjects = await Promise.all(projectsWithDetailsPromises);


  fetchedProjects.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

  console.log(`projectService: Fetched ${fetchedProjects.length} projects by IDs with calculated progress and status.`);
  return fetchedProjects;
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
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== userUid) {
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


import { db } from '@/lib/firebase'; // Removed auth import
import type { Task, TaskStatus } from '@/types';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { deleteIssuesForTask } from './issueService'; // Ensure this service also accepts userUid if needed for its internal checks

const tasksCollection = collection(db, 'tasks');

// Interface for task creation data, accommodating both main and sub-tasks
interface CreateTaskData {
  name: string;
  description?: string; // Optional, mainly for sub-tasks
  status?: TaskStatus;    // Optional, mainly for sub-tasks
  dueDate?: Timestamp | Date | null; // Allow Date for easier input, convert to Timestamp
  parentId?: string | null;
}

export const createTask = async (
  projectId: string,
  userUid: string, // Added userUid
  taskData: CreateTaskData
): Promise<string> => {
  if (!userUid) throw new Error('User not authenticated for creating task');

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== userUid) {
    throw new Error('Project not found or access denied for creating task.');
  }
  
  const newTaskPayload: any = {
    projectId,
    ownerUid: userUid,
    name: taskData.name,
    parentId: taskData.parentId || null,
    createdAt: serverTimestamp() as Timestamp,
    // Fields primarily for sub-tasks, or main tasks if explicitly designed so
    description: taskData.description || '',
    status: taskData.status || 'To Do', // Default for sub-tasks or if main tasks have status
  };

  if (taskData.dueDate) {
    newTaskPayload.dueDate = taskData.dueDate instanceof Date ? Timestamp.fromDate(taskData.dueDate) : taskData.dueDate;
  } else {
    newTaskPayload.dueDate = null;
  }
  
  // If it's a main task, conceptual status is 'To Do' or derived, description and dueDate are less relevant directly on it
  if (!taskData.parentId) {
    newTaskPayload.status = 'To Do'; // Or a conceptual status like 'Container'
    // Main tasks usually don't have their own description or due date in this model
    delete newTaskPayload.description; // Or set to empty if schema requires
    delete newTaskPayload.dueDate;   // Or set to null if schema requires
  }


  try {
    const newTaskRef = await addDoc(tasksCollection, newTaskPayload);
    return newTaskRef.id;
  } catch (error) {
    console.error('taskService: Error creating task:', error);
    throw error;
  }
};

export const getProjectMainTasks = async (projectId: string, userUid: string): Promise<Task[]> => {
  if (!userUid) return [];

  const q = query(
    tasksCollection,
    where('projectId', '==', projectId),
    where('ownerUid', '==', userUid),
    where('parentId', '==', null),
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching main project tasks for projectId:', projectId, 'uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for main tasks requires an index on projectId, ownerUid, parentId, createdAt. Check Firebase console for link.");
    }
    throw error;
  }
};

export const getSubTasks = async (parentId: string, userUid: string): Promise<Task[]> => {
  if (!userUid) return [];

  const q = query(
    tasksCollection,
    where('parentId', '==', parentId),
    where('ownerUid', '==', userUid),
    orderBy('createdAt', 'asc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching sub-tasks for parentId:', parentId, 'uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
       console.error("Firestore query for sub-tasks requires an index on parentId, ownerUid, createdAt. Check Firebase console for link.");
    }
    throw error;
  }
};


export const getTaskById = async (taskId: string, userUid: string): Promise<Task | null> => {
  if (!userUid) throw new Error('User not authenticated for getting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);

  if (taskSnap.exists() && taskSnap.data().ownerUid === userUid) {
    return { id: taskSnap.id, ...taskSnap.data() } as Task;
  }
  return null;
};

interface UpdateTaskData {
    name?: string;
    description?: string;
    status?: TaskStatus;
    dueDate?: Timestamp | Date | null; // Allow Date for easier input
    // parentId should not be updatable directly via this generic update, handle re-parenting separately if needed
}

export const updateTask = async (
  taskId: string,
  userUid: string, // Added userUid
  updates: UpdateTaskData
): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== userUid) {
    throw new Error('Task not found or access denied for update.');
  }

  const taskData = taskSnap.data() as Task;
  const updatePayload: any = { ...updates };
  
  if (updates.dueDate) {
    updatePayload.dueDate = updates.dueDate instanceof Date ? Timestamp.fromDate(updates.dueDate) : updates.dueDate;
  } else if (updates.dueDate === null) {
     updatePayload.dueDate = null;
  }


  // If it's a main task, only allow name update
  if (!taskData.parentId) {
    const { name, ...otherUpdates } = updates; // Destructure to isolate name
    const restrictedUpdates: Partial<Pick<Task, 'name'>> = {};
    if (name !== undefined) restrictedUpdates.name = name;
    
    if (Object.keys(otherUpdates).filter(k => k !== 'name' && (otherUpdates as any)[k] !== undefined).length > 0) {
       console.warn("Attempting to update restricted fields for a main task. Only 'name' is allowed through this path.");
    }
    if (Object.keys(restrictedUpdates).length > 0) {
        await updateDoc(taskDocRef, restrictedUpdates);
    }
    return;
  }
  
  // For sub-tasks, allow all provided updates from UpdateTaskData
  await updateDoc(taskDocRef, updatePayload);
};

export const updateTaskStatus = async (taskId: string, userUid: string, status: TaskStatus): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task status');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== userUid) {
    throw new Error('Task not found or access denied for status update.');
  }
  if (taskSnap.data().parentId) { // Only applies to sub-tasks
    await updateDoc(taskDocRef, { status });
  } else {
    console.warn(`Attempted to update status for main task ${taskId}, which is not directly applicable.`);
  }
};

export const deleteTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== userUid) {
    throw new Error('Task not found or access denied for deletion.');
  }

  const taskData = taskSnap.data() as Task;
  const batch = writeBatch(db);

  batch.delete(taskDocRef);
  await deleteIssuesForTask(taskId, userUid); // Delete issues associated with this task (main or sub)

  if (!taskData.parentId) { // If it's a main task, delete its sub-tasks
    const subTasks = await getSubTasks(taskId, userUid);
    for (const subTask of subTasks) {
      batch.delete(doc(db, 'tasks', subTask.id));
      await deleteIssuesForTask(subTask.id, userUid); // Delete issues for each sub-task
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    console.error(`Error deleting task ${taskId} and/or its related data:`, error);
    throw error;
  }
};

export const deleteAllTasksForProject = async (projectId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error("User not authenticated for deleting all project tasks");

  const mainTasksQuery = query(
    tasksCollection,
    where("projectId", "==", projectId),
    where("ownerUid", "==", userUid),
    where("parentId", "==", null)
  );
  
  const mainTasksSnapshot = await getDocs(mainTasksQuery);
  for (const mainTaskDoc of mainTasksSnapshot.docs) {
    await deleteTask(mainTaskDoc.id, userUid); 
  }
};

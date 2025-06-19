
import { db, auth } from '@/lib/firebase';
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
import { deleteIssuesForTask } from './issueService';

const tasksCollection = collection(db, 'tasks');

export const createTask = async (
  projectId: string,
  taskData: {
    name: string;
    description?: string;
    status: TaskStatus;
    dueDate?: Timestamp | null;
    parentId?: string | null;
  }
): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== user.uid) {
    throw new Error('Project not found or access denied.');
  }

  const newTaskDataPayload: any = {
    projectId,
    ownerUid: user.uid,
    name: taskData.name,
    parentId: taskData.parentId || null,
    createdAt: serverTimestamp() as Timestamp,
  };

  // Only add these fields if it's a sub-task or if they are explicitly provided
  // For main tasks, these might be omitted or set to defaults if needed by the schema
  if (taskData.parentId || taskData.description !== undefined) {
    newTaskDataPayload.description = taskData.description || '';
  }
  if (taskData.parentId || taskData.status !== undefined) {
    newTaskDataPayload.status = taskData.status;
  }
  if (taskData.parentId || taskData.dueDate !== undefined) {
    newTaskDataPayload.dueDate = taskData.dueDate || null;
  }
  
  // If it's a main task (no parentId), ensure status defaults to 'To Do' if not set (though it shouldn't apply)
  if (!taskData.parentId && !newTaskDataPayload.status) {
    newTaskDataPayload.status = 'To Do'; // Default status, though main tasks conceptually don't have one
  }


  try {
    const newTaskRef = await addDoc(tasksCollection, newTaskDataPayload);
    return newTaskRef.id;
  } catch (error) {
    console.error('taskService: Error creating task:', error);
    throw error;
  }
};

// Fetches only main tasks for a project
export const getProjectMainTasks = async (projectId: string): Promise<Task[]> => {
  const user = auth.currentUser;
  if (!user) return [];

  const q = query(
    tasksCollection,
    where('projectId', '==', projectId),
    where('ownerUid', '==', user.uid),
    where('parentId', '==', null), // Only main tasks
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching main project tasks for projectId:', projectId, 'uid:', user.uid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for main tasks requires an index on projectId, ownerUid, parentId, createdAt. Check Firebase console for link.");
    }
    throw error;
  }
};

// Fetches sub-tasks for a given main task
export const getSubTasks = async (parentId: string): Promise<Task[]> => {
  const user = auth.currentUser;
  if (!user) return [];

  const q = query(
    tasksCollection,
    where('parentId', '==', parentId),
    where('ownerUid', '==', user.uid),
    orderBy('createdAt', 'asc') // Or 'asc' if you prefer older subtasks first
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching sub-tasks for parentId:', parentId, 'uid:', user.uid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
       console.error("Firestore query for sub-tasks requires an index on parentId, ownerUid, createdAt. Check Firebase console for link.");
    }
    throw error;
  }
};


export const getTaskById = async (taskId: string): Promise<Task | null> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);

  if (taskSnap.exists() && taskSnap.data().ownerUid === user.uid) {
    return { id: taskSnap.id, ...taskSnap.data() } as Task;
  }
  return null;
};


export const updateTask = async (
  taskId: string,
  updates: Partial<Pick<Task, 'name' | 'description' | 'status' | 'dueDate' | 'parentId'>>
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== user.uid) {
    throw new Error('Task not found or access denied for update.');
  }

  const taskData = taskSnap.data() as Task;
  const updatePayload: any = { ...updates };

  // If it's a main task, only allow name update for now
  if (!taskData.parentId && !updates.parentId) { // Check if it is and remains a main task
    const { name, ...otherUpdates } = updates;
    const restrictedUpdates: Partial<Pick<Task, 'name'>> = { name };
     if (Object.keys(otherUpdates).some(key => !['name', 'parentId'].includes(key as keyof Task))) {
       console.warn("Attempting to update restricted fields for a main task. Only 'name' is allowed.");
    }
    await updateDoc(taskDocRef, restrictedUpdates);
    return;
  }
  
  // For sub-tasks, allow all provided updates
  await updateDoc(taskDocRef, updatePayload);
};

export const updateTaskStatus = async (taskId: string, status: TaskStatus): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== user.uid) {
    throw new Error('Task not found or access denied for status update.');
  }
  // Main tasks conceptually don't have a status, this applies to sub-tasks
  if (taskSnap.data().parentId) {
    await updateDoc(taskDocRef, { status });
  } else {
    console.warn(`Attempted to update status for main task ${taskId}, which is not applicable.`);
  }
};

export const deleteTask = async (taskId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== user.uid) {
    throw new Error('Task not found or access denied for deletion.');
  }

  const taskData = taskSnap.data() as Task;
  const batch = writeBatch(db);

  // Delete the task itself
  batch.delete(taskDocRef);

  // Delete associated issues (for this task, which could be a main task or sub-task)
  // issueService's deleteIssuesForTask handles this fine
  await deleteIssuesForTask(taskId); // This needs to be awaited before batch commit if issues are deleted separately.
                                   // For simplicity, we'll assume deleteIssuesForTask makes its own writes or we adjust.
                                   // Let's ensure deleteIssuesForTask is robust or adapt.
                                   // For now, this is a separate operation.

  // If it's a main task, also delete all its sub-tasks and their issues
  if (!taskData.parentId) {
    const subTasks = await getSubTasks(taskId);
    for (const subTask of subTasks) {
      batch.delete(doc(db, 'tasks', subTask.id));
      // Also delete issues for each sub-task
      await deleteIssuesForTask(subTask.id); // This is also separate, consider batching if possible or accept multiple operations.
    }
  }

  try {
    await batch.commit(); // Commit batched deletes (task, and sub-tasks if main)
    // Issues are deleted in separate operations by deleteIssuesForTask.
  } catch (error) {
    console.error(`Error deleting task ${taskId} and/or its related data:`, error);
    throw error;
  }
};

// Helper to delete all tasks and their sub-tasks/issues for a project
export const deleteAllTasksForProject = async (projectId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  const mainTasksQuery = query(
    tasksCollection,
    where("projectId", "==", projectId),
    where("ownerUid", "==", user.uid),
    where("parentId", "==", null)
  );
  
  const mainTasksSnapshot = await getDocs(mainTasksQuery);
  for (const mainTaskDoc of mainTasksSnapshot.docs) {
    await deleteTask(mainTaskDoc.id); // deleteTask will handle sub-tasks and issues
  }
};

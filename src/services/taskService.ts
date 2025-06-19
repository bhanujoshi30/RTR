
'use server';

import { db } from '@/lib/firebase';
import type { Task, TaskStatus, UserRole } from '@/types';
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

interface CreateTaskData {
  name: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: Date | null;
  parentId?: string | null;
  assignedToUids?: string[] | null;
  assignedToNames?: string[] | null;
}

const mapDocumentToTask = (docSnapshot: any): Task => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    projectId: data.projectId,
    parentId: data.parentId || null,
    name: data.name,
    description: data.description || '',
    status: data.status as TaskStatus,
    ownerUid: data.ownerUid,
    assignedToUids: data.assignedToUids || [],
    assignedToNames: data.assignedToNames || [],
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
    dueDate: data.dueDate ? (data.dueDate instanceof Timestamp ? data.dueDate.toDate() : new Date(data.dueDate)) : null,
    updatedAt: data.updatedAt ? (data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt)) : undefined,
  };
};

export const createTask = async (
  projectId: string,
  userUid: string,
  taskData: CreateTaskData
): Promise<string> => {
  if (!userUid) throw new Error('User not authenticated for creating task');

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);

  if (!projectSnap.exists() || projectSnap.data()?.ownerUid !== userUid) {
    throw new Error('Project not found or access denied for creating task.');
  }

  const newTaskPayload: any = {
    projectId,
    ownerUid: userUid,
    name: taskData.name,
    parentId: taskData.parentId || null,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
    description: taskData.description || '',
    status: taskData.status || 'To Do',
    assignedToUids: taskData.assignedToUids || [],
    assignedToNames: taskData.assignedToNames || [],
  };

  if (taskData.dueDate) {
    newTaskPayload.dueDate = Timestamp.fromDate(taskData.dueDate);
  } else {
    newTaskPayload.dueDate = null;
  }
  
  if (!taskData.parentId) { // Main task defaults
     newTaskPayload.status = 'To Do'; 
     delete newTaskPayload.description; 
     delete newTaskPayload.dueDate; 
     delete newTaskPayload.assignedToUids;
     delete newTaskPayload.assignedToNames;
  }


  try {
    const newTaskRef = await addDoc(tasksCollection, newTaskPayload);
    return newTaskRef.id;
  } catch (error) {
    console.error('taskService: Error creating task:', error);
    throw error;
  }
};

export const getProjectMainTasks = async (projectId: string): Promise<Task[]> => {
  console.log('taskService: getProjectMainTasks for projectId:', projectId);

  const q = query(
    tasksCollection,
    where('projectId', '==', projectId),
    where('parentId', '==', null),
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
     if (tasks.length === 0) {
      console.log(`taskService: getProjectMainTasks - Query for projectId ${projectId} executed successfully but found 0 main tasks. Index needed: projectId (ASC), parentId (ASC), createdAt (DESC)`);
    }
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching main project tasks for projectId:', projectId, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for main tasks requires an index. Fields: projectId (ASC), parentId (ASC), createdAt (DESC). Check Firebase console for link.");
    }
    throw error;
  }
};

export const getSubTasks = async (parentId: string): Promise<Task[]> => {
  console.log(`taskService: getSubTasks for parentId: ${parentId}`);
  if (!parentId) {
    console.warn('taskService: getSubTasks called with no parentId.');
    return [];
  }

  const q = query(
    tasksCollection,
    where('parentId', '==', parentId),
    orderBy('createdAt', 'asc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    console.log(`taskService: Fetched ${tasks.length} sub-tasks for parentId ${parentId}.`);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error fetching sub-tasks for parentId: ${parentId}`, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
       const indexFields = "parentId (ASC), createdAt (ASC)";
       console.error(`Firestore query for sub-tasks requires an index. Please create it in the Firebase console. Fields: ${indexFields}.`);
    }
    throw error;
  }
};

export const getAssignedSubTasksForUser = async (mainTaskId: string, userUid: string): Promise<Task[]> => {
  console.log(`taskService: getAssignedSubTasksForUser for mainTaskId: ${mainTaskId}, userUid: ${userUid}`);
  if (!mainTaskId || !userUid) return [];

  const q = query(
    tasksCollection,
    where('parentId', '==', mainTaskId),
    where('assignedToUids', 'array-contains', userUid),
    orderBy('createdAt', 'asc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    console.log(`taskService: Fetched ${tasks.length} sub-tasks assigned to user ${userUid} under main task ${mainTaskId}.`);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error in getAssignedSubTasksForUser for mainTaskId: ${mainTaskId}, userUid: ${userUid}`, error.message, error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAssignedSubTasksForUser requires an index. Fields: parentId (ASC), assignedToUids (array-contains), createdAt (ASC). Check Firebase console.");
    }
    throw error;
  }
};


export const getTaskById = async (taskId: string, userUid: string, userRole?: UserRole): Promise<Task | null> => {
  if (!userUid) throw new Error('User not authenticated for getting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);

  if (taskSnap.exists()) {
    const taskData = mapDocumentToTask(taskSnap);
    const isOwner = taskData.ownerUid === userUid;
    
    const isAssignedToThisSubTask = taskData.parentId && taskData.assignedToUids?.includes(userUid);
    const isSupervisorViewingAnyMainTask = userRole === 'supervisor' && !taskData.parentId;

    if (isOwner || isAssignedToThisSubTask || isSupervisorViewingAnyMainTask) {
      return taskData;
    } else {
      console.warn(`taskService: getTaskById - Access denied for user ${userUid} (role: ${userRole}) to task ${taskId}. Owner: ${taskData.ownerUid}, AssignedToUids: ${taskData.assignedToUids}`);
      return null;
    }
  }
  console.warn(`taskService: getTaskById - Task ${taskId} not found.`);
  return null;
};

interface UpdateTaskData {
    name?: string;
    description?: string;
    status?: TaskStatus;
    dueDate?: Date | null;
    assignedToUids?: string[] | null;
    assignedToNames?: string[] | null;
}

export const updateTask = async (
  taskId: string,
  userUid: string,
  updates: UpdateTaskData,
  userRole?: UserRole
): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists()) {
    throw new Error('Task not found for update.');
  }

  const taskDataFromSnap = taskSnap.data() as Task;
  const isOwner = taskDataFromSnap.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && taskDataFromSnap.assignedToUids?.includes(userUid);

  if (!isOwner && !isAssignedSupervisor) {
     throw new Error('Access denied for updating task.');
  }

  const updatePayload: any = { updatedAt: serverTimestamp() as Timestamp };

  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.status !== undefined) updatePayload.status = updates.status;

  if (updates.dueDate !== undefined) {
    updatePayload.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
  }

  if (updates.assignedToUids !== undefined) {
    updatePayload.assignedToUids = updates.assignedToUids || [];
    updatePayload.assignedToNames = updates.assignedToNames || [];
  }

  if (!taskDataFromSnap.parentId) { // It's a main task
    if (!isOwner) throw new Error('Only project owner can edit main task name.');
    // For main tasks, only allow name update through this path
    const mainTaskSpecificUpdate: { name?: string, updatedAt: Timestamp } = { updatedAt: serverTimestamp() as Timestamp };
    if (updates.name !== undefined) mainTaskSpecificUpdate.name = updates.name;
    
    const allowedMainTaskKeys = ['name', 'updatedAt'];
    Object.keys(updatePayload).forEach(key => {
        if (!allowedMainTaskKeys.includes(key)) {
            delete updatePayload[key];
        }
    });
    await updateDoc(taskDocRef, updatePayload);
    return;
  }

  // It's a sub-task
  if (isAssignedSupervisor && !isOwner) { // Supervisor editing assigned sub-task
    const supervisorAllowedUpdates: any = {updatedAt: serverTimestamp() as Timestamp};
    let hasAllowedUpdate = false;
    const allowedSupervisorKeys = ['status', 'description', 'dueDate'];

    if(updates.status !== undefined) { supervisorAllowedUpdates.status = updates.status; hasAllowedUpdate = true; }
    if(updates.description !== undefined) { supervisorAllowedUpdates.description = updates.description; hasAllowedUpdate = true; }
    if(updates.dueDate !== undefined) { supervisorAllowedUpdates.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null; hasAllowedUpdate = true; }
    
    const attemptedKeys = Object.keys(updates) as (keyof UpdateTaskData)[];
    const forbiddenAttempts = attemptedKeys.filter(key => !allowedSupervisorKeys.includes(key) && (updates as any)[key] !== undefined);

    if (forbiddenAttempts.length > 0) {
        throw new Error(`Supervisors can only update status, description, or due date of sub-tasks assigned to them. Attempted to change: ${forbiddenAttempts.join(', ')}`);
    }
    if(hasAllowedUpdate) {
        await updateDoc(taskDocRef, supervisorAllowedUpdates);
    } else {
        // No allowed fields were actually updated by supervisor, maybe just a save click with no changes
        // or an attempt to update only restricted fields which was caught.
        // Can silently ignore or toast info. For now, if no allowed update, we do nothing.
    }
    return;
  }
  
  await updateDoc(taskDocRef, updatePayload);
};

export const updateTaskStatus = async (taskId: string, userUid: string, status: TaskStatus, userRole?: UserRole): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task status');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists()) {
    throw new Error('Task not found for status update.');
  }
  const taskData = mapDocumentToTask(taskSnap); // Use mapped data
  const isOwner = taskData.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && taskData.assignedToUids?.includes(userUid);

  if (taskData.parentId) { // Only sub-tasks have user-mutable status
    if (isOwner || isAssignedSupervisor) {
      await updateDoc(taskDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
    } else {
      throw new Error('Access denied for status update. Task not owned or assigned to supervisor.');
    }
  } else {
    console.warn(`Attempted to update status for main task ${taskId}, which is not directly applicable via updateTaskStatus.`);
  }
};

export const deleteTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || (mapDocumentToTask(taskSnap)).ownerUid !== userUid) {
    throw new Error('Task not found or access denied for deletion.');
  }

  const taskDataFromSnap = mapDocumentToTask(taskSnap);
  const batch = writeBatch(db);

  batch.delete(taskDocRef);
  await deleteIssuesForTask(taskId, userUid);

  if (!taskDataFromSnap.parentId) {
    const subTasksQuery = query(tasksCollection, where('parentId', '==', taskId)); 
    const subTasksSnapshot = await getDocs(subTasksQuery);
    for (const subTaskDoc of subTasksSnapshot.docs) {
      if ((mapDocumentToTask(subTaskDoc)).ownerUid === userUid) {
        batch.delete(subTaskDoc.ref);
        await deleteIssuesForTask(subTaskDoc.id, userUid);
      } else {
        console.warn(`Skipping deletion of sub-task ${subTaskDoc.id} as its owner does not match the main task deleter.`);
      }
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    console.error(`Error deleting task ${taskId} and/or its related data:`, error);
    throw error;
  }
};

export const deleteAllTasksForProject = async (projectId: string, projectOwnerUid: string): Promise<void> => {
  if (!projectOwnerUid) throw new Error("User not authenticated for deleting all project tasks");

  const projectTasksQuery = query(
    tasksCollection,
    where("projectId", "==", projectId)
  );

  const batch = writeBatch(db);
  try {
    const tasksSnapshot = await getDocs(projectTasksQuery);
    if (tasksSnapshot.empty) {
        console.log(`taskService: No tasks found for project ${projectId} to delete.`);
        return;
    }

    for (const taskDoc of tasksSnapshot.docs) {
      batch.delete(taskDoc.ref);
      await deleteIssuesForTask(taskDoc.id, projectOwnerUid);
    }
    await batch.commit();
    console.log(`taskService: Successfully deleted all tasks and their issues for project ${projectId}.`);

  } catch (error) {
    console.error(`Error in deleteAllTasksForProject for projectId ${projectId} by user ${projectOwnerUid}:`, error);
    throw error;
  }
};


export const getAllTasksAssignedToUser = async (userUid: string): Promise<Task[]> => {
  if (!userUid) return [];
  console.log(`taskService: getAllTasksAssignedToUser for userUid: ${userUid}`);

  const q = query(
    tasksCollection,
    where('assignedToUids', 'array-contains', userUid),
    where('parentId', '!=', null), 
    orderBy('parentId'), 
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    if (tasks.length === 0) {
      console.log(`taskService: getAllTasksAssignedToUser - Query executed successfully but found 0 sub-tasks assigned to user ${userUid}. Index needed: assignedToUids (array-contains), parentId (ASC), createdAt (DESC)`);
    } else {
      console.log(`taskService: Fetched ${tasks.length} sub-tasks assigned to user ${userUid}`);
    }
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching all tasks assigned to user:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAllTasksAssignedToUser requires an index. Fields: assignedToUids (array-contains), parentId (ASC), createdAt (DESC). Check Firebase console.");
    }
    throw error;
  }
};

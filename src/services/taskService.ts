
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
  getCountFromServer,
} from 'firebase/firestore';
import { deleteIssuesForTask } from './issueService';

const tasksCollection = collection(db, 'tasks');

interface CreateTaskData {
  name: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: Date | null;
  parentId?: string | null;
  assignedToUid?: string | null;
  assignedToName?: string | null;
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
    assignedToUid: data.assignedToUid || null,
    assignedToName: data.assignedToName || null,
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

  console.log(
      `taskService: createTask - Checking project. Project ID: ${projectId}, Project Exists: ${projectSnap.exists()}, Project Owner: ${projectSnap.data()?.ownerUid}, Current User UID: ${userUid}`
  );

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
    assignedToUid: taskData.assignedToUid || null,
    assignedToName: taskData.assignedToName || null,
  };

  if (taskData.dueDate) {
    newTaskPayload.dueDate = Timestamp.fromDate(taskData.dueDate);
  } else {
    newTaskPayload.dueDate = null;
  }

  if (!taskData.parentId) { // Main task defaults
    newTaskPayload.status = 'To Do'; // Main tasks don't have progress status directly set like this by user
    // For main tasks, these fields are often not directly set or are derived
    delete newTaskPayload.description; // Typically not on main task form
    delete newTaskPayload.dueDate; // Typically not on main task form
    delete newTaskPayload.assignedToUid; // Main tasks are not "assigned"
    delete newTaskPayload.assignedToName;
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


// Fetches all sub-tasks for a given parentId
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

// Fetches sub-tasks directly assigned to a specific user under a main task
export const getAssignedSubTasksForUser = async (mainTaskId: string, userUid: string): Promise<Task[]> => {
  console.log(`taskService: getAssignedSubTasksForUser for mainTaskId: ${mainTaskId}, userUid: ${userUid}`);
  if (!mainTaskId || !userUid) return [];

  const q = query(
    tasksCollection,
    where('parentId', '==', mainTaskId),
    where('assignedToUid', '==', userUid),
    orderBy('createdAt', 'asc') // Consistent ordering
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    console.log(`taskService: Fetched ${tasks.length} sub-tasks assigned to user ${userUid} under main task ${mainTaskId}.`);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error in getAssignedSubTasksForUser for mainTaskId: ${mainTaskId}, userUid: ${userUid}`, error.message, error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAssignedSubTasksForUser requires an index. Fields: parentId (ASC), assignedToUid (ASC), createdAt (ASC). Check Firebase console.");
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
    
    // If it's a sub-task, check if it's assigned to the current user (supervisor or not)
    const isAssignedToThisSubTask = taskData.parentId && taskData.assignedToUid === userUid;

    // If it's a main task, a supervisor can view it if they are on the project page (implies they have work in it)
    const isSupervisorViewingAnyMainTask = userRole === 'supervisor' && !taskData.parentId;

    if (isOwner || isAssignedToThisSubTask || isSupervisorViewingAnyMainTask) {
      return taskData;
    } else {
      console.warn(`taskService: getTaskById - Access denied for user ${userUid} (role: ${userRole}) to task ${taskId}. Owner: ${taskData.ownerUid}, AssignedToSubTask: ${taskData.assignedToUid}`);
      // throw new Error('Access denied or task not found for your role.'); // Potentially too disruptive
      return null; // Or handle appropriately in UI
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
    assignedToUid?: string | null;
    assignedToName?: string | null;
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

  const taskDataFromSnap = taskSnap.data() as Task; // Assuming it's Task like structure
  const isOwner = taskDataFromSnap.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && taskDataFromSnap.assignedToUid === userUid;

  if (!isOwner && !isAssignedSupervisor) {
     throw new Error('Access denied for updating task.');
  }

  const updatePayload: any = { updatedAt: serverTimestamp() as Timestamp };

  // Apply general updates if present
  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.status !== undefined) updatePayload.status = updates.status;


  if (updates.dueDate !== undefined) { // Handle date conversion for Firestore
    updatePayload.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
  }

  if (updates.assignedToUid !== undefined) { // Handle assignee update
    updatePayload.assignedToUid = updates.assignedToUid || null;
    updatePayload.assignedToName = updates.assignedToName || null;
  }


  if (!taskDataFromSnap.parentId) { // It's a main task
    if (!isOwner) throw new Error('Only project owner can edit main task name.');
    // For main tasks, only allow name update through this path, other fields are typically not user-editable here
    const mainTaskSpecificUpdate: { name?: string, updatedAt: Timestamp } = { updatedAt: serverTimestamp() as Timestamp };
    if (updates.name !== undefined) mainTaskSpecificUpdate.name = updates.name;
    
    const attemptedUpdates = Object.keys(updates) as (keyof UpdateTaskData)[];
    const disallowedUpdatesForMainTask = attemptedUpdates.filter(key => key !== 'name' && (updates as any)[key] !== undefined);

    if (disallowedUpdatesForMainTask.length > 0) {
       console.warn(`Attempting to update restricted fields (${disallowedUpdatesForMainTask.join(', ')}) for main task ${taskId}. Only 'name' is allowed for main tasks via this form.`);
       // Filter payload to only include name and updatedAt
       Object.keys(updatePayload).forEach(key => {
           if (key !== 'name' && key !== 'updatedAt') {
               delete updatePayload[key];
           }
       });
    }
    await updateDoc(taskDocRef, updatePayload); // updatePayload will now only contain name (if changed) and updatedAt
    return;
  }

  // It's a sub-task
  if (isAssignedSupervisor && !isOwner) { // Supervisor editing assigned sub-task
    // Supervisors can only update status, description, or due date
    const supervisorAllowedUpdates: any = {updatedAt: serverTimestamp() as Timestamp};
    let hasAllowedUpdate = false;

    if(updates.status !== undefined) { supervisorAllowedUpdates.status = updates.status; hasAllowedUpdate = true; }
    if(updates.description !== undefined) { supervisorAllowedUpdates.description = updates.description; hasAllowedUpdate = true; }
    if(updates.dueDate !== undefined) { supervisorAllowedUpdates.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null; hasAllowedUpdate = true; }
    
    // Check if any other fields were attempted
    const attemptedKeys = Object.keys(updates) as (keyof UpdateTaskData)[];
    const otherAttempts = attemptedKeys.some(key => !['status', 'description', 'dueDate'].includes(key) && (updates as any)[key] !== undefined);

    if (otherAttempts || !hasAllowedUpdate) {
         // If they try to change other fields, or no allowed fields were provided, throw error or ignore
         // For now, let's assume if 'status' is the only thing, it's handled by updateTaskStatus
         // If other fields like 'name' or 'assignedToUid' are attempted by supervisor, it's an error here.
         const forbiddenAttempts = attemptedKeys.filter(key => !['status', 'description', 'dueDate'].includes(key) && (updates as any)[key] !== undefined);
         if(forbiddenAttempts.length > 0) {
            throw new Error(`Supervisors can only update status, description, or due date of sub-tasks assigned to them. Attempted to change: ${forbiddenAttempts.join(', ')}`);
         }
    }
    if(hasAllowedUpdate) {
        await updateDoc(taskDocRef, supervisorAllowedUpdates);
    }
    return;
  }
  
  // Owner editing sub-task (can change anything in UpdateTaskData)
  await updateDoc(taskDocRef, updatePayload);
};

export const updateTaskStatus = async (taskId: string, userUid: string, status: TaskStatus, userRole?: UserRole): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task status');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists()) {
    throw new Error('Task not found for status update.');
  }
  const taskData = taskSnap.data() as Task;
  const isOwner = taskData.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && taskData.assignedToUid === userUid;

  if (taskData.parentId) { // Only sub-tasks have user-mutable status
    if (isOwner || isAssignedSupervisor) {
      await updateDoc(taskDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
    } else {
      throw new Error('Access denied for status update. Task not owned or assigned to supervisor.');
    }
  } else {
    console.warn(`Attempted to update status for main task ${taskId}, which is not directly applicable via updateTaskStatus. Main task progress is derived.`);
  }
};

export const deleteTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || (taskSnap.data() as Task).ownerUid !== userUid) {
    throw new Error('Task not found or access denied for deletion.');
  }

  const taskDataFromSnap = taskSnap.data() as Task;
  const batch = writeBatch(db);

  batch.delete(taskDocRef); // Delete the task itself
  await deleteIssuesForTask(taskId, userUid); // Delete associated issues

  // If it's a main task, delete all its sub-tasks and their issues
  if (!taskDataFromSnap.parentId) {
    // Query for sub-tasks that belong to this main task AND are owned by the same user
    // (though ownerUid check might be redundant if sub-tasks inherit project's owner context implicitly)
    const subTasksQuery = query(tasksCollection, where('parentId', '==', taskId)); 
    const subTasksSnapshot = await getDocs(subTasksQuery);
    for (const subTaskDoc of subTasksSnapshot.docs) {
      // Check if the sub-task owner is indeed the one deleting the main task, for safety.
      // This check might be overly cautious if main task deletion implies sub-task deletion regardless of sub-task owner.
      // For now, assume if main task owner deletes, sub-tasks they own are deleted.
      // If sub-tasks could have different owners, this logic would need refinement.
      if ((subTaskDoc.data() as Task).ownerUid === userUid) {
        batch.delete(subTaskDoc.ref);
        await deleteIssuesForTask(subTaskDoc.id, userUid); // Delete issues of each sub-task
      } else {
        console.warn(`Skipping deletion of sub-task ${subTaskDoc.id} as its owner does not match the main task deleter. This scenario might need policy review.`);
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
    // No ownerUid check here, assume if project is deleted, all its tasks go.
    // Ensure Firestore rules protect this appropriately if needed.
  );

  const batch = writeBatch(db);
  try {
    const tasksSnapshot = await getDocs(projectTasksQuery);
    if (tasksSnapshot.empty) {
        console.log(`taskService: No tasks found for project ${projectId} to delete.`);
        return;
    }

    for (const taskDoc of tasksSnapshot.docs) {
      // We must ensure that the user deleting the project has authority to delete these tasks.
      // This is usually handled by Firestore rules, but an explicit check for ownerUid here could be added if tasks can have different owners than the project owner.
      // For now, assume project deletion implies deletion of all its tasks.
      batch.delete(taskDoc.ref);
      // Delete issues for each task being deleted
      await deleteIssuesForTask(taskDoc.id, projectOwnerUid); // Pass projectOwnerUid as the performing user
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

  // This query fetches sub-tasks (parentId != null) assigned to the user
  const q = query(
    tasksCollection,
    where('assignedToUid', '==', userUid),
    where('parentId', '!=', null), // Ensure it's a sub-task
    orderBy('parentId'), // Order by main task first
    orderBy('createdAt', 'desc') // Then by creation time
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    if (tasks.length === 0) {
      console.log(`taskService: getAllTasksAssignedToUser - Query executed successfully but found 0 sub-tasks assigned to user ${userUid}. Index needed: assignedToUid (ASC), parentId (ASC), createdAt (DESC)`);
    } else {
      console.log(`taskService: Fetched ${tasks.length} sub-tasks assigned to user ${userUid}`);
    }
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching all tasks assigned to user:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAllTasksAssignedToUser requires an index. Fields: assignedToUid (ASC), parentId (ASC), createdAt (DESC). Check Firebase console.");
    }
    throw error;
  }
};

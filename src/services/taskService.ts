
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
  description?: string; // Mandatory for sub-tasks, optional for main (defaults to empty)
  status?: TaskStatus; // Mandatory for sub-tasks, defaults to 'To Do' for main
  dueDate?: Date | null; // Optional for sub-tasks
  parentId?: string | null; // Determines if it's a sub-task
  assignedToUids?: string[] | null; // For sub-tasks
  assignedToNames?: string[] | null; // For sub-tasks
}

const mapDocumentToTask = (docSnapshot: any): Task => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    projectId: data.projectId,
    parentId: data.parentId || null,
    name: data.name,
    description: data.description || '',
    status: data.status as TaskStatus, // Should always exist
    ownerUid: data.ownerUid,
    assignedToUids: data.assignedToUids || [], // Default to empty array if undefined/null
    assignedToNames: data.assignedToNames || [], // Default to empty array
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
    dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : null),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : undefined),
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

  // For creating any task (main or sub), the user must own the project.
  if (!projectSnap.exists() || projectSnap.data()?.ownerUid !== userUid) {
    throw new Error('Project not found or access denied for creating task in this project.');
  }

  const newTaskPayload: any = {
    projectId,
    ownerUid: userUid, // The creator of the task (main or sub)
    name: taskData.name,
    parentId: taskData.parentId || null,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  if (taskData.parentId) { // It's a sub-task, include all sub-task specific fields
    newTaskPayload.description = taskData.description || '';
    newTaskPayload.status = taskData.status || 'To Do';
    newTaskPayload.dueDate = taskData.dueDate ? Timestamp.fromDate(taskData.dueDate) : null;
    newTaskPayload.assignedToUids = taskData.assignedToUids || [];
    newTaskPayload.assignedToNames = taskData.assignedToNames || [];
  } else { // It's a main task, set defaults or omit fields not applicable at creation
    newTaskPayload.description = ''; // Main tasks don't use description from form
    newTaskPayload.status = 'To Do'; // Main tasks default status
    newTaskPayload.dueDate = null; // Main tasks don't use due date from form
    newTaskPayload.assignedToUids = []; // Main tasks are not assigned via this form
    newTaskPayload.assignedToNames = [];
  }

  try {
    const newTaskRef = await addDoc(tasksCollection, newTaskPayload);
    return newTaskRef.id;
  } catch (error: any) {
    console.error('taskService: Error creating task:', error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const getProjectMainTasks = async (projectId: string): Promise<Task[]> => {
  console.log('taskService: getProjectMainTasks for projectId:', projectId);

  const q = query(
    tasksCollection,
    where('projectId', '==', projectId),
    where('parentId', '==', null), // Ensures only main tasks
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

// Fetches ALL sub-tasks for a given main task ID (parentId)
export const getSubTasks = async (parentId: string): Promise<Task[]> => {
  console.log(`taskService: getSubTasks for parentId: ${parentId}`);
  if (!parentId) {
    console.warn('taskService: getSubTasks called with no parentId.');
    return [];
  }

  const q = query(
    tasksCollection,
    where('parentId', '==', parentId),
    orderBy('createdAt', 'asc') // Order sub-tasks by creation time
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    console.log(`taskService: Fetched ${tasks.length} sub-tasks for parentId ${parentId}.`);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error fetching sub-tasks for parentId: ${parentId}`, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
       const indexFields = "parentId (ASC), createdAt (ASC)"; // Adjusted index field order
       console.error(`Firestore query for sub-tasks requires an index. Please create it in the Firebase console. Fields: ${indexFields}.`);
    }
    throw error;
  }
};


// Fetches sub-tasks under a main task that are DIRECTLY assigned to a specific user.
export const getAssignedSubTasksForUser = async (mainTaskId: string, userUid: string): Promise<Task[]> => {
  console.log(`taskService: getAssignedSubTasksForUser for mainTaskId: ${mainTaskId}, userUid: ${userUid}`);
  if (!mainTaskId || !userUid) return [];

  const q = query(
    tasksCollection,
    where('parentId', '==', mainTaskId),
    where('assignedToUids', 'array-contains', userUid), // Use array-contains for multi-assignee check
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
      // Index for this query needs: parentId (ASC), assignedToUids (array-contains), createdAt (ASC)
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
    
    // For sub-tasks: user is owner OR is one of the assignees
    const canAccessSubTask = taskData.parentId && (isOwner || taskData.assignedToUids?.includes(userUid));
    
    // For main tasks: user is owner. Supervisors can view any main task details (context for their assigned sub-tasks/issues).
    const canAccessMainTask = !taskData.parentId && (isOwner || userRole === 'supervisor');

    if (canAccessSubTask || canAccessMainTask) {
      return taskData;
    } else {
      console.warn(`taskService: getTaskById - Access denied for user ${userUid} (role: ${userRole}) to task ${taskId}. Owner: ${taskData.ownerUid}, AssignedToUids: ${taskData.assignedToUids?.join(', ')}`);
      return null; 
    }
  }
  console.warn(`taskService: getTaskById - Task ${taskId} not found.`);
  return null;
};

interface UpdateTaskData {
    name?: string;
    description?: string; // Applicable for sub-tasks
    status?: TaskStatus; // Applicable for sub-tasks
    dueDate?: Date | null; // Applicable for sub-tasks
    assignedToUids?: string[] | null; // Applicable for sub-tasks
    assignedToNames?: string[] | null; // Applicable for sub-tasks
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

  const taskDataFromSnap = mapDocumentToTask(taskSnap); // Use mapped data
  const isOwner = taskDataFromSnap.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && !!taskDataFromSnap.parentId && taskDataFromSnap.assignedToUids?.includes(userUid);

  // Base payload
  const updatePayload: any = { updatedAt: serverTimestamp() as Timestamp };

  if (taskDataFromSnap.parentId) { // ---- It's a SUB-TASK ----
    if (!isOwner && !isAssignedSupervisor) {
      throw new Error('Access denied. Only the owner or an assigned supervisor can update this sub-task.');
    }

    if (isOwner) { // Owner can update all editable fields of a sub-task
      if (updates.name !== undefined) updatePayload.name = updates.name;
      if (updates.description !== undefined) updatePayload.description = updates.description;
      if (updates.status !== undefined) updatePayload.status = updates.status;
      if (updates.dueDate !== undefined) updatePayload.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
      if (updates.assignedToUids !== undefined) {
        updatePayload.assignedToUids = updates.assignedToUids || [];
        updatePayload.assignedToNames = updates.assignedToNames || [];
      }
    } else if (isAssignedSupervisor) { // Supervisor assigned to sub-task
      // Supervisors can only update specific fields: status, description, dueDate
      const supervisorAllowedUpdates: { status?: TaskStatus, description?: string, dueDate?: Date | null | Timestamp } = {};
      let hasAllowedUpdate = false;
      
      if (updates.status !== undefined) { supervisorAllowedUpdates.status = updates.status; hasAllowedUpdate = true;}
      if (updates.description !== undefined) { supervisorAllowedUpdates.description = updates.description; hasAllowedUpdate = true;}
      if (updates.dueDate !== undefined) { supervisorAllowedUpdates.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null; hasAllowedUpdate = true;}

      const attemptedKeys = Object.keys(updates) as (keyof UpdateTaskData)[];
      const forbiddenAttempts = attemptedKeys.filter(key => 
          (updates as any)[key] !== undefined && 
          !['status', 'description', 'dueDate'].includes(key)
      );

      if (forbiddenAttempts.length > 0) {
          throw new Error(`Supervisors can only update status, description, or due date of sub-tasks assigned to them. Attempted to change: ${forbiddenAttempts.join(', ')}`);
      }
      if(hasAllowedUpdate) {
        Object.assign(updatePayload, supervisorAllowedUpdates);
      } else {
        // No allowed fields were updated by supervisor.
        // To avoid an empty update call, we can just return if only `updatedAt` would be sent.
        if (Object.keys(updatePayload).length === 1 && updatePayload.updatedAt) return; 
      }
    }
  } else { // ---- It's a MAIN TASK ----
    if (!isOwner) {
      throw new Error('Access denied. Only the project owner can edit main task details.');
    }
    // For main tasks, only allow name update through this function. Other fields are not user-editable here.
    if (updates.name !== undefined) updatePayload.name = updates.name;
    
    // Ensure no other fields are accidentally updated for main tasks
    const allowedMainTaskKeys = ['name', 'updatedAt'];
    Object.keys(updatePayload).forEach(key => {
        if (!allowedMainTaskKeys.includes(key)) {
            delete updatePayload[key];
        }
    });
     if (Object.keys(updatePayload).length === 1 && updatePayload.updatedAt && updates.name === undefined) return; // No actual change other than timestamp
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
  const taskData = mapDocumentToTask(taskSnap); 
  const isOwner = taskData.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && !!taskData.parentId && taskData.assignedToUids?.includes(userUid);

  if (taskData.parentId) { // Status is user-mutable only for sub-tasks
    if (isOwner || isAssignedSupervisor) {
      await updateDoc(taskDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
    } else {
      throw new Error('Access denied for status update. Task not owned by you, or you are not a supervisor assigned to it.');
    }
  } else {
    // Main task status is derived/fixed and not directly updatable this way.
    console.warn(`taskService: Attempted to update status for main task ${taskId}, which is not directly applicable via updateTaskStatus.`);
    // Optionally throw an error or just log, depending on desired behavior.
    // throw new Error('Main task status cannot be updated directly.'); 
  }
};


export const deleteTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  
  if (!taskSnap.exists()) {
    throw new Error('Task not found for deletion.');
  }
  const taskToDelete = mapDocumentToTask(taskSnap);

  // Only the owner of the task (main or sub) can delete it.
  if (taskToDelete.ownerUid !== userUid) {
    throw new Error('Access denied. Only the task owner can delete it.');
  }

  const batch = writeBatch(db);

  // Delete the task itself
  batch.delete(taskDocRef);
  
  // Delete all issues associated with this task (whether it's a main task or sub-task)
  // deleteIssuesForTask expects the ID of the task whose issues are to be deleted.
  await deleteIssuesForTask(taskId, userUid); // This itself uses a batch internally or direct deletes.

  // If it's a main task, also delete all its sub-tasks (and their issues)
  if (!taskToDelete.parentId) { // It's a main task
    const subTasksQuery = query(tasksCollection, where('parentId', '==', taskId)); 
    const subTasksSnapshot = await getDocs(subTasksQuery);
    
    for (const subTaskDoc of subTasksSnapshot.docs) {
      const subTaskData = mapDocumentToTask(subTaskDoc);
      // Ensure the user deleting the main task also has authority over sub-tasks,
      // which is implicit if they own the main task and sub-tasks inherit ownership context.
      // For simplicity, we assume if the main task owner deletes, sub-tasks also go.
      // A stricter model might check subTaskData.ownerUid === userUid.
      batch.delete(subTaskDoc.ref);
      await deleteIssuesForTask(subTaskDoc.id, userUid); 
    }
  }

  try {
    await batch.commit();
    console.log(`taskService: Task ${taskId} and its associated data (issues, sub-tasks) deleted by user ${userUid}.`);
  } catch (error: any) {
    console.error(`taskService: Error deleting task ${taskId} and/or its related data:`, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};


// Deletes all tasks (main and sub) and their associated issues for a given project.
// This should typically only be called by the project owner when deleting a project.
export const deleteAllTasksForProject = async (projectId: string, projectOwnerUid: string): Promise<void> => {
  if (!projectOwnerUid) throw new Error("User not authenticated for deleting all project tasks");

  const projectTasksQuery = query(
    tasksCollection,
    where("projectId", "==", projectId)
    // No ownerUid check here, as we assume this is part of project deletion by the project owner.
  );

  const batch = writeBatch(db);
  try {
    const tasksSnapshot = await getDocs(projectTasksQuery);
    if (tasksSnapshot.empty) {
        console.log(`taskService: No tasks found for project ${projectId} to delete.`);
        return;
    }

    // Collect all task IDs to delete their issues first
    const taskIdsToDeleteIssuesFor: string[] = [];
    tasksSnapshot.forEach(taskDoc => {
        taskIdsToDeleteIssuesFor.push(taskDoc.id);
        batch.delete(taskDoc.ref); // Add task deletion to batch
    });
    
    // Delete issues for all collected task IDs
    // This might be numerous calls to deleteIssuesForTask if it doesn't use its own batching effectively.
    // For now, this is simpler than re-implementing batched issue deletion here.
    for (const taskId of taskIdsToDeleteIssuesFor) {
        await deleteIssuesForTask(taskId, projectOwnerUid); 
    }

    await batch.commit(); // Commit deletion of all tasks
    console.log(`taskService: Successfully deleted all tasks and their issues for project ${projectId}.`);

  } catch (error: any) {
    console.error(`taskService: Error in deleteAllTasksForProject for projectId ${projectId} by user ${projectOwnerUid}:`, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};


// Fetches all SUB-TASKS assigned to a specific user across all projects.
export const getAllTasksAssignedToUser = async (userUid: string): Promise<Task[]> => {
  if (!userUid) return [];
  console.log(`taskService: getAllTasksAssignedToUser (sub-tasks) for userUid: ${userUid}`);

  const q = query(
    tasksCollection,
    where('assignedToUids', 'array-contains', userUid),
    where('parentId', '!=', null), // Ensure it's a sub-task
    orderBy('parentId'), // Required for inequality filter on parentId with another orderBy
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    if (tasks.length === 0) {
      console.log(`taskService: getAllTasksAssignedToUser - Query executed successfully but found 0 sub-tasks assigned to user ${userUid}. Index needed: assignedToUids (array-contains), parentId (ASC/DESC), createdAt (DESC)`);
    } else {
      console.log(`taskService: Fetched ${tasks.length} sub-tasks assigned to user ${userUid}`);
    }
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching all sub-tasks assigned to user:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAllTasksAssignedToUser (sub-tasks) requires an index. Fields: assignedToUids (array-contains), parentId (ASC/DESC based on query), createdAt (DESC). Check Firebase console.");
    }
    throw error;
  }
};

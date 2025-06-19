
'use server';

import { db } from '@/lib/firebase';
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
    ...data,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
    dueDate: data.dueDate ? (data.dueDate instanceof Timestamp ? data.dueDate.toDate() : new Date(data.dueDate)) : null,
  } as Task;
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

  // Main tasks specifics (no parentId)
  if (!taskData.parentId) {
    newTaskPayload.status = 'To Do'; // Default, not user-editable for main task on creation form
    delete newTaskPayload.description; // Main tasks don't have description from this form
    delete newTaskPayload.dueDate;     // Main tasks don't have due date from this form
    delete newTaskPayload.assignedToUid; // Main tasks are not assigned
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
  // Removed userUid from parameters as owner check is not needed here.
  // Access to the project page implies the user (owner or supervisor) should see its main tasks.
  console.log('taskService: getProjectMainTasks for projectId:', projectId);

  const q = query(
    tasksCollection,
    where('projectId', '==', projectId),
    where('parentId', '==', null), // Filter for main tasks
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
     if (tasks.length === 0) {
      console.log(`taskService: getProjectMainTasks - Query for projectId ${projectId} executed successfully but found 0 main tasks. This could be due to no matching data or a missing/incorrect Firestore index if no explicit index error was thrown. Index needed: projectId (ASC), parentId (ASC), createdAt (DESC)`);
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


export const getSubTasks = async (parentId: string, userUid: string, isSupervisorView: boolean = false): Promise<Task[]> => {
  console.log(`taskService: getSubTasks for parentId: ${parentId}, userUid: ${userUid}, isSupervisorView: ${isSupervisorView}`);
  if (!userUid) return [];

  let q;
  if (isSupervisorView) {
    q = query(
      tasksCollection,
      where('parentId', '==', parentId),
      where('assignedToUid', '==', userUid),
      orderBy('createdAt', 'asc')
    );
  } else {
    // If not supervisor view, assume it's an owner viewing their own tasks' sub-tasks.
    // Or, a supervisor viewing a project they were granted access to, showing all sub-tasks under a main task.
    // To show ALL sub-tasks under a main task for any authorized viewer (owner or supervisor):
     q = query(
      tasksCollection,
      where('parentId', '==', parentId),
      // No ownerUid or assignedToUid filter here if we want to show all subtasks of a main task
      // that the user (owner or supervisor) has access to view (determined at project/main task level).
      orderBy('createdAt', 'asc')
    );
  }

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error fetching sub-tasks for parentId: ${parentId}, userUid: ${userUid}, supervisorView: ${isSupervisorView}`, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
       const indexFields = isSupervisorView
         ? "parentId (ASC), assignedToUid (ASC), createdAt (ASC)"
         : "parentId (ASC), createdAt (ASC)"; // Adjusted for broader sub-task view
       console.error(`Firestore query for sub-tasks requires an index. Please create it in the Firebase console. Fields: ${indexFields}. The error message from Firebase usually provides a direct link to create it.`);
    }
    throw error;
  }
};


export const getTaskById = async (taskId: string, userUid: string): Promise<Task | null> => {
  if (!userUid) throw new Error('User not authenticated for getting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);

  if (taskSnap.exists()) {
    const taskData = taskSnap.data();
    // A user can get a task if they own it OR if they are assigned to it (supervisor case for sub-tasks)
    if (taskData.ownerUid === userUid || taskData.assignedToUid === userUid) {
      return mapDocumentToTask(taskSnap);
    }
  }
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
  userRole?: string
): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists()) {
    throw new Error('Task not found for update.');
  }

  const taskDataFromSnap = taskSnap.data();
  const isOwner = taskDataFromSnap.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && taskDataFromSnap.assignedToUid === userUid;

  if (!isOwner && !isAssignedSupervisor) {
     throw new Error('Access denied for updating task.');
  }

  const updatePayload: any = { ...updates, updatedAt: serverTimestamp() as Timestamp };

  if (updates.dueDate !== undefined) {
    updatePayload.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
  }

  if (updates.assignedToUid !== undefined) {
    updatePayload.assignedToUid = updates.assignedToUid || null;
    updatePayload.assignedToName = updates.assignedToName || null;
  }

  if (!taskDataFromSnap.parentId) { // This is a main task
    if (!isOwner) throw new Error('Only project owner can edit main task name.');
    // For main tasks, only allow 'name' to be updated via this form.
    // Other fields (like description, status, dueDate, assignee) are not applicable or managed differently for main tasks.
    const mainTaskUpdate: Partial<Pick<Task, 'name'>> & {updatedAt: Timestamp} = {updatedAt: serverTimestamp() as Timestamp};
    if (updates.name !== undefined) mainTaskUpdate.name = updates.name;
    
    // Check if other fields were attempted to be updated and warn/ignore
    const allowedKeysForMainTask: (keyof UpdateTaskData)[] = ['name'];
    const attemptedUpdates = Object.keys(updates) as (keyof UpdateTaskData)[];
    const disallowedUpdates = attemptedUpdates.filter(key => !allowedKeysForMainTask.includes(key) && (updates as any)[key] !== undefined);

    if (disallowedUpdates.length > 0) {
       console.warn(`Attempting to update restricted fields (${disallowedUpdates.join(', ')}) for a main task ${taskId}. Only 'name' is allowed through this form path.`);
    }
    await updateDoc(taskDocRef, mainTaskUpdate);
    return;
  }

  // This is a sub-task
  if (isAssignedSupervisor && !isOwner) { // Supervisor editing an assigned sub-task
    // Supervisors can only update status or specific fields they manage for sub-tasks assigned to them.
    // For now, let's assume they can only update 'status'. If other fields are needed, expand this.
    if (Object.keys(updates).length === 1 && updates.status) {
      await updateDoc(taskDocRef, { status: updates.status, updatedAt: serverTimestamp() as Timestamp });
      return;
    } else if (updates.status && Object.keys(updates).every(key => ['status', 'description', 'dueDate'].includes(key)) ) {
      // Allow status, description, due date update by assigned supervisor
      const supervisorAllowedUpdates: any = {updatedAt: serverTimestamp() as Timestamp};
      if(updates.status) supervisorAllowedUpdates.status = updates.status;
      if(updates.description !== undefined) supervisorAllowedUpdates.description = updates.description;
      if(updates.dueDate !== undefined) supervisorAllowedUpdates.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
      await updateDoc(taskDocRef, supervisorAllowedUpdates);
      return;

    } else {
      throw new Error("Supervisors can only update status, description, or due date of sub-tasks assigned to them.");
    }
  }
  // Owner can update any field in the sub-task
  await updateDoc(taskDocRef, updatePayload);
};

export const updateTaskStatus = async (taskId: string, userUid: string, status: TaskStatus, userRole?: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task status');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists()) {
    throw new Error('Task not found for status update.');
  }
  const taskData = taskSnap.data();
  const isOwner = taskData.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && taskData.assignedToUid === userUid;

  if (taskData.parentId) { // Only sub-tasks have status directly updatable this way
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
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== userUid) {
    // Only owner can delete task
    throw new Error('Task not found or access denied for deletion.');
  }

  const taskDataFromSnap = taskSnap.data();
  const batch = writeBatch(db);

  // Delete the task itself
  batch.delete(taskDocRef);
  // Delete associated issues
  await deleteIssuesForTask(taskId, userUid); // This function itself might use a batch or individual deletes

  // If it's a main task, delete all its sub-tasks and their issues
  if (!taskDataFromSnap.parentId) { // It's a main task
    const subTasksQuery = query(tasksCollection, where('parentId', '==', taskId), where('ownerUid', '==', userUid));
    const subTasksSnapshot = await getDocs(subTasksQuery);
    for (const subTaskDoc of subTasksSnapshot.docs) {
      batch.delete(subTaskDoc.ref);
      // Delete issues for each sub-task
      await deleteIssuesForTask(subTaskDoc.id, userUid);
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    console.error(`Error deleting task ${taskId} and/or its related data:`, error);
    throw error;
  }
};

// This function is called when a project is deleted by its owner.
// It needs to delete ALL tasks (main and sub) for that project, regardless of sub-task assignees.
export const deleteAllTasksForProject = async (projectId: string, projectOwnerUid: string): Promise<void> => {
  if (!projectOwnerUid) throw new Error("User not authenticated for deleting all project tasks");

  // Query for all tasks (main and sub) belonging to the project and owned by the project owner
  // This ensures we only delete tasks that the project owner legitimately controls.
  const projectTasksQuery = query(
    tasksCollection,
    where("projectId", "==", projectId),
    where("ownerUid", "==", projectOwnerUid) // Ensure owner is deleting their own tasks
  );

  const batch = writeBatch(db);
  try {
    const tasksSnapshot = await getDocs(projectTasksQuery);
    if (tasksSnapshot.empty) {
        console.log(`taskService: No tasks found for project ${projectId} owned by ${projectOwnerUid} to delete.`);
        return;
    }

    for (const taskDoc of tasksSnapshot.docs) {
      batch.delete(taskDoc.ref);
      // Delete issues for each task being deleted
      // Assuming deleteIssuesForTask is robust enough or also checks ownership if necessary,
      // but in project deletion context, usually all sub-data is wiped.
      await deleteIssuesForTask(taskDoc.id, projectOwnerUid);
    }
    await batch.commit();
    console.log(`taskService: Successfully deleted all tasks and their issues for project ${projectId} owned by ${projectOwnerUid}.`);

  } catch (error) {
    console.error(`Error in deleteAllTasksForProject for projectId ${projectId} and userUid ${projectOwnerUid}:`, error);
    throw error;
  }
};


export const getAllTasksAssignedToUser = async (userUid: string): Promise<Task[]> => {
  if (!userUid) return [];
  console.log(`taskService: getAllTasksAssignedToUser for userUid: ${userUid}`);

  const q = query(
    tasksCollection,
    where('assignedToUid', '==', userUid),
    where('parentId', '!=', null), // Ensure it's a sub-task
    orderBy('parentId'), // Required for the '!=' filter if other orderBy is used
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    if (tasks.length === 0) {
      console.log(`taskService: getAllTasksAssignedToUser - Query executed successfully but found 0 tasks assigned to user ${userUid}. This means no task documents matched: assignedToUid === '${userUid}' AND parentId !== null. Check data and query logic.`);
    } else {
      console.log(`taskService: Fetched ${tasks.length} tasks assigned to user ${userUid}`);
    }
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching all tasks assigned to user:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAllTasksAssignedToUser requires an index. Fields: assignedToUid (ASC), parentId (ASC), createdAt (DESC). Check Firebase console using the link provided in the Firebase error message in your browser console.");
    }
    throw error;
  }
};

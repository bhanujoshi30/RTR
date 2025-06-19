
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
  assignedToUid?: string | null;
  assignedToName?: string | null;
}

const mapDocumentToTask = (docSnapshot: any): Task => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    projectId: data.projectId,
    parentId: data.parentId,
    name: data.name,
    description: data.description,
    status: data.status,
    ownerUid: data.ownerUid,
    assignedToUid: data.assignedToUid,
    assignedToName: data.assignedToName,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
    dueDate: data.dueDate ? (data.dueDate instanceof Timestamp ? data.dueDate.toDate() : new Date(data.dueDate)) : null,
    // Ensure updatedAt is also handled if it exists in your Task type and Firestore
    // updatedAt: data.updatedAt ? (data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt)) : undefined,
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
    updatedAt: serverTimestamp() as Timestamp, // Add updatedAt on creation
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

  if (!taskData.parentId) {
    newTaskPayload.status = 'To Do';
    delete newTaskPayload.description;
    delete newTaskPayload.dueDate;
    delete newTaskPayload.assignedToUid;
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
     q = query(
      tasksCollection,
      where('parentId', '==', parentId),
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
         : "parentId (ASC), createdAt (ASC)";
       console.error(`Firestore query for sub-tasks requires an index. Please create it in the Firebase console. Fields: ${indexFields}. The error message from Firebase usually provides a direct link to create it.`);
    }
    throw error;
  }
};


export const getTaskById = async (taskId: string, userUid: string, userRole?: UserRole): Promise<Task | null> => {
  if (!userUid) throw new Error('User not authenticated for getting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);

  if (taskSnap.exists()) {
    const taskData = mapDocumentToTask(taskSnap); // Use mapping function
    const isOwner = taskData.ownerUid === userUid;
    const isAssignedToThisSubTask = taskData.parentId && taskData.assignedToUid === userUid;
    const isSupervisorViewingAnyMainTask = userRole === 'supervisor' && !taskData.parentId;

    if (isOwner || isAssignedToThisSubTask || isSupervisorViewingAnyMainTask) {
      return taskData;
    } else {
      console.warn(`taskService: getTaskById - Access denied for user ${userUid} (role: ${userRole}) to task ${taskId}. Owner: ${taskData.ownerUid}, AssignedToSubTask: ${taskData.assignedToUid}`);
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

  if (!taskDataFromSnap.parentId) {
    if (!isOwner) throw new Error('Only project owner can edit main task name.');
    const mainTaskUpdate: Partial<Pick<Task, 'name'>> & {updatedAt: Timestamp} = {updatedAt: serverTimestamp() as Timestamp};
    if (updates.name !== undefined) mainTaskUpdate.name = updates.name;

    const allowedKeysForMainTask: (keyof UpdateTaskData)[] = ['name'];
    const attemptedUpdates = Object.keys(updates) as (keyof UpdateTaskData)[];
    const disallowedUpdates = attemptedUpdates.filter(key => !allowedKeysForMainTask.includes(key) && (updates as any)[key] !== undefined);

    if (disallowedUpdates.length > 0) {
       console.warn(`Attempting to update restricted fields (${disallowedUpdates.join(', ')}) for a main task ${taskId}. Only 'name' is allowed through this form path.`);
    }
    await updateDoc(taskDocRef, mainTaskUpdate);
    return;
  }

  if (isAssignedSupervisor && !isOwner) {
    if (Object.keys(updates).length === 1 && updates.status) {
      await updateDoc(taskDocRef, { status: updates.status, updatedAt: serverTimestamp() as Timestamp });
      return;
    } else if (updates.status && Object.keys(updates).every(key => ['status', 'description', 'dueDate'].includes(key)) ) {
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
  await updateDoc(taskDocRef, updatePayload);
};

export const updateTaskStatus = async (taskId: string, userUid: string, status: TaskStatus, userRole?: UserRole): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task status');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists()) {
    throw new Error('Task not found for status update.');
  }
  const taskData = taskSnap.data();
  const isOwner = taskData.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && taskData.assignedToUid === userUid;

  if (taskData.parentId) {
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
    throw new Error('Task not found or access denied for deletion.');
  }

  const taskDataFromSnap = taskSnap.data();
  const batch = writeBatch(db);

  batch.delete(taskDocRef);
  await deleteIssuesForTask(taskId, userUid);

  if (!taskDataFromSnap.parentId) {
    const subTasksQuery = query(tasksCollection, where('parentId', '==', taskId), where('ownerUid', '==', userUid));
    const subTasksSnapshot = await getDocs(subTasksQuery);
    for (const subTaskDoc of subTasksSnapshot.docs) {
      batch.delete(subTaskDoc.ref);
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

export const deleteAllTasksForProject = async (projectId: string, projectOwnerUid: string): Promise<void> => {
  if (!projectOwnerUid) throw new Error("User not authenticated for deleting all project tasks");

  const projectTasksQuery = query(
    tasksCollection,
    where("projectId", "==", projectId),
    where("ownerUid", "==", projectOwnerUid)
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
    where('parentId', '!=', null),
    orderBy('parentId'),
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

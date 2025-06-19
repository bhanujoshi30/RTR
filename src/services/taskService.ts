
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

export const getProjectMainTasks = async (projectId: string, userUid: string): Promise<Task[]> => {
  console.log('taskService: getProjectMainTasks for projectId:', projectId, 'uid:', userUid);
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
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching main project tasks for projectId:', projectId, 'uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for main tasks requires an index on projectId, ownerUid, parentId, createdAt. Check Firebase console for link.");
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
      where('ownerUid', '==', userUid),
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
         : "parentId (ASC), ownerUid (ASC), createdAt (ASC)";
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

  if (!taskDataFromSnap.parentId) {
    if (!isOwner) throw new Error('Only project owner can edit main task name.');
    const { name, ...otherUpdates } = updates;
    const mainTaskUpdate: Partial<Pick<Task, 'name'>> & {updatedAt: Timestamp} = {updatedAt: serverTimestamp() as Timestamp};
    if (name !== undefined) mainTaskUpdate.name = name;

    const allowedKeys: (keyof UpdateTaskData)[] = ['name'];
    const attemptedUpdates = Object.keys(otherUpdates) as (keyof UpdateTaskData)[];
    const disallowedUpdates = attemptedUpdates.filter(key => !allowedKeys.includes(key) && (otherUpdates as any)[key] !== undefined);

    if (disallowedUpdates.length > 0) {
       console.warn(`Attempting to update restricted fields (${disallowedUpdates.join(', ')}) for a main task ${taskId}. Only 'name' is allowed.`);
    }
    await updateDoc(taskDocRef, mainTaskUpdate);
    return;
  }

  if (isAssignedSupervisor && !isOwner) {
    if (Object.keys(updates).length === 1 && updates.status) {
      await updateDoc(taskDocRef, { status: updates.status, updatedAt: serverTimestamp() as Timestamp });
      return;
    } else {
      throw new Error("Supervisors can only update the status of tasks assigned to them.");
    }
  }
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

  if (taskData.parentId) {
    if (isOwner || isAssignedSupervisor) {
      await updateDoc(taskDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
    } else {
      throw new Error('Access denied for status update. Task not owned or assigned to supervisor.');
    }
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

  const taskDataFromSnap = taskSnap.data();
  const batch = writeBatch(db);

  batch.delete(taskDocRef);
  await deleteIssuesForTask(taskId, userUid);

  if (!taskDataFromSnap.parentId) {
    const subTasks = await getSubTasks(taskId, userUid, false);
    for (const subTask of subTasks) {
      const subTaskDocRef = doc(db, 'tasks', subTask.id);
      batch.delete(subTaskDocRef);
      await deleteIssuesForTask(subTask.id, userUid);
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

  try {
    const mainTasksSnapshot = await getDocs(mainTasksQuery);
    for (const mainTaskDoc of mainTasksSnapshot.docs) {
      await deleteTask(mainTaskDoc.id, userUid);
    }
  } catch (error) {
    console.error(`Error in deleteAllTasksForProject for projectId ${projectId} and userUid ${userUid}:`, error);
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
      console.log(`taskService: getAllTasksAssignedToUser - Query executed successfully but found 0 tasks assigned to user ${userUid}. This could be due to no matching data or a missing/incorrect Firestore index if no explicit index error was thrown.`);
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

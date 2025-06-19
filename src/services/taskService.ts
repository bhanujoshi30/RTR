
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

  if (!projectSnap.exists() || projectSnap.data()?.ownerUid !== userUid) {
    throw new Error('Project not found or access denied for creating task in this project.');
  }

  const newTaskPayload: any = {
    projectId,
    ownerUid: userUid, 
    name: taskData.name,
    parentId: taskData.parentId || null,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  if (taskData.parentId) { 
    newTaskPayload.description = taskData.description || '';
    newTaskPayload.status = taskData.status || 'To Do';
    if (taskData.dueDate === undefined && taskData.parentId) { // dueDate is mandatory for sub-tasks
        throw new Error('Due date is required for sub-tasks.');
    }
    newTaskPayload.dueDate = taskData.dueDate ? Timestamp.fromDate(taskData.dueDate) : null;
    newTaskPayload.assignedToUids = taskData.assignedToUids || [];
    newTaskPayload.assignedToNames = taskData.assignedToNames || [];
  } else { 
    newTaskPayload.description = ''; 
    newTaskPayload.status = 'To Do'; 
    newTaskPayload.dueDate = null; 
    newTaskPayload.assignedToUids = []; 
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
      console.error("Firestore query for getAssignedSubTasksForUser requires an index. Fields (in order): assignedToUids (ARRAY_CONTAINS), parentId (ASC), createdAt (ASC). Check Firebase console. The error message from Firebase often provides a direct link to create the index.");
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
    
    const canAccessSubTask = taskData.parentId && (isOwner || taskData.assignedToUids?.includes(userUid));
    
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

  const taskDataFromSnap = mapDocumentToTask(taskSnap); 
  const isOwner = taskDataFromSnap.ownerUid === userUid;
  const isAssignedSupervisor = userRole === 'supervisor' && !!taskDataFromSnap.parentId && taskDataFromSnap.assignedToUids?.includes(userUid);

  const updatePayload: any = { updatedAt: serverTimestamp() as Timestamp };

  if (taskDataFromSnap.parentId) { 
    if (!isOwner && !isAssignedSupervisor) {
      throw new Error('Access denied. Only the owner or an assigned supervisor can update this sub-task.');
    }

    if (isOwner) { 
      if (updates.name !== undefined) updatePayload.name = updates.name;
      if (updates.description !== undefined) updatePayload.description = updates.description;
      if (updates.status !== undefined) updatePayload.status = updates.status;
      if (updates.dueDate !== undefined) { // Can be null if owner clears it
           if (updates.dueDate === null) {
               updatePayload.dueDate = null;
           } else if (updates.dueDate) { // If it's a Date object
               updatePayload.dueDate = Timestamp.fromDate(updates.dueDate);
           }
           // If updates.dueDate is undefined, it's not changed.
      } else if (updates.dueDate === undefined && taskDataFromSnap.dueDate === null && updates.status !== undefined) {
          // If due date was already null and form submission sends undefined for dueDate
          // but other fields are updated, ensure it remains null unless explicitly set.
          // This case is tricky; ensure schema validation on form makes it required or optional as needed.
          // For now, if undefined, it means no change from form.
      }


      if (updates.assignedToUids !== undefined) {
        updatePayload.assignedToUids = updates.assignedToUids || [];
        updatePayload.assignedToNames = updates.assignedToNames || [];
      }
    } else if (isAssignedSupervisor) { 
      const supervisorAllowedUpdates: { status?: TaskStatus, description?: string, dueDate?: Date | null | Timestamp } = {};
      let hasAllowedUpdate = false;
      
      if (updates.status !== undefined) { supervisorAllowedUpdates.status = updates.status; hasAllowedUpdate = true;}
      if (updates.description !== undefined) { supervisorAllowedUpdates.description = updates.description; hasAllowedUpdate = true;}
      if (updates.dueDate !== undefined) { 
          supervisorAllowedUpdates.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null; 
          hasAllowedUpdate = true;
      }

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
        if (Object.keys(updatePayload).length === 1 && updatePayload.updatedAt) return; 
      }
    }
  } else { 
    if (!isOwner) {
      throw new Error('Access denied. Only the project owner can edit main task details.');
    }
    if (updates.name !== undefined) updatePayload.name = updates.name;
    
    const allowedMainTaskKeys = ['name', 'updatedAt'];
    Object.keys(updatePayload).forEach(key => {
        if (!allowedMainTaskKeys.includes(key)) {
            delete updatePayload[key];
        }
    });
     if (Object.keys(updatePayload).length === 1 && updatePayload.updatedAt && updates.name === undefined) return; 
  }

  // Explicitly ensure dueDate is not passed if undefined (meaning "no change") for main tasks
  if (!taskDataFromSnap.parentId && updatePayload.dueDate === undefined) {
      delete updatePayload.dueDate;
  }
  
  // Explicitly ensure dueDate for sub-tasks is mandatory from the schema
  if (taskDataFromSnap.parentId && updatePayload.dueDate === undefined && updates.dueDate === undefined && taskDataFromSnap.dueDate === null){
    // If form doesn't send it, and it was null, keep it null, unless schema forces it to be set.
    // The TaskForm schema for subTaskSchema now requires dueDate, so it should always come.
    // This means if it's NOT in updatePayload, it means it wasn't in `updates`.
    // If `updates.dueDate` was `undefined` and it was NOT a sub-task, it's fine.
    // If `updates.dueDate` was `undefined` AND it IS a sub-task, the TaskForm schema should have caught this.
    // However, if an existing sub-task has a null dueDate (from before it was mandatory) and it's being updated
    // without touching dueDate, it should remain null unless the form forces a value.
    // Current SubTask schema requires it: `dueDate: z.date({ required_error: "Due date is required." })`
    // So, for sub-tasks, `updates.dueDate` should always be a Date object from the form.
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

  if (taskData.parentId) { 
    if (isOwner || isAssignedSupervisor) {
      await updateDoc(taskDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
    } else {
      throw new Error('Access denied for status update. Task not owned by you, or you are not a supervisor assigned to it.');
    }
  } else {
    console.warn(`taskService: Attempted to update status for main task ${taskId}, which is not directly applicable via updateTaskStatus.`);
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

  if (taskToDelete.ownerUid !== userUid) {
    throw new Error('Access denied. Only the task owner can delete it.');
  }

  const batch = writeBatch(db);

  batch.delete(taskDocRef);
  
  await deleteIssuesForTask(taskId, userUid); 

  if (!taskToDelete.parentId) { 
    const subTasksQuery = query(tasksCollection, where('parentId', '==', taskId)); 
    const subTasksSnapshot = await getDocs(subTasksQuery);
    
    for (const subTaskDoc of subTasksSnapshot.docs) {
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

    const taskIdsToDeleteIssuesFor: string[] = [];
    tasksSnapshot.forEach(taskDoc => {
        taskIdsToDeleteIssuesFor.push(taskDoc.id);
        batch.delete(taskDoc.ref); 
    });
    
    for (const taskId of taskIdsToDeleteIssuesFor) {
        await deleteIssuesForTask(taskId, projectOwnerUid); 
    }

    await batch.commit(); 
    console.log(`taskService: Successfully deleted all tasks and their issues for project ${projectId}.`);

  } catch (error: any) {
    console.error(`taskService: Error in deleteAllTasksForProject for projectId ${projectId} by user ${projectOwnerUid}:`, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const getAllTasksAssignedToUser = async (userUid: string): Promise<Task[]> => {
  if (!userUid) return [];
  console.log(`taskService: getAllTasksAssignedToUser (sub-tasks) for userUid: ${userUid}`);

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


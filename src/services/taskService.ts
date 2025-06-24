
import { db } from '@/lib/firebase';
import type { Task, TaskStatus, UserRole, AggregatedEvent, ProjectAggregatedEvent, TimelineEvent, Issue } from '@/types';
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
  documentId,
  arrayUnion,
} from 'firebase/firestore';
import { deleteIssuesForTask, getOpenIssuesForTaskIds } from './issueService';
import { logTimelineEvent, getTimelineForTask } from '@/services/timelineService';
import { format } from 'date-fns';

const tasksCollection = collection(db, 'tasks');

interface CreateTaskData {
  name: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: Date | null;
  parentId?: string | null;
  assignedToUids?: string[] | null;
  assignedToNames?: string[] | null;
  taskType?: 'standard' | 'collection';
  reminderDays?: number | null;
  cost?: number | null;
}

export const mapDocumentToTask = (docSnapshot: any): Task => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    projectId: data.projectId,
    projectOwnerUid: data.projectOwnerUid,
    clientUid: data.clientUid || null,
    parentId: data.parentId || null,
    name: data.name,
    description: data.description || '',
    status: data.status as TaskStatus,
    taskType: data.taskType || 'standard',
    reminderDays: data.reminderDays || null,
    cost: data.cost || null,
    ownerUid: data.ownerUid,
    ownerName: data.ownerName || null,
    assignedToUids: data.assignedToUids || [],
    assignedToNames: data.assignedToNames || [],
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
    dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : new Date()), // ensure subtask has date, main task can be null
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : undefined),
    progress: data.progress, // Will be populated for main tasks by calling functions
    openIssueCount: data.openIssueCount, // Will be populated for main tasks
    isOverdue: data.isOverdue, // Will be populated for main tasks
  };
};

export const createTask = async (
  projectId: string,
  userUid: string,
  ownerName: string,
  taskData: CreateTaskData
): Promise<string> => {
  if (!userUid) throw new Error('User not authenticated for creating task');

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  
  if (!projectSnap.exists()) {
      throw new Error('Project not found.');
  }

  const projectData = projectSnap.data();

  const isOwnerOrAdmin = projectData.ownerUid === userUid;
  if (!isOwnerOrAdmin) {
    const userDocSnap = await getDoc(doc(db, 'users', userUid));
    if (userDocSnap.data()?.role !== 'admin') {
      throw new Error('Access denied for creating task in this project.');
    }
  }

  const newTaskPayload: any = {
    projectId,
    projectOwnerUid: projectData.ownerUid, // Storing project owner UID for rules
    clientUid: projectData.clientUid || null, // Denormalize client Uid for rules
    ownerUid: userUid,
    ownerName: ownerName,
    name: taskData.name,
    parentId: taskData.parentId || null,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  if (taskData.parentId) { 
    newTaskPayload.description = taskData.description || '';
    newTaskPayload.status = taskData.status || 'To Do';
    if (taskData.dueDate === undefined || taskData.dueDate === null) { 
        throw new Error('Due date is required for sub-tasks.');
    }
    newTaskPayload.dueDate = Timestamp.fromDate(taskData.dueDate);
    newTaskPayload.assignedToUids = taskData.assignedToUids || [];
    newTaskPayload.assignedToNames = taskData.assignedToNames || [];
    newTaskPayload.taskType = 'standard'; // Sub-tasks are always standard
    newTaskPayload.cost = null;
  } else { 
    newTaskPayload.description = taskData.description || ''; 
    newTaskPayload.status = 'To Do'; 
    if (taskData.dueDate === undefined || taskData.dueDate === null) {
      throw new Error('Due date is required for main tasks.');
    }
    newTaskPayload.dueDate = Timestamp.fromDate(taskData.dueDate);
    newTaskPayload.assignedToUids = []; 
    newTaskPayload.assignedToNames = [];
    newTaskPayload.taskType = taskData.taskType || 'standard';
    newTaskPayload.reminderDays = taskData.taskType === 'collection' ? (taskData.reminderDays || null) : null;
    newTaskPayload.cost = taskData.taskType === 'collection' ? (taskData.cost || null) : null;
  }

  try {
    const newTaskRef = await addDoc(tasksCollection, newTaskPayload);
    const newTaskId = newTaskRef.id;

    // If it's a sub-task, update the project's memberUids list
    if (newTaskPayload.parentId && newTaskPayload.assignedToUids && newTaskPayload.assignedToUids.length > 0) {
        await updateDoc(projectDocRef, {
            memberUids: arrayUnion(...newTaskPayload.assignedToUids)
        });
    }
    
    if (newTaskPayload.parentId) {
      await logTimelineEvent(
        newTaskId,
        userUid,
        'TASK_CREATED',
        'timeline.subTaskCreated'
      );
      if (newTaskPayload.assignedToUids.length > 0) {
          const names = newTaskPayload.assignedToNames.join(', ');
          await logTimelineEvent(
            newTaskId,
            userUid,
            'ASSIGNMENT_CHANGED',
            'timeline.assignmentChanged',
            { names: names }
          );
      }
    } else { 
        let descriptionKey = 'timeline.mainTaskCreated';
        const details: Record<string, any> = {};
        if (newTaskPayload.taskType === 'collection' && newTaskPayload.cost) {
            descriptionKey = 'timeline.collectionTaskCreated';
            details.cost = newTaskPayload.cost;
        }
        await logTimelineEvent(
            newTaskId,
            userUid,
            'TASK_CREATED',
            descriptionKey,
            details
        );
    }

    return newTaskId;

  } catch (error: any) {
    console.error('taskService: Error creating task:', error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

const augmentMainTasksWithProgress = async (mainTasks: Task[], projectId: string): Promise<Task[]> => {
    if (mainTasks.length === 0) return [];
    
    const subTasksQuery = query(tasksCollection, where('projectId', '==', projectId), where('parentId', '!=', null));
    const subTasksSnapshot = await getDocs(subTasksQuery);
    const allSubTasksInProject = subTasksSnapshot.docs.map(mapDocumentToTask);
    
    const subTasksByMainTaskId = allSubTasksInProject.reduce((acc, subTask) => {
        const mainTaskId = subTask.parentId!;
        if (!acc[mainTaskId]) {
            acc[mainTaskId] = [];
        }
        acc[mainTaskId].push(subTask);
        return acc;
    }, {} as Record<string, Task[]>);

    mainTasks.forEach(mainTask => {
        if (mainTask.taskType === 'collection') {
            mainTask.progress = 0;
        } else {
            const relatedSubTasks = subTasksByMainTaskId[mainTask.id] || [];
            if (relatedSubTasks.length > 0) {
              const completedSubTasks = relatedSubTasks.filter(st => st.status === 'Completed').length;
              mainTask.progress = Math.round((completedSubTasks / relatedSubTasks.length) * 100);
              if (mainTask.progress === 100) mainTask.status = 'Completed';
              else if (mainTask.progress > 0 || relatedSubTasks.some(st => st.status === 'In Progress')) mainTask.status = 'In Progress';
              else mainTask.status = 'To Do';
            } else {
              mainTask.progress = 0;
              mainTask.status = 'To Do';
            }
        }
    });

    return mainTasks;
};

export const getProjectMainTasks = async (projectId: string, userUid: string, filterByIds?: string[]): Promise<Task[]> => {
    console.log(`taskService: getProjectMainTasks for projectId: ${projectId}, user: ${userUid}, filterByIds: ${filterByIds?.join(',')}`);

    let mainTasks: Task[];

    if (filterByIds && filterByIds.length > 0) {
        const mainTaskPromises = filterByIds.map(id => getDoc(doc(db, 'tasks', id)));
        const mainTaskSnapshots = await Promise.all(mainTaskPromises);
        mainTasks = mainTaskSnapshots.filter(snap => snap.exists()).map(mapDocumentToTask);
    } else {
        const q = query(
            tasksCollection, 
            where('projectId', '==', projectId), 
            where('parentId', '==', null)
        );
        const snapshot = await getDocs(q);
        mainTasks = snapshot.docs.map(mapDocumentToTask);
    }
    
    if (mainTasks.length === 0) {
        return [];
    }

    const augmentedTasks = await augmentMainTasksWithProgress(mainTasks, projectId);

    augmentedTasks.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    
    return augmentedTasks;
};

export const getSubTasks = async (parentId: string): Promise<Task[]> => {
  console.log(`taskService: getSubTasks for parentId: ${parentId}`);
  if (!parentId) {
    console.warn('taskService: getSubTasks called with no parentId.');
    return [];
  }

  const q = query(
    tasksCollection,
    where('parentId', '==', parentId)
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    
    tasks.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));

    console.log(`taskService: Fetched ${tasks.length} sub-tasks for parentId ${parentId}.`);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error fetching sub-tasks for parentId: ${parentId}`, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
       const indexFields = "parentId (ASC)";
       console.error(`Firestore query for sub-tasks requires an index. Please create it in the Firebase console. Fields: ${indexFields}. The error message from Firebase usually provides a direct link to create it.`);
    }
    throw error;
  }
};

export const getProjectSubTasks = async (projectId: string, userUid: string, userRole?: UserRole): Promise<Task[]> => {
  console.log(`taskService: getProjectSubTasks for projectId: ${projectId}, user: ${userUid}, role: ${userRole}`);
  if (!projectId || !userUid) return [];
  
  let q;
  if (userRole === 'supervisor' || userRole === 'member') {
      q = query(tasksCollection, where('projectId', '==', projectId), where('assignedToUids', 'array-contains', userUid));
  } else { 
      q = query(tasksCollection, where('projectId', '==', projectId), where('parentId', '!=', null));
  }

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask).filter(t => t.parentId);
    console.log(`taskService: Fetched ${tasks.length} sub-tasks for project ${projectId} for user ${userUid}.`);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error fetching sub-tasks for project ${projectId}`, error.message);
    if (error.message.includes("index")) {
      console.error("Firestore query for getProjectSubTasks requires a composite index.");
    }
    throw error;
  }
};


export const getProjectSubTasksAssignedToUser = async (projectId: string, userUid: string): Promise<Task[]> => {
  console.log(`taskService: getProjectSubTasksAssignedToUser for projectId: ${projectId}, userUid: ${userUid}`);
  if (!projectId || !userUid) return [];

  const q = query(
    tasksCollection,
    where('projectId', '==', projectId),
    where('assignedToUids', 'array-contains', userUid),
    where('parentId', '!=', null)
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    console.log(`taskService: Fetched ${tasks.length} sub-tasks assigned to user ${userUid} in project ${projectId}.`);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error in getProjectSubTasksAssignedToUser for projectId: ${projectId}, userUid: ${userUid}`, error.message, error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getProjectSubTasksAssignedToUser requires a composite index. Fields: projectId (ASC), assignedToUids (ARRAY_CONTAINS), parentId (!= null). Check Firebase console.");
    }
    throw error;
  }
};

export const getTaskById = async (taskId: string, userUid: string, userRole?: UserRole): Promise<Task | null> => {
    if (!userUid) { throw new Error('User not authenticated'); }

    console.log(`[taskService.getTaskById] Attempting to fetch task: ${taskId} for user: ${userUid}, role: ${userRole}`);
    const taskDocRef = doc(db, 'tasks', taskId);

    try {
        const taskSnap = await getDoc(taskDocRef);

        if (!taskSnap.exists()) {
            console.warn(`[taskService.getTaskById] Task ${taskId} not found in Firestore.`);
            return null;
        }

        return mapDocumentToTask(taskSnap);

    } catch (error: any) {
        console.error(`[taskService.getTaskById] Error fetching task ${taskId}.`, error);
        if ((error as any)?.code === 'permission-denied') {
            throw new Error(`Access denied when fetching task ${taskId}. Please check your Firestore security rules to ensure you have read access to this specific task document.`);
        }
        throw error;
    }
};

export const getTasksByIds = async (taskIds: string[]): Promise<Task[]> => {
  if (taskIds.length === 0) {
    return [];
  }
  const tasks: Task[] = [];
  for (let i = 0; i < taskIds.length; i += 30) {
    const chunk = taskIds.slice(i, i + 30);
    const q = query(tasksCollection, where(documentId(), 'in', chunk));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      tasks.push(mapDocumentToTask(doc));
    });
  }
  return tasks;
};

export const getAllProjectTasks = async (projectId: string): Promise<Task[]> => {
    if (!projectId) return [];
    console.log(`taskService: getAllProjectTasks for projectId: ${projectId}`);
    const q = query(tasksCollection, where('projectId', '==', projectId));
    try {
        const querySnapshot = await getDocs(q);
        const tasks = querySnapshot.docs.map(mapDocumentToTask);
        console.log(`taskService: Fetched ${tasks.length} total tasks for project ${projectId}.`);
        return tasks;
    } catch(e: any) {
        console.error(`taskService: Error fetching all tasks for project ${projectId}`, e);
        throw e;
    }
}

interface UpdateTaskData {
    name?: string;
    description?: string;
    status?: TaskStatus;
    dueDate?: Date | null;
    assignedToUids?: string[] | null;
    assignedToNames?: string[] | null;
    taskType?: 'standard' | 'collection';
    reminderDays?: number | null;
    cost?: number | null;
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
  const isAssignedUser = !!taskDataFromSnap.parentId && (taskDataFromSnap.assignedToUids?.includes(userUid) ?? false);


  const updatePayload: any = { updatedAt: serverTimestamp() as Timestamp };

  if (taskDataFromSnap.parentId) { 
    if (!isOwner && !isAssignedUser) {
      throw new Error('Access denied. You must own or be assigned to this sub-task to update it.');
    }
    
    if (isOwner) { 
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
    } else if (isAssignedUser) { 
      const allowedUpdates: { status?: TaskStatus, description?: string, dueDate?: Date | null | Timestamp } = {};
      let hasAllowedUpdate = false;

      if (updates.status !== undefined) { allowedUpdates.status = updates.status; hasAllowedUpdate = true;}
      if (updates.description !== undefined) { allowedUpdates.description = updates.description; hasAllowedUpdate = true;}
      if (updates.dueDate !== undefined) {
          allowedUpdates.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
          hasAllowedUpdate = true;
      }

      const attemptedKeys = Object.keys(updates) as (keyof UpdateTaskData)[];
      const forbiddenAttempts = attemptedKeys.filter(key =>
          (updates as any)[key] !== undefined &&
          !['status', 'description', 'dueDate'].includes(key)
      );

      if (forbiddenAttempts.length > 0) {
          throw new Error(`Assigned users can only update status, description, or due date of sub-tasks. Attempted to change: ${forbiddenAttempts.join(', ')}`);
      }
      if(hasAllowedUpdate) {
        Object.assign(updatePayload, allowedUpdates);
      } else {
        if (Object.keys(updatePayload).length === 1 && updatePayload.updatedAt) return;
      }
    }
  } else { // This is a Main Task
    if (!isOwner) {
      throw new Error('Access denied. Only the project owner can edit main task details.');
    }
    let detailsChanged = false;
    if (updates.name !== undefined && updates.name !== taskDataFromSnap.name) {
      updatePayload.name = updates.name;
      detailsChanged = true;
    }
    if (updates.description !== undefined && updates.description !== taskDataFromSnap.description) {
      updatePayload.description = updates.description;
      detailsChanged = true;
    }
    if (updates.taskType !== undefined && updates.taskType !== taskDataFromSnap.taskType) {
      updatePayload.taskType = updates.taskType;
      updatePayload.reminderDays = updates.taskType === 'collection' ? (updates.reminderDays || null) : null;
      updatePayload.cost = updates.taskType === 'collection' ? (updates.cost || null) : null;
      detailsChanged = true;
    } else {
        if (updates.reminderDays !== undefined && updates.reminderDays !== taskDataFromSnap.reminderDays) {
          updatePayload.reminderDays = taskDataFromSnap.taskType === 'collection' ? (updates.reminderDays || null) : null;
          detailsChanged = true;
        }
        if (updates.cost !== undefined && updates.cost !== taskDataFromSnap.cost) {
          updatePayload.cost = taskDataFromSnap.taskType === 'collection' ? (updates.cost || null) : null;
          detailsChanged = true;
        }
    }

    if (updates.dueDate !== undefined) {
        const newDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
        const oldDate = taskDataFromSnap.dueDate ? Timestamp.fromDate(taskDataFromSnap.dueDate) : null;
        if (newDate?.toMillis() !== oldDate?.toMillis()) {
            updatePayload.dueDate = newDate;
            detailsChanged = true;
        }
    }
    
    if (detailsChanged) {
        let descriptionKey = 'timeline.mainTaskUpdated';
        const details: Record<string, any> = {};
        
        const oldCost = taskDataFromSnap.cost || 0;
        const newCost = updates.cost !== undefined ? (updates.cost || 0) : oldCost;

        if (taskDataFromSnap.taskType === 'collection' && newCost !== oldCost) {
             descriptionKey = 'timeline.collectionCostUpdated';
             details.oldCost = oldCost;
             details.newCost = newCost;
             (details.updatedFields as string[]).push('cost');
        } else if (updates.name && updates.name !== taskDataFromSnap.name) {
             descriptionKey = 'timeline.taskRenamed';
             details.newName = updates.name;
             (details.updatedFields as string[]).push('name');
        } else if (updates.dueDate) {
            const newDate = updates.dueDate ? updates.dueDate : new Date();
            const oldDate = taskDataFromSnap.dueDate ? taskDataFromSnap.dueDate : new Date();
            if(format(newDate, 'PP') !== format(oldDate, 'PP')){
                descriptionKey = 'timeline.dueDateUpdated';
                details.newDueDate = format(newDate, 'PP');
                (details.updatedFields as string[]).push('dueDate');
            }
        }
        await logTimelineEvent(
            taskId,
            userUid,
            'MAIN_TASK_UPDATED',
            descriptionKey,
            details
        );
    }
    
    const allowedMainTaskKeys = ['name', 'description', 'dueDate', 'updatedAt', 'taskType', 'reminderDays', 'cost'];
    Object.keys(updatePayload).forEach(key => {
        if (!allowedMainTaskKeys.includes(key as string)) {
            delete updatePayload[key];
        }
    });

    if (Object.keys(updatePayload).length <= 1) return;
  }
  
  if (updates.assignedToUids !== undefined && JSON.stringify(updates.assignedToUids) !== JSON.stringify(taskDataFromSnap.assignedToUids)) {
    await logTimelineEvent(
      taskId,
      userUid,
      'ASSIGNMENT_CHANGED',
      'timeline.assignmentChanged',
      { names: updates.assignedToNames?.join(', ') || 'nobody' }
    );
     // Denormalize new members to the project
    const newUids = updates.assignedToUids || [];
    if (newUids.length > 0) {
      const projectDocRef = doc(db, 'projects', taskDataFromSnap.projectId);
      await updateDoc(projectDocRef, { memberUids: arrayUnion(...newUids) });
    }
  }

  if (updates.status !== undefined && updates.status !== taskDataFromSnap.status) {
      await logTimelineEvent(
        taskId,
        userUid,
        'STATUS_CHANGED',
        'timeline.statusChanged',
        { oldStatus: taskDataFromSnap.status, newStatus: updates.status }
    );
  }

  if (Object.keys(updatePayload).length > 1) {
    await updateDoc(taskDocRef, updatePayload);
  }
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
  const isAssignedUser = !!taskData.parentId && (taskData.assignedToUids?.includes(userUid) ?? false);
  const isCollectionTask = !taskData.parentId && taskData.taskType === 'collection';

  if (taskData.parentId || isCollectionTask) {
    if (!isOwner && !isAssignedUser) {
      throw new Error('Access denied for status update. Task not owned by you, or you are not assigned to it.');
    }

    if (status === 'Completed' && taskData.parentId) {
      // This check is now performed in the UI layer (TaskCard) before calling this function.
      // This helps break the circular dependency.
    }

    const oldStatus = taskData.status;
    if (oldStatus !== status) {
      await updateDoc(taskDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
      await logTimelineEvent(
        taskId,
        userUid,
        'STATUS_CHANGED',
        'timeline.statusChanged',
        { oldStatus, newStatus: status }
      );

      if (status === 'Completed' && taskData.parentId) {
        const subTasks = await getSubTasks(taskData.parentId);
        const allComplete = subTasks.every(st => {
            if (st.id === taskId) return true; // The one we just updated
            return st.status === 'Completed';
        });

        if (allComplete) {
            const mainTaskDocRef = doc(db, 'tasks', taskData.parentId);
            const mainTaskSnap = await getDoc(mainTaskDocRef);
            if (mainTaskSnap.exists()) {
                await logTimelineEvent(
                    taskData.parentId,
                    userUid,
                    'MAIN_TASK_COMPLETED',
                    'timeline.mainTaskCompleted'
                );
            }
        }
      }

      if (oldStatus === 'Completed' && status !== 'Completed' && taskData.parentId) {
        const parentId = taskData.parentId;
        const siblingSubTasks = await getSubTasks(parentId);

        const allOtherSubTasksWereCompleted = siblingSubTasks
            .filter(st => st.id !== taskId)
            .every(st => st.status === 'Completed');
        
        if (allOtherSubTasksWereCompleted) {
            await logTimelineEvent(
                parentId,
                userUid,
                'MAIN_TASK_REOPENED',
                'timeline.mainTaskReopened',
                { subTaskName: taskData.name }
            );
        }
      }
    }
  } else {
    console.warn(`taskService: Attempted to update status for standard main task ${taskId} via updateTaskStatus, which is not directly applicable. Status is derived from sub-tasks.`);
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
    const userDoc = await getDoc(doc(db, 'users', userUid));
    if (userDoc.data()?.role !== 'admin') {
      throw new Error('Access denied. Only the task owner or an admin can delete it.');
    }
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
    console.log(`taskService: Task ${taskId} and its associated data (issues, sub-tasks if main task) deleted by user ${userUid}.`);
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
    where('assignedToUids', 'array-contains', userUid)
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask).filter(task => task.parentId);
    
    tasks.sort((a, b) => {
        if (a.parentId === b.parentId) {
            return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
        }
        return (a.parentId || '').localeCompare(b.parentId || '');
    });

    if (tasks.length === 0) {
      console.log(`taskService: getAllTasksAssignedToUser - Query executed successfully but found 0 sub-tasks assigned to user ${userUid}.`);
    } else {
      console.log(`taskService: Fetched ${tasks.length} sub-tasks assigned to user ${userUid}`);
    }
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching all sub-tasks assigned to user:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAllTasksAssignedToUser requires a composite index on `assignedToUids` (array-contains). Check Firebase console.");
    }
    throw error;
  }
};

export const countProjectSubTasks = async (projectId: string, userUid: string): Promise<number> => {
  console.log(`taskService: countProjectSubTasks (DEBUG MODE) called for projectId: ${projectId} by user: ${userUid}`);
  if (!projectId || !userUid) {
    console.warn('taskService: countProjectSubTasks (DEBUG MODE) called with no projectId or userUid.');
    return 0;
  }

  const q = query(
    tasksCollection,
    where('projectId', '==', projectId),
    where('parentId', '!=', null)
  );

  try {
    const querySnapshot = await getDocs(q);
    const count = querySnapshot.size;
    if (count === 0) {
      console.warn(`taskService: countProjectSubTasks (DEBUG MODE) - Query for projectId '${projectId}' (parentId != null) executed successfully using getDocs but returned 0 sub-tasks. Docs found by query: []. Please verify data and/or Firestore indexes if this is unexpected. Ensure tasks intended as sub-tasks have a non-null 'parentId' and the correct 'projectId'.`);
    } else {
      const docsFound = querySnapshot.docs.map(d => ({ id: d.id, parentId: d.data().parentId, projectId: d.data().projectId, name: d.data().name}));
      console.log(`taskService: countProjectSubTasks (DEBUG MODE) - Successfully queried using getDocs. Found ${count} sub-tasks for project ${projectId}. Docs: ${JSON.stringify(docsFound)}`);
    }
    return count;
  } catch (error: any) {
    const e = error as { code?: string; message?: string };
    console.error(`\n\n🚨 taskService: Error counting sub-tasks for project ${projectId} (DEBUG MODE - using getDocs). Message: ${e.message}. Code: ${e.code || 'N/A'}. Full error:\n`, error);
    if (e.code === 'failed-precondition' && e.message && e.message.toLowerCase().includes("index")) {
      console.error(`\n\n🚨🚨🚨 Firestore Index Might Be Required or Query Failed for countProjectSubTasks (DEBUG MODE) 🚨🚨🚨\n` +
        `PROJECT ID: '${projectId}'\n` +
        `QUERY: Firestore query on 'tasks' collection where 'projectId' == '${projectId}' AND 'parentId' != null.\n` +
        `COMMON CAUSE: This type of query often requires a composite index.\n` +
        `SUGGESTED INDEX:\n` +
        `  - Collection: 'tasks'\n` +
        `  - Fields:\n` +
        `    1. 'projectId' (Ascending)\n` +
        `    2. 'parentId' (Ascending OR Descending - Firestore will guide you if a specific direction is needed for '!=' queries)\n` +
        `ACTION: Please check your Firebase Console -> Firestore Database -> Indexes. If the exact error message from Firebase provides a direct link to create the index, use that.\n` +
        `Original error message: ${e.message}\n` +
        `Error code: ${e.code}\n\n`);
    } else if (e.message && e.message.toLowerCase().includes("index")) {
        console.error(`An index-related error occurred while counting sub-tasks for project ${projectId}. Please check your Firestore indexes for the 'tasks' collection. Query: projectId == ${projectId}, parentId != null.`);
    }
    return 0; 
  }
};


export const countProjectMainTasks = async (projectId: string, userUid: string): Promise<number> => {
  if (!projectId || !userUid) {
    console.warn('taskService: countProjectMainTasks called with no projectId or userUid.');
    return 0;
  }
  console.log(`taskService: countProjectMainTasks called for projectId: ${projectId} by user ${userUid}`);

  const q = query(
    tasksCollection,
    where('projectId', '==', projectId),
    where('parentId', '==', null)
  );

  try {
    const snapshot = await getCountFromServer(q);
    const count = snapshot.data().count;
    console.log(`taskService: Successfully queried. Found ${count} main tasks for project ${projectId}.`);
    return count;
  } catch (error: any) {
    const e = error as { code?: string; message?: string };
    console.error(`taskService: Error counting main tasks for project ${projectId}. Message: ${e.message}. Code: ${e.code || 'N/A'}. Full error:`, error);
    if (e.code === 'failed-precondition' && e.message && e.message.toLowerCase().includes("index")) {
      console.error(`\n\n🚨🚨🚨 Firestore Index Required 🚨🚨🚨\n` +
        `The query to count main tasks for project '${projectId}' failed because a Firestore index is missing or not yet active.\n` +
        `DETAILS:\n` +
        ` - Collection: 'tasks'\n` +
        ` - Query conditions: projectId == '${projectId}', parentId == null\n` +
        ` - Likely required index fields: 'projectId' (Ascending), 'parentId' (Ascending).\n` +
        `Please go to your Firebase Console -> Firestore Database -> Indexes, and create the required composite index.\n` +
        `The detailed error message from Firebase (often including a URL to create the index) might be visible in your browser's network tab for the failing request, or earlier in the console if not caught cleanly.\n\n`);
    } else if (e.message && e.message.toLowerCase().includes("index")) {
        console.error(`An index-related error occurred while counting main tasks for project ${projectId}. Please check your Firestore indexes for the 'tasks' collection. Query: projectId == ${projectId}, parentId == null.`);
    } else {
      console.error(`An unexpected error occurred while counting main tasks for project ${projectId}.`);
    }
    return 0; 
  }
};

// Functions moved from timelineService to break circular dependency

/**
 * Fetches an aggregated timeline for a main task, including its own events and grouped events from its sub-tasks.
 * @param mainTaskId The ID of the main task.
 * @returns A promise that resolves to an array of aggregated events, sorted by timestamp.
 */
export const getTimelineForMainTask = async (mainTaskId: string): Promise<AggregatedEvent[]> => {
  try {
    // 1. Fetch main task's own timeline events
    const mainTaskEvents = await getTimelineForTask(mainTaskId);
    const aggregatedMainTaskEvents: AggregatedEvent[] = mainTaskEvents.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      type: 'mainTaskEvent',
      data: event,
    }));

    // 2. Fetch sub-tasks and their timelines
    const subTasks = await getSubTasks(mainTaskId);
    const subTaskTimelinePromises = subTasks.map(async (subTask) => {
      const events = await getTimelineForTask(subTask.id);
      if (events.length > 0) {
        return {
          id: subTask.id,
          timestamp: events[0].timestamp, // The latest event's timestamp for sorting
          type: 'subTaskEventGroup' as const,
          data: {
            subTaskInfo: { id: subTask.id, name: subTask.name },
            events: events,
          },
        };
      }
      return null;
    });

    const subTaskEventGroupsWithNulls = await Promise.all(subTaskTimelinePromises);
    const aggregatedSubTaskEvents = subTaskEventGroupsWithNulls.filter((group): group is AggregatedEvent => group !== null);

    // 3. Combine and sort
    const combinedEvents = [...aggregatedMainTaskEvents, ...aggregatedSubTaskEvents];
    combinedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return combinedEvents;
    
  } catch (error) {
    console.error(`TimelineService: Failed to aggregate timeline for main task ${mainTaskId}`, error);
    return [];
  }
};

/**
 * Fetches an aggregated timeline for a project, grouping events by main tasks.
 * @param projectId The ID of the project.
 * @returns A promise that resolves to an array of project-aggregated events.
 */
export const getTimelineForProject = async (projectId: string, userUid: string): Promise<ProjectAggregatedEvent[]> => {
  try {
    const mainTasks = await getProjectMainTasks(projectId, userUid);

    const projectTimelinePromises = mainTasks.map(async (mainTask) => {
      const events = await getTimelineForMainTask(mainTask.id);
      if (events.length > 0) {
        return {
          id: mainTask.id,
          timestamp: events[0].timestamp, // Latest event for sorting
          type: 'mainTaskGroup' as const,
          data: {
            mainTaskInfo: { id: mainTask.id, name: mainTask.name, taskType: mainTask.taskType },
            events: events,
          },
        };
      }
      return null;
    });

    const projectEventGroupsWithNulls = await Promise.all(projectTimelinePromises);
    const aggregatedProjectEvents = projectEventGroupsWithNulls.filter((group): group is ProjectAggregatedEvent => group !== null);

    aggregatedProjectEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return aggregatedProjectEvents;

  } catch (error) {
    console.error(`TimelineService: Failed to aggregate timeline for project ${projectId}`, error);
    return [];
  }
};

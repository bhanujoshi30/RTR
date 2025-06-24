
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
    dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : new Date()),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : undefined),
    progress: data.progress,
    openIssueCount: data.openIssueCount,
    isOverdue: data.isOverdue,
    displaySubTaskCountLabel: data.displaySubTaskCountLabel,
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
    projectOwnerUid: projectData.ownerUid,
    clientUid: projectData.clientUid || null,
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
    newTaskPayload.taskType = 'standard';
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

export const getProjectMainTasks = async (projectId: string, userUid: string, filterByIds?: string[], userRole?: UserRole): Promise<Task[]> => {
    let mainTasks: Task[];

    if (filterByIds && filterByIds.length > 0) {
        const mainTaskPromises = filterByIds.map(id => getDoc(doc(db, 'tasks', id)));
        const mainTaskSnapshots = await Promise.all(mainTaskPromises);
        mainTasks = mainTaskSnapshots.filter(snap => snap.exists()).map(mapDocumentToTask);
    } else {
        const queryConstraints = [
            where('projectId', '==', projectId), 
            where('parentId', '==', null)
        ];

        if (userRole === 'client') {
            const projectDoc = await getDoc(doc(db, 'projects', projectId));
            if (!projectDoc.exists() || projectDoc.data().clientUid !== userUid) {
                return []; // Return empty if client is not assigned to project
            }
        }

        const q = query(tasksCollection, ...queryConstraints);
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
  if (!parentId) {
    return [];
  }
  const q = query(tasksCollection, where('parentId', '==', parentId));
  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    tasks.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error fetching sub-tasks for parentId: ${parentId}`, error.message, error.stack);
    throw error;
  }
};

export const getProjectSubTasks = async (projectId: string, userUid: string, userRole?: UserRole): Promise<Task[]> => {
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
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error fetching sub-tasks for project ${projectId}`, error.message);
    throw error;
  }
};


export const getProjectSubTasksAssignedToUser = async (projectId: string, userUid: string): Promise<Task[]> => {
  if (!projectId || !userUid) return [];
  const q = query(tasksCollection, where('projectId', '==', projectId), where('assignedToUids', 'array-contains', userUid), where('parentId', '!=', null));
  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask);
    return tasks;
  } catch (error: any) {
    console.error(`taskService: Error in getProjectSubTasksAssignedToUser`, error);
    throw error;
  }
};

export const getTaskById = async (taskId: string, userUid: string, userRole?: UserRole): Promise<Task | null> => {
    if (!userUid) { throw new Error('User not authenticated'); }
    const taskDocRef = doc(db, 'tasks', taskId);
    try {
        const taskSnap = await getDoc(taskDocRef);
        if (!taskSnap.exists()) {
            return null;
        }
        return mapDocumentToTask(taskSnap);
    } catch (error: any) {
        console.error(`[taskService.getTaskById] Error fetching task ${taskId}.`, error);
        throw error;
    }
};

export const getAllProjectTasks = async (projectId: string, userRole?: UserRole, userUid?: string): Promise<Task[]> => {
    if (!projectId) return [];
    
    const queryConstraints = [where('projectId', '==', projectId)];
    
    // For clients, we need to ensure they can list tasks for projects they are a client of
    // The security rules will enforce this, but the query itself doesn't need a clientUid filter
    // if the rules are set up to allow listing by project id for clients.
    
    const q = query(tasksCollection, ...queryConstraints);

    try {
        const querySnapshot = await getDocs(q);
        let tasks = querySnapshot.docs.map(mapDocumentToTask);

        // For clients, filter out sub-tasks as they should only see main tasks
        if (userRole === 'client') {
            tasks = tasks.filter(task => !task.parentId);
        }
        
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
        if (updates.assignedToUids && updates.assignedToUids.length > 0) {
            const projectDocRef = doc(db, 'projects', taskDataFromSnap.projectId);
            await updateDoc(projectDocRef, { memberUids: arrayUnion(...updates.assignedToUids) });
        }
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
      const forbiddenAttempts = Object.keys(updates).filter(key => !['status', 'description', 'dueDate'].includes(key));
      if (forbiddenAttempts.length > 0) {
          throw new Error(`Assigned users can only update status, description, or due date of sub-tasks. Attempted to change: ${forbiddenAttempts.join(', ')}`);
      }
      if(hasAllowedUpdate) {
        Object.assign(updatePayload, allowedUpdates);
      } else {
        if (Object.keys(updatePayload).length === 1 && updatePayload.updatedAt) return;
      }
    }
  } else { 
    if (!isOwner) {
      throw new Error('Access denied. Only the project owner can edit main task details.');
    }
    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.dueDate !== undefined) updatePayload.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
    if (updates.taskType !== undefined) {
        updatePayload.taskType = updates.taskType;
        updatePayload.reminderDays = updates.taskType === 'collection' ? (updates.reminderDays || null) : null;
        updatePayload.cost = updates.taskType === 'collection' ? (updates.cost || null) : null;
    } else {
        if (updates.reminderDays !== undefined) updatePayload.reminderDays = taskDataFromSnap.taskType === 'collection' ? (updates.reminderDays || null) : null;
        if (updates.cost !== undefined) updatePayload.cost = taskDataFromSnap.taskType === 'collection' ? (updates.cost || null) : null;
    }
  }
  
  if (updates.assignedToUids && JSON.stringify(updates.assignedToUids) !== JSON.stringify(taskDataFromSnap.assignedToUids)) {
    await logTimelineEvent(taskId, userUid, 'ASSIGNMENT_CHANGED', 'timeline.assignmentChanged', { names: updates.assignedToNames?.join(', ') || 'nobody' });
  }

  if (updates.status && updates.status !== taskDataFromSnap.status) {
      await logTimelineEvent(taskId, userUid, 'STATUS_CHANGED', 'timeline.statusChanged', { oldStatus: taskDataFromSnap.status, newStatus: updates.status });
  }

  if (Object.keys(updatePayload).length > 1) {
    await updateDoc(taskDocRef, updatePayload);
  }
};


export const updateTaskStatus = async (taskId: string, userUid: string, status: TaskStatus, userRole?: UserRole): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for updating task status');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists()) throw new Error('Task not found for status update.');

  const taskData = mapDocumentToTask(taskSnap);
  const isOwner = taskData.ownerUid === userUid;
  const isAssignedUser = !!taskData.parentId && (taskData.assignedToUids?.includes(userUid) ?? false);
  const isCollectionTask = !taskData.parentId && taskData.taskType === 'collection';

  if (taskData.parentId || isCollectionTask) {
    if (!isOwner && !isAssignedUser) throw new Error('Access denied for status update. Task not owned by you, or you are not assigned to it.');

    const oldStatus = taskData.status;
    if (oldStatus !== status) {
      await updateDoc(taskDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
      await logTimelineEvent(taskId, userUid, 'STATUS_CHANGED', 'timeline.statusChanged', { oldStatus, newStatus: status });

      if (status === 'Completed' && taskData.parentId) {
        const subTasks = await getSubTasks(taskData.parentId);
        const allComplete = subTasks.every(st => (st.id === taskId) ? true : st.status === 'Completed');
        if (allComplete) {
            await logTimelineEvent(taskData.parentId, userUid, 'MAIN_TASK_COMPLETED', 'timeline.mainTaskCompleted');
        }
      }

      if (oldStatus === 'Completed' && status !== 'Completed' && taskData.parentId) {
          await logTimelineEvent(taskData.parentId, userUid, 'MAIN_TASK_REOPENED', 'timeline.mainTaskReopened', { subTaskName: taskData.name });
      }
    }
  } else {
    console.warn(`taskService: Attempted to update status for standard main task ${taskId} directly.`);
  }
};


export const deleteTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting task');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);

  if (!taskSnap.exists()) throw new Error('Task not found for deletion.');
  
  const taskToDelete = mapDocumentToTask(taskSnap);
  const userDoc = await getDoc(doc(db, 'users', userUid));
  if (taskToDelete.ownerUid !== userUid && userDoc.data()?.role !== 'admin') {
    throw new Error('Access denied. Only the task owner or an admin can delete it.');
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
  await batch.commit();
};

export const deleteAllTasksForProject = async (projectId: string, projectOwnerUid: string): Promise<void> => {
  if (!projectOwnerUid) throw new Error("User not authenticated for deleting all project tasks");
  const projectTasksQuery = query(tasksCollection, where("projectId", "==", projectId));
  const batch = writeBatch(db);
  try {
    const tasksSnapshot = await getDocs(projectTasksQuery);
    if (tasksSnapshot.empty) return; 

    const taskIdsToDeleteIssuesFor: string[] = [];
    tasksSnapshot.forEach(taskDoc => {
        taskIdsToDeleteIssuesFor.push(taskDoc.id);
        batch.delete(taskDoc.ref); 
    });

    for (const taskId of taskIdsToDeleteIssuesFor) {
        await deleteIssuesForTask(taskId, projectOwnerUid); 
    }
    await batch.commit(); 
  } catch (error: any) {
    console.error(`taskService: Error in deleteAllTasksForProject`, error);
    throw error;
  }
};

export const getAllTasksAssignedToUser = async (userUid: string): Promise<Task[]> => {
  if (!userUid) return [];
  const q = query(tasksCollection, where('assignedToUids', 'array-contains', userUid));
  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(mapDocumentToTask).filter(task => task.parentId);
    tasks.sort((a, b) => (a.parentId || '').localeCompare(b.parentId || '') || (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching all sub-tasks assigned to user:', error);
    throw error;
  }
};

export const countProjectSubTasks = async (projectId: string, userUid: string): Promise<number> => {
  if (!projectId || !userUid) return 0;
  const q = query(tasksCollection, where('projectId', '==', projectId), where('parentId', '!=', null));
  try {
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (error: any) {
    console.error(`taskService: Error counting sub-tasks for project ${projectId}:`, error);
    return 0; 
  }
};


export const countProjectMainTasks = async (projectId: string, userUid: string): Promise<number> => {
  if (!projectId || !userUid) return 0;
  const q = query(tasksCollection, where('projectId', '==', projectId), where('parentId', '==', null));
  try {
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (error: any) {
    console.error(`taskService: Error counting main tasks for project ${projectId}:`, error);
    return 0; 
  }
};

export const getTimelineForMainTask = async (mainTaskId: string, userUid: string, userRole?: UserRole): Promise<AggregatedEvent[]> => {
  try {
    const mainTaskEvents = await getTimelineForTask(mainTaskId);
    const aggregatedMainTaskEvents: AggregatedEvent[] = mainTaskEvents.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      type: 'mainTaskEvent',
      data: event,
    }));

    if (userRole === 'client') {
      aggregatedMainTaskEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      return aggregatedMainTaskEvents;
    }

    const subTasks = await getSubTasks(mainTaskId);
    const subTaskTimelinePromises = subTasks.map(async (subTask) => {
      const events = await getTimelineForTask(subTask.id);
      if (events.length > 0) {
        return {
          id: subTask.id,
          timestamp: events[0].timestamp,
          type: 'subTaskEventGroup' as const,
          data: { subTaskInfo: { id: subTask.id, name: subTask.name }, events: events },
        };
      }
      return null;
    });
    const subTaskEventGroupsWithNulls = await Promise.all(subTaskTimelinePromises);
    const aggregatedSubTaskEvents = subTaskEventGroupsWithNulls.filter((group): group is AggregatedEvent => group !== null);
    const combinedEvents = [...aggregatedMainTaskEvents, ...aggregatedSubTaskEvents];
    combinedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return combinedEvents;
  } catch (error) {
    console.error(`TimelineService: Failed to aggregate timeline for main task ${mainTaskId}`, error);
    return [];
  }
};

export const getTimelineForProject = async (projectId: string, userUid: string, userRole?: UserRole): Promise<ProjectAggregatedEvent[]> => {
  try {
    const mainTasks = await getProjectMainTasks(projectId, userUid, undefined, userRole);
    const projectTimelinePromises = mainTasks.map(async (mainTask) => {
      const events = await getTimelineForMainTask(mainTask.id, userUid, userRole);
      if (events.length > 0) {
        return {
          id: mainTask.id,
          timestamp: events[0].timestamp,
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
  } catch (error: any) {
    console.error(`TimelineService: Failed to aggregate timeline for project ${projectId}`, error);
    throw error; // Re-throw to be caught by the UI component
  }
};

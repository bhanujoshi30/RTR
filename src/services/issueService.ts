
import { db } from '@/lib/firebase';
import type { Issue, IssueSeverity, IssueProgressStatus, Task, UserRole } from '@/types';
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
  arrayUnion,
  runTransaction,
  getCountFromServer,
} from 'firebase/firestore';
import { getTaskById, updateTaskStatus as updateParentTaskStatus } from './taskService'; 
import { logTimelineEvent } from './timelineService';

const issuesCollection = collection(db, 'issues');

interface CreateIssueData {
  title: string;
  description?: string;
  severity: IssueSeverity;
  status: IssueProgressStatus;
  assignedToUids?: string[] | null;
  assignedToNames?: string[] | null;
  dueDate: Date; 
}

const mapDocumentToIssue = (docSnapshot: any): Issue => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    projectId: data.projectId,
    projectOwnerUid: data.projectOwnerUid,
    taskId: data.taskId, 
    ownerUid: data.ownerUid,
    title: data.title,
    description: data.description,
    severity: data.severity,
    status: data.status,
    assignedToUids: data.assignedToUids || [],
    assignedToNames: data.assignedToNames || [],
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : undefined),
    dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : new Date()), 
  };
};

async function ensureAssigneesInParentTask(parentTaskId: string, issueAssigneeUids: string[], issueAssigneeNames: string[], performingUserUid: string, performingUserRole?: UserRole) {
  if (!issueAssigneeUids || issueAssigneeUids.length === 0) return;

  const parentTaskRef = doc(db, 'tasks', parentTaskId);
  
  try {
    await runTransaction(db, async (transaction) => {
      const parentTaskSnap = await transaction.get(parentTaskRef);
      if (!parentTaskSnap.exists()) {
        throw new Error(`Parent sub-task ${parentTaskId} not found during issue assignment mandate.`);
      }
      const parentTaskData = parentTaskSnap.data() as Task;
      const currentParentAssigneeUids = parentTaskData.assignedToUids || [];
      const currentParentAssigneeNames = parentTaskData.assignedToNames || [];

      let needsUpdate = false;
      const newParentAssigneeUids = [...currentParentAssigneeUids];
      const newParentAssigneeNames = [...currentParentAssigneeNames];

      issueAssigneeUids.forEach((issueUid, index) => {
        if (!newParentAssigneeUids.includes(issueUid)) {
          newParentAssigneeUids.push(issueUid);
          const issueName = issueAssigneeNames[index] || issueUid; 
          if (!newParentAssigneeNames.some(name => currentParentAssigneeUids[currentParentAssigneeNames.indexOf(name)] === issueUid)) { 
             newParentAssigneeNames.push(issueName);
          }
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        transaction.update(parentTaskRef, {
          assignedToUids: newParentAssigneeUids,
          assignedToNames: newParentAssigneeNames,
          updatedAt: serverTimestamp()
        });
        console.log(`Mandate: Updated parent sub-task ${parentTaskId} with new assignees:`, newParentAssigneeUids);
      }
    });
  } catch (error) {
    console.error(`Mandate Error: Failed to update parent sub-task ${parentTaskId} assignees:`, error);
  }
}


export const createIssue = async (projectId: string, taskId: string, userUid: string, issueData: CreateIssueData): Promise<string> => {
  if (!userUid) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId); 
  const taskSnap = await getDoc(taskDocRef);
  const taskData = taskSnap.data() as Task | undefined; // State of task *before* issue creation

  if (!taskSnap.exists() || taskData?.projectId !== projectId) {
    throw new Error('Parent sub-task not found or does not belong to the project.');
  }
  
  const isOwnerOfSubTask = taskData?.ownerUid === userUid;
  const isAssignedToSubTask = taskData?.assignedToUids?.includes(userUid);

  if (!isOwnerOfSubTask && !isAssignedToSubTask) {
     throw new Error('Access denied. You must own or be assigned to the parent sub-task to create an issue.');
  }

  // Ensure the parent task has the projectOwnerUid before we use it
  if (!taskData.projectOwnerUid) {
      console.warn(`taskService: Parent task ${taskId} is missing projectOwnerUid. Fetching from project as a fallback.`);
      const projectDoc = await getDoc(doc(db, 'projects', projectId));
      if (!projectDoc.exists()) throw new Error('Project not found when creating issue.');
      taskData.projectOwnerUid = projectDoc.data().ownerUid;
  }

  const newIssuePayload = {
    ...issueData,
    projectId,
    projectOwnerUid: taskData.projectOwnerUid,
    taskId, 
    ownerUid: userUid, 
    assignedToUids: issueData.assignedToUids || [],
    assignedToNames: issueData.assignedToNames || [],
    dueDate: Timestamp.fromDate(issueData.dueDate), 
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  try {
    const newIssueRef = await addDoc(issuesCollection, newIssuePayload);
    
    // Log timeline event for issue creation
    await logTimelineEvent(
        taskId,
        userUid,
        'ISSUE_CREATED',
        `created issue: "${issueData.title}".`,
        { issueId: newIssueRef.id, title: issueData.title }
    );

    if (newIssuePayload.assignedToUids && newIssuePayload.assignedToUids.length > 0) {
      const userDoc = await getDoc(doc(db, 'users', userUid));
      const performingUserRole = userDoc.exists() ? userDoc.data()?.role as UserRole : undefined;
      await ensureAssigneesInParentTask(taskId, newIssuePayload.assignedToUids, newIssuePayload.assignedToNames, userUid, performingUserRole);
    }

    // If the parent sub-task was 'Completed', change its status to 'In Progress'
    if (taskData && taskData.status === 'Completed') {
      const userDoc = await getDoc(doc(db, 'users', userUid));
      const userRoleForUpdate = userDoc.exists() ? userDoc.data()?.role as UserRole : undefined;
      
      console.log(`issueService: New issue ${newIssueRef.id} created for sub-task ${taskId} which was 'Completed'. Attempting to change sub-task status to 'In Progress'.`);
      await updateParentTaskStatus(taskId, userUid, 'In Progress', userRoleForUpdate);
      console.log(`issueService: Parent sub-task ${taskId} status automatically changed to 'In Progress' due to new issue ${newIssueRef.id}.`);
    }

    return newIssueRef.id;
  } catch (error: any) {
    console.error('issueService: Error creating issue:', error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const getTaskIssues = async (taskId: string, userUid: string, isSupervisorViewingAssignedTask: boolean = false): Promise<Issue[]> => {
  if (!userUid) {
    console.warn('issueService: getTaskIssues called without authenticated user UID.');
    return [];
  }

  const q = query(
    issuesCollection,
    where('taskId', '==', taskId),
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const issues = querySnapshot.docs.map(mapDocumentToIssue);
    return issues;
  } catch (error: any) {
    console.error('issueService: Error fetching task issues for taskId (sub-task ID):', taskId, 'uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for issues requires a composite index. Please create it in the Firebase console. Fields: 'taskId' (ASC), 'createdAt' (DESC).");
    }
    throw error;
  }
};

export const getAllIssuesAssignedToUser = async (userUid: string): Promise<Issue[]> => {
  if (!userUid) return [];
  console.log(`issueService: getAllIssuesAssignedToUser for userUid: ${userUid}`);

  const q = query(
    issuesCollection,
    where('assignedToUids', 'array-contains', userUid),
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const issues = querySnapshot.docs.map(mapDocumentToIssue);
    if (issues.length === 0) {
      console.log(`issueService: getAllIssuesAssignedToUser - Query executed successfully but found 0 issues assigned to user ${userUid}. Index needed: assignedToUids (array-contains), createdAt (DESC)`);
    } else {
      console.log(`issueService: Fetched ${issues.length} issues assigned to user ${userUid}`);
    }
    return issues;
  } catch (error: any) {
    console.error('issueService: Error fetching all issues assigned to user:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAllIssuesAssignedToUser requires an index. Fields: assignedToUids (array-contains), createdAt (DESC). Check Firebase console.");
    }
    throw error;
  }
};


export const getIssueById = async (issueId: string, userUid: string): Promise<Issue | null> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);

  if (issueSnap.exists()) {
    const issueData = mapDocumentToIssue(issueSnap);
    // Admin can view any issue if needed, or expand this logic
    // For now, only owner or assigned users
    if (issueData.ownerUid === userUid || issueData.assignedToUids?.includes(userUid)) {
        return issueData;
    }
    // Add more sophisticated role-based access if needed, e.g. project owner or supervisor
  }
  return null;
};

interface UpdateIssueData {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueProgressStatus;
  assignedToUids?: string[] | null;
  assignedToNames?: string[] | null;
  dueDate?: Date; 
}

export const updateIssue = async (issueId: string, userUid: string, parentSubTaskId: string, updates: UpdateIssueData): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists()){
      throw new Error('Issue not found.');
  }

  const issueData = mapDocumentToIssue(issueSnap); 
  if (issueData.ownerUid !== userUid) {
    // Allow assigned users to update certain fields if needed, for now only owner can edit.
    // if (!issueData.assignedToUids?.includes(userUid)) {
    //   throw new Error('Access denied. You do not own this issue nor are you assigned to it.');
    // }
    // // If assigned, what can they update? status typically.
    throw new Error('Access denied. Only the issue creator can edit it.');
  }

  const updatePayload: Partial<Omit<Issue, 'id' | 'projectId' | 'taskId' | 'ownerUid' | 'createdAt'>> & { updatedAt: Timestamp } = {
    updatedAt: serverTimestamp() as Timestamp,
  };

  if (updates.title !== undefined) updatePayload.title = updates.title;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.severity !== undefined) updatePayload.severity = updates.severity;
  if (updates.status !== undefined) updatePayload.status = updates.status;

  if (updates.assignedToUids !== undefined) {
    updatePayload.assignedToUids = updates.assignedToUids || [];
    updatePayload.assignedToNames = updates.assignedToNames || []; // Ensure names are also updated/cleared
  }

  if (updates.dueDate !== undefined) {
    updatePayload.dueDate = Timestamp.fromDate(updates.dueDate); 
  }

  try {
    await updateDoc(issueDocRef, updatePayload as any); // Using 'as any' to bypass strict type checking for partial update

    // If assignedToUids were part of the update, ensure they are also on the parent sub-task
    const finalAssignedUids = updatePayload.assignedToUids || issueData.assignedToUids || [];
    const finalAssignedNames = updatePayload.assignedToNames || issueData.assignedToNames || [];

    if (finalAssignedUids.length > 0 && updates.assignedToUids !== undefined) { // Only run if assignedToUids was explicitly part of the update
      const userDoc = await getDoc(doc(db, 'users', userUid));
      const performingUserRole = userDoc.exists() ? userDoc.data()?.role as UserRole : undefined;
      await ensureAssigneesInParentTask(parentSubTaskId, finalAssignedUids, finalAssignedNames, userUid, performingUserRole);
    }

    // If the issue status changed, check if parent task status needs update
    if (updates.status && updates.status !== issueData.status) {
        await logTimelineEvent(
            issueData.taskId,
            userUid,
            'ISSUE_STATUS_CHANGED',
            `changed status of issue "${issueData.title}" to '${updates.status}'.`,
            { issueId, oldStatus: issueData.status, newStatus: updates.status, title: issueData.title }
        );

        if (updates.status === 'Open' && issueData.status === 'Closed') {
            const parentTask = await getTaskById(issueData.taskId, userUid, undefined); // Assuming user role is not critical here, or fetch it
            if (parentTask && parentTask.status === 'Completed') {
                const userDoc = await getDoc(doc(db, 'users', userUid));
                const userRoleForUpdate = userDoc.exists() ? userDoc.data()?.role as UserRole : undefined;
                await updateParentTaskStatus(parentTask.id, userUid, 'In Progress', userRoleForUpdate);
            }
        }
    }

  } catch (error: any) {
    console.error('issueService: Error updating issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const updateIssueStatus = async (
  issueId: string, 
  userUid: string, 
  newStatus: IssueProgressStatus, 
  userRole?: UserRole
): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists()){
      throw new Error('Issue not found.');
  }
  const issueData = mapDocumentToIssue(issueSnap);
  const oldStatus = issueData.status;

  // Permission check: Owner or assigned user can change status.
  if (issueData.ownerUid !== userUid && !(issueData.assignedToUids?.includes(userUid))) {
    throw new Error('Access denied. You did not create this issue nor are you assigned to it.');
  }

  try {
    if (oldStatus !== newStatus) {
        await updateDoc(issueDocRef, { status: newStatus, updatedAt: serverTimestamp() as Timestamp });
        await logTimelineEvent(
            issueData.taskId,
            userUid,
            'ISSUE_STATUS_CHANGED',
            `changed status of issue "${issueData.title}" to '${newStatus}'.`,
            { issueId, oldStatus, newStatus, title: issueData.title }
        );
    }
    

    // If issue is reopened, and parent task was completed, set parent task to In Progress
    if (newStatus === 'Open' && oldStatus === 'Closed') {
      if (issueData.taskId) { 
        const parentTask = await getTaskById(issueData.taskId, userUid, userRole);
        if (parentTask && parentTask.status === 'Completed') {
          await updateParentTaskStatus(parentTask.id, userUid, 'In Progress', userRole);
          console.log(`IssueService: Parent task ${parentTask.id} status updated to 'In Progress' due to issue ${issueId} reopening.`);
        }
      } else {
        console.warn(`IssueService: Issue ${issueId} does not have a taskId. Cannot update parent task status.`);
      }
    }
  } catch (error: any) {
     console.error('issueService: Error updating issue status for ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const deleteIssue = async (issueId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists()){
      throw new Error('Issue not found.');
  }
  const issueData = mapDocumentToIssue(issueSnap);
  // Permission: Only owner can delete.
  if (issueData.ownerUid !== userUid) {
    throw new Error('Access denied. Only the issue creator can delete it.');
  }

  try {
    await logTimelineEvent(
        issueData.taskId,
        userUid,
        'ISSUE_DELETED',
        `deleted issue: "${issueData.title}".`,
        { issueId: issueData.id, title: issueData.title }
    );
    await deleteDoc(issueDocRef);
  } catch (error: any) {
    console.error('issueService: Error deleting issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

// This function is called when a task (main or sub-task) is deleted.
// It needs to delete all issues associated with that task.
export const deleteIssuesForTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting issues for task');

  // No ownership check here as this is an internal function called during task deletion
  // by an authorized user (task owner).
  const q = query(issuesCollection, where('taskId', '==', taskId));
  const batch = writeBatch(db);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    console.log(`issueService: Deleted issues for task ID (sub-task ID): ${taskId}`);
  } catch (error: any) {
    // It's possible the index for this query doesn't exist if issues are rarely queried this way directly.
    // However, it's crucial for cleanup.
    console.error('issueService: Error deleting issues for task ID (sub-task ID):', taskId, error.message, error.code ? `(${error.code})` : '', error.stack);
    // If index 'issues.taskId' is missing, this will fail.
  }
};

export const countOpenIssuesForTask = async (taskId: string): Promise<number> => {
  if (!taskId) return 0;
  const q = query(
    issuesCollection,
    where('taskId', '==', taskId),
    where('status', '==', 'Open')
  );

  try {
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (error: any) {
    console.error(`issueService: Error counting open issues for task ${taskId}:`, error);
    // Returning 0 on error is safer than breaking the UI.
    // The index requirement is the same as hasOpenIssues.
    if (error.message?.includes("index")) {
        console.error("Firestore query for counting open issues requires a composite index. Collection: 'issues', Fields: 'taskId' (ASC), 'status' (ASC).");
    }
    return 0;
  }
};


// Checks if a specific sub-task has any open issues.
export const hasOpenIssues = async (taskId: string): Promise<boolean> => {
  try {
    const count = await countOpenIssuesForTask(taskId);
    if (count > 0) {
      console.log(`issueService: Found ${count} open issues for task ${taskId}.`);
    } else {
      console.log(`issueService: No open issues found for task ${taskId}.`);
    }
    return count > 0;
  } catch (error: any) {
    console.error(`issueService: Error checking for open issues for task ID: ${taskId} via count`, error);
    // Re-throw to make it visible that an index might be needed or another error occurred.
    throw new Error(`Failed to check for open issues for task ${taskId}. ${error.message}`);
  }
};

// Counts open issues for a whole project.
export const countProjectOpenIssues = async (projectId: string): Promise<number> => {
  if (!projectId) return 0;
  console.log(`issueService: countProjectOpenIssues for projectId: ${projectId}`);

  const q = query(
    issuesCollection,
    where('projectId', '==', projectId),
    where('status', '==', 'Open')
  );

  try {
    const snapshot = await getCountFromServer(q);
    const count = snapshot.data().count;
    console.log(`issueService: Found ${count} open issues for project ${projectId}.`);
    return count;
  } catch (error: any) {
    console.error(`issueService: Error counting open issues for project ${projectId}:`, error.message, error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error(`Firestore query for counting open issues (projectId: ${projectId}) requires a composite index. Please create it in the Firebase console. Expected fields: 'projectId' (ASC), 'status' (ASC). The error message from Firebase often provides a direct link to create it.`);
    }
    return 0; // Return 0 on error to prevent breaking dashboard, but log the error.
  }
};

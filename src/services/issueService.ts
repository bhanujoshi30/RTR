
'use server';

import { db } from '@/lib/firebase';
import type { Issue, IssueSeverity, IssueProgressStatus, Task } from '@/types';
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
  runTransaction
} from 'firebase/firestore';
import { getTaskById, updateTask as updateParentTask } from './taskService'; // Renamed to avoid conflict

const issuesCollection = collection(db, 'issues');

interface CreateIssueData {
  title: string;
  description?: string;
  severity: IssueSeverity;
  status: IssueProgressStatus;
  assignedToUids?: string[] | null;
  assignedToNames?: string[] | null;
  endDate?: Date | null;
}

const mapDocumentToIssue = (docSnapshot: any): Issue => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    projectId: data.projectId,
    taskId: data.taskId, // Parent SubTask ID
    ownerUid: data.ownerUid,
    title: data.title,
    description: data.description,
    severity: data.severity,
    status: data.status,
    assignedToUids: data.assignedToUids || [],
    assignedToNames: data.assignedToNames || [],
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : undefined),
    endDate: data.endDate instanceof Timestamp ? data.endDate.toDate() : (data.endDate ? new Date(data.endDate) : null),
  };
};

// Helper for the mandate logic
async function ensureAssigneesInParentTask(parentTaskId: string, issueAssigneeUids: string[], issueAssigneeNames: string[], performingUserUid: string, performingUserRole?: string) {
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
          // Ensure corresponding name is also added
          const issueName = issueAssigneeNames[index] || issueUid; // Fallback to UID if name somehow missing
          if (!newParentAssigneeNames.includes(issueName)) { // Basic check, could be more robust with UID-name map
             newParentAssigneeNames.push(issueName);
          }
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        // The performingUserUid is the one initiating the issue creation/update
        // The updateParentTask service function will handle its own permission checks.
        // We are passing the original user's UID and role.
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
    // Decide if this error should propagate and fail the issue creation/update
    // For now, log it and let the issue operation proceed if it was otherwise successful.
    // A more robust solution might involve a dedicated "assign user to task and its items" flow.
    // throw error; // Or handle more gracefully
  }
}


export const createIssue = async (projectId: string, taskId: string, userUid: string, issueData: CreateIssueData): Promise<string> => {
  if (!userUid) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId); // taskId is the parent SubTask ID
  const taskSnap = await getDoc(taskDocRef);
  const taskData = taskSnap.data() as Task | undefined;

  if (!taskSnap.exists() || taskData?.projectId !== projectId) {
    throw new Error('Parent sub-task not found or does not belong to the project.');
  }
  
  // User must be owner of the sub-task OR assigned to the sub-task to create an issue under it.
  const isOwnerOfSubTask = taskData?.ownerUid === userUid;
  const isAssignedToSubTask = taskData?.assignedToUids?.includes(userUid);

  if (!isOwnerOfSubTask && !isAssignedToSubTask) {
     throw new Error('Access denied. You must own or be assigned to the parent sub-task to create an issue.');
  }

  const newIssuePayload = {
    ...issueData,
    projectId,
    taskId, // Parent SubTask ID
    ownerUid: userUid, // Creator of the issue
    assignedToUids: issueData.assignedToUids || [],
    assignedToNames: issueData.assignedToNames || [],
    endDate: issueData.endDate ? Timestamp.fromDate(issueData.endDate) : null,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  try {
    const newIssueRef = await addDoc(issuesCollection, newIssuePayload);
    
    // Mandate Logic: Ensure issue assignees are also assigned to the parent sub-task
    if (newIssuePayload.assignedToUids && newIssuePayload.assignedToUids.length > 0) {
      const userDoc = await getDoc(doc(db, 'users', userUid));
      const performingUserRole = userDoc.exists() ? userDoc.data()?.role as UserRole : undefined;
      await ensureAssigneesInParentTask(taskId, newIssuePayload.assignedToUids, newIssuePayload.assignedToNames, userUid, performingUserRole);
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

  // taskId here refers to the parent SubTask ID
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
    // Anyone who created OR is assigned can view. Further restrictions can be added if needed.
    if (issueData.ownerUid === userUid || issueData.assignedToUids?.includes(userUid)) {
        return issueData;
    }
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
  endDate?: Date | null | undefined;
}

export const updateIssue = async (issueId: string, userUid: string, parentSubTaskId: string, updates: UpdateIssueData): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists()){
      throw new Error('Issue not found.');
  }

  const issueData = mapDocumentToIssue(issueSnap); // Use mapped data
  // Only owner of the issue can edit all fields.
  if (issueData.ownerUid !== userUid) {
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
    updatePayload.assignedToNames = updates.assignedToNames || [];
  }

  if (updates.endDate !== undefined) {
    updatePayload.endDate = updates.endDate ? Timestamp.fromDate(updates.endDate) : null;
  }

  try {
    await updateDoc(issueDocRef, updatePayload as any);

    // Mandate Logic: Ensure new/updated issue assignees are also assigned to the parent sub-task
    const finalAssignedUids = updatePayload.assignedToUids || issueData.assignedToUids || [];
    const finalAssignedNames = updatePayload.assignedToNames || issueData.assignedToNames || [];

    if (finalAssignedUids.length > 0) {
      const userDoc = await getDoc(doc(db, 'users', userUid));
      const performingUserRole = userDoc.exists() ? userDoc.data()?.role as UserRole : undefined;
      await ensureAssigneesInParentTask(parentSubTaskId, finalAssignedUids, finalAssignedNames, userUid, performingUserRole);
    }

  } catch (error: any) {
    console.error('issueService: Error updating issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const updateIssueStatus = async (issueId: string, userUid: string, status: IssueProgressStatus): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
   if (!issueSnap.exists()){
      throw new Error('Issue not found.');
  }
  const issueData = mapDocumentToIssue(issueSnap); // Use mapped data
  // User who created issue OR is assigned to issue can update status.
  if (issueData.ownerUid !== userUid && !issueData.assignedToUids?.includes(userUid)) {
    throw new Error('Access denied. You did not create this issue nor are you assigned to it.');
  }

  try {
    await updateDoc(issueDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
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
  if ((mapDocumentToIssue(issueSnap)).ownerUid !== userUid) {
    throw new Error('Access denied. Only the issue creator can delete it.');
  }

  try {
    await deleteDoc(issueDocRef);
  } catch (error: any) {
    console.error('issueService: Error deleting issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const deleteIssuesForTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting issues for task');

  // taskId is the parent SubTask ID
  const q = query(issuesCollection, where('taskId', '==', taskId));
  const batch = writeBatch(db);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(docSnap => {
      // Add check: only delete if userUid is owner of the issue or parent task? For now, assume if parent task is deleted, its issues go.
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    console.log(`issueService: Deleted issues for task ID (sub-task ID): ${taskId}`);
  } catch (error: any) {
    console.error('issueService: Error deleting issues for task ID (sub-task ID):', taskId, error.message, error.code ? `(${error.code})` : '', error.stack);
  }
};

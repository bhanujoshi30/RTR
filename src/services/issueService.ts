
'use server';

import { db } from '@/lib/firebase';
import type { Issue, IssueSeverity, IssueProgressStatus } from '@/types';
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

const issuesCollection = collection(db, 'issues');

interface CreateIssueData {
  title: string;
  description?: string;
  severity: IssueSeverity;
  status: IssueProgressStatus;
  assignedToUid?: string; 
  assignedToName?: string; 
  endDate?: Date | null;
}

const mapDocumentToIssue = (docSnapshot: any): Issue => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    ...data,
    createdAt: (data.createdAt as Timestamp)?.toDate ? (data.createdAt as Timestamp).toDate() : new Date(data.createdAt),
    updatedAt: data.updatedAt ? ((data.updatedAt as Timestamp)?.toDate ? (data.updatedAt as Timestamp).toDate() : new Date(data.updatedAt)) : undefined,
    endDate: data.endDate ? ((data.endDate as Timestamp)?.toDate ? (data.endDate as Timestamp).toDate() : new Date(data.endDate)) : null,
  } as Issue;
};


export const createIssue = async (projectId: string, taskId: string, userUid: string, issueData: CreateIssueData): Promise<string> => {
  if (!userUid) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  const taskData = taskSnap.data();

  if (!taskSnap.exists() || taskData?.projectId !== projectId) {
    throw new Error('Task not found or does not belong to the project.');
  }
  
  // Check if user is owner of the task OR supervisor assigned to the task
  const isOwner = taskData?.ownerUid === userUid;
  const isAssignedSupervisor = taskData?.assignedToUid === userUid; // Assuming supervisors can create issues for tasks assigned to them.

  if (!isOwner && !isAssignedSupervisor) {
     throw new Error('Access denied for creating an issue against this task.');
  }


  const newIssuePayload = {
    ...issueData,
    projectId,
    taskId,
    ownerUid: userUid, // The creator of the issue is the owner of the issue document
    assignedToUid: issueData.assignedToUid || null, // The person assigned to resolve the issue
    assignedToName: issueData.assignedToName || null,
    endDate: issueData.endDate ? Timestamp.fromDate(issueData.endDate) : null,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  try {
    const newIssueRef = await addDoc(issuesCollection, newIssuePayload);
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
  
  let q;
  // If a supervisor is viewing an assigned task, they see all issues for that task.
  // Ownership of the issue itself (ownerUid on issue doc) might be different from task owner/assignee.
  // The primary filter is taskId. Further filtering based on who can *see* issues can be complex.
  // For now, if a user (owner or assigned supervisor) can see a task, they can see its issues.
  // The `ownerUid` on the issue document refers to who *created* the issue.
  
  // Anyone who has access to the task (owner or assigned supervisor) can see its issues.
  // The `ownerUid` on the issue itself is for who created/owns that specific issue record.
   q = query(
    issuesCollection,
    where('taskId', '==', taskId),
    // No direct ownerUid check here on issue, access to task implies access to its issues.
    // If stricter access to issues is needed (e.g. only issue creator sees it), add where('ownerUid', '==', userUid)
    orderBy('createdAt', 'desc')
  );


  try {
    const querySnapshot = await getDocs(q);
    const issues = querySnapshot.docs.map(mapDocumentToIssue);
    return issues;
  } catch (error: any) {
    console.error('issueService: Error fetching task issues for taskId:', taskId, 'uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for issues requires a composite index. Please create it in the Firebase console. Fields: 'taskId' (ASC), 'createdAt' (DESC).");
    }
    throw error;
  }
};

export const getIssueById = async (issueId: string, userUid: string): Promise<Issue | null> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);

  if (issueSnap.exists()) {
    // For now, allow if user is owner of the issue OR assigned to the issue.
    // More complex: check if user is owner/assignee of the parent task.
    const issueData = issueSnap.data();
    if (issueData.ownerUid === userUid || issueData.assignedToUid === userUid) {
        return mapDocumentToIssue(issueSnap);
    }
  }
  return null;
};

interface UpdateIssueData {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueProgressStatus;
  assignedToUid?: string | null; 
  assignedToName?: string | null; 
  endDate?: Date | null | undefined;
}

export const updateIssue = async (issueId: string, userUid: string, updates: UpdateIssueData): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists()){
      throw new Error('Issue not found.');
  }
  
  const issueData = issueSnap.data();
  // Allow update if user created the issue OR is assigned to resolve the issue.
  if (issueData.ownerUid !== userUid && issueData.assignedToUid !== userUid) {
    throw new Error('Access denied. You did not create this issue nor are you assigned to it.');
  }

  const updatePayload: Partial<Omit<Issue, 'id' | 'projectId' | 'taskId' | 'ownerUid' | 'createdAt'>> & { updatedAt: Timestamp } = {
    updatedAt: serverTimestamp() as Timestamp,
  };

  if (updates.title !== undefined) updatePayload.title = updates.title;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.severity !== undefined) updatePayload.severity = updates.severity;
  if (updates.status !== undefined) updatePayload.status = updates.status;
  
  if (updates.assignedToUid !== undefined) { 
    updatePayload.assignedToUid = updates.assignedToUid || null;
    updatePayload.assignedToName = updates.assignedToName || null;
  }

  if (updates.endDate !== undefined) {
    updatePayload.endDate = updates.endDate ? Timestamp.fromDate(updates.endDate) : null;
  }

  try {
    await updateDoc(issueDocRef, updatePayload as any);
  } catch (error: any) {
    console.error('issueService: Error updating issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const updateIssueStatus = async (issueId: string, userUid: string, status: IssueProgressStatus, assignedToUid?: string | null, assignedToName?: string | null): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
   if (!issueSnap.exists()){
      throw new Error('Issue not found.');
  }
  const issueData = issueSnap.data();
  if (issueData.ownerUid !== userUid && issueData.assignedToUid !== userUid) {
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
  // Only the creator of the issue can delete it.
  if (issueSnap.data().ownerUid !== userUid) {
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

  // This function is typically called when a task owner deletes a task.
  // So, we delete all issues for that task, regardless of who created those issues.
  // The permission check is on the parent task deletion.
  const q = query(issuesCollection, where('taskId', '==', taskId));
  const batch = writeBatch(db);

  try {
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`issueService: Deleted issues for task ID: ${taskId}`);
  } catch (error: any) {
    console.error('issueService: Error deleting issues for task ID:', taskId, error.message, error.code ? `(${error.code})` : '', error.stack);
  }
};

    
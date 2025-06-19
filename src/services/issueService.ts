
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
  assignedToUid?: string; // Added
  assignedToName?: string; // Added
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
  if (!taskSnap.exists() || taskSnap.data()?.projectId !== projectId || taskSnap.data()?.ownerUid !== userUid) {
    throw new Error('Task not found or access denied for creating an issue against it.');
  }
  // Ensure task is a sub-task (has a parentId) if that's a strict rule, or allow issues on main tasks too
  // For now, allowing issues on any task type that passes ownership check.

  const newIssuePayload = {
    ...issueData,
    projectId,
    taskId,
    ownerUid: userUid,
    assignedToUid: issueData.assignedToUid || null,
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

export const getTaskIssues = async (taskId: string, userUid: string): Promise<Issue[]> => {
  if (!userUid) {
    console.warn('issueService: getTaskIssues called without authenticated user UID.');
    return [];
  }

  const q = query(
    issuesCollection,
    where('taskId', '==', taskId),
    where('ownerUid', '==', userUid), // Ensure user owns the issues they are fetching
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const issues = querySnapshot.docs.map(mapDocumentToIssue);
    return issues;
  } catch (error: any) {
    console.error('issueService: Error fetching task issues for taskId:', taskId, 'uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for issues requires a composite index. Please create it in the Firebase console. Fields: 'taskId' (ASC), 'ownerUid' (ASC), 'createdAt' (DESC).");
    }
    throw error;
  }
};

export const getIssueById = async (issueId: string, userUid: string): Promise<Issue | null> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);

  if (issueSnap.exists() && issueSnap.data().ownerUid === userUid) {
    return mapDocumentToIssue(issueSnap);
  }
  return null;
};

interface UpdateIssueData {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueProgressStatus;
  assignedToUid?: string | null; // Added
  assignedToName?: string | null; // Added
  endDate?: Date | null | undefined;
}

export const updateIssue = async (issueId: string, userUid: string, updates: UpdateIssueData): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists() || issueSnap.data().ownerUid !== userUid) {
    throw new Error('Issue not found or access denied.');
  }

  const updatePayload: Partial<Omit<Issue, 'id' | 'projectId' | 'taskId' | 'ownerUid' | 'createdAt'>> & { updatedAt: Timestamp } = {
    updatedAt: serverTimestamp() as Timestamp,
  };

  if (updates.title !== undefined) updatePayload.title = updates.title;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.severity !== undefined) updatePayload.severity = updates.severity;
  if (updates.status !== undefined) updatePayload.status = updates.status;
  
  if (updates.assignedToUid !== undefined) { // Check for undefined to allow setting to null
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

export const updateIssueStatus = async (issueId: string, userUid: string, status: IssueProgressStatus): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists() || issueSnap.data().ownerUid !== userUid) {
    throw new Error('Issue not found or access denied.');
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
  if (!issueSnap.exists() || issueSnap.data().ownerUid !== userUid) {
    throw new Error('Issue not found or access denied.');
  }

  try {
    await deleteDoc(issueDocRef);
  } catch (error: any) {
    console.error('issueService: Error deleting issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

// This function is used when deleting a task, to clean up its associated issues.
export const deleteIssuesForTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting issues for task');

  // Query issues associated with the task AND owned by the user to ensure permissions.
  const q = query(issuesCollection, where('taskId', '==', taskId), where('ownerUid', '==', userUid));
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
    // Don't re-throw here if this is part of a larger delete operation like deleting a task,
    // unless you want the parent operation to fail. For now, log and continue.
    // throw error; // Optional: re-throw if the calling function should handle it
  }
};

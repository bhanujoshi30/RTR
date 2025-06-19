
'use server';

import { db, auth } from '@/lib/firebase';
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
} from 'firebase/firestore';

const issuesCollection = collection(db, 'issues');

interface CreateIssueData {
  title: string;
  description?: string;
  severity: IssueSeverity;
  status: IssueProgressStatus;
  assignedToName?: string;
  endDate?: Date | null;
}

export const createIssue = async (projectId: string, issueData: CreateIssueData): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  // Verify project ownership
  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== user.uid) {
    throw new Error('Project not found or access denied.');
  }

  const newIssuePayload = {
    ...issueData,
    projectId,
    ownerUid: user.uid,
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

export const getProjectIssues = async (projectId: string): Promise<Issue[]> => {
  const user = auth.currentUser;
  if (!user) {
    console.warn('issueService: getProjectIssues called without authenticated user.');
    return [];
  }
  
  // Consider adding an index for this query in Firestore: projectId (ASC), ownerUid (ASC), createdAt (DESC)
  const q = query(
    issuesCollection,
    where('projectId', '==', projectId),
    where('ownerUid', '==', user.uid),
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const issues = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Issue));
    return issues;
  } catch (error: any) {
    console.error('issueService: Error fetching project issues for projectId:', projectId, 'uid:', user.uid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for issues requires a composite index. Please create it in the Firebase console. The error message should provide a direct link or details for manual creation. Fields to index are likely 'projectId' (ASC), 'ownerUid' (ASC), and 'createdAt' (DESC).");
    }
    throw error;
  }
};

export const getIssueById = async (issueId: string): Promise<Issue | null> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);

  if (issueSnap.exists() && issueSnap.data().ownerUid === user.uid) {
    return { id: issueSnap.id, ...issueSnap.data() } as Issue;
  }
  return null;
};

interface UpdateIssueData {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueProgressStatus;
  assignedToName?: string;
  endDate?: Date | null | undefined; // Allow undefined to not change, null to clear
}

export const updateIssue = async (issueId: string, updates: UpdateIssueData): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const issueDocRef = doc(db, 'issues', issueId);
  // Add ownership check if necessary before update
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists() || issueSnap.data().ownerUid !== user.uid) {
    throw new Error('Issue not found or access denied.');
  }

  const updatePayload: Partial<Issue> & { updatedAt: Timestamp } = {
    updatedAt: serverTimestamp() as Timestamp,
  };

  if (updates.title !== undefined) updatePayload.title = updates.title;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.severity !== undefined) updatePayload.severity = updates.severity;
  if (updates.status !== undefined) updatePayload.status = updates.status;
  if (updates.assignedToName !== undefined) updatePayload.assignedToName = updates.assignedToName;
  if (updates.endDate !== undefined) { // Check for undefined specifically to allow null
    updatePayload.endDate = updates.endDate ? Timestamp.fromDate(updates.endDate) : null;
  }
  
  try {
    await updateDoc(issueDocRef, updatePayload);
  } catch (error: any) {
    console.error('issueService: Error updating issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const updateIssueStatus = async (issueId: string, status: IssueProgressStatus): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const issueDocRef = doc(db, 'issues', issueId);
  // Add ownership check if necessary before update
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists() || issueSnap.data().ownerUid !== user.uid) {
    throw new Error('Issue not found or access denied.');
  }

  try {
    await updateDoc(issueDocRef, { status, updatedAt: serverTimestamp() as Timestamp });
  } catch (error: any) {
     console.error('issueService: Error updating issue status for ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const deleteIssue = async (issueId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const issueDocRef = doc(db, 'issues', issueId);
  // Add ownership check if necessary before delete
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists() || issueSnap.data().ownerUid !== user.uid) {
    throw new Error('Issue not found or access denied.');
  }

  try {
    await deleteDoc(issueDocRef);
  } catch (error: any) {
    console.error('issueService: Error deleting issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};


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
import { addAttachmentMetadata, type AttachmentMetadata } from './attachmentService';
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
    ownerName: data.ownerName || null,
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

export const createIssue = async (projectId: string, taskId: string, userUid: string, ownerName: string, issueData: CreateIssueData): Promise<string> => {
  if (!userUid) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId); 
  const taskSnap = await getDoc(taskDocRef);
  const taskData = taskSnap.data() as Task | undefined;

  if (!taskSnap.exists() || taskData?.projectId !== projectId) {
    throw new Error('Parent sub-task not found or does not belong to the project.');
  }
  
  const isOwnerOfSubTask = taskData?.ownerUid === userUid;
  const isAssignedToSubTask = taskData?.assignedToUids?.includes(userUid);

  if (!isOwnerOfSubTask && !isAssignedToSubTask) {
     throw new Error('Access denied. You must own or be assigned to the parent sub-task to create an issue.');
  }

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
    ownerName: ownerName,
    assignedToUids: issueData.assignedToUids || [],
    assignedToNames: issueData.assignedToNames || [],
    dueDate: Timestamp.fromDate(issueData.dueDate), 
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  try {
    const newIssueRef = await addDoc(issuesCollection, newIssuePayload);
    
    await logTimelineEvent(
        taskId,
        userUid,
        'ISSUE_CREATED',
        `created issue: "${issueData.title}".`,
        { issueId: newIssueRef.id, title: issueData.title }
    );
    
    // Note: The logic to re-open a 'Completed' parent task or to ensure assignees are on the parent task
    // is now handled in the component layer (IssueForm) to avoid circular dependencies.

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
    where('taskId', '==', taskId)
  );

  try {
    const querySnapshot = await getDocs(q);
    const issues = querySnapshot.docs.map(mapDocumentToIssue);
    
    issues.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

    return issues;
  } catch (error: any) {
    console.error('issueService: Error fetching task issues for taskId (sub-task ID):', taskId, 'uid:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

export const getOpenIssuesForTaskIds = async (taskIds: string[]): Promise<Issue[]> => {
  if (taskIds.length === 0) {
    return [];
  }
  const issues: Issue[] = [];
  for (let i = 0; i < taskIds.length; i += 30) {
    const chunk = taskIds.slice(i, i + 30);
    const q = query(
      issuesCollection,
      where('taskId', 'in', chunk),
      where('status', '==', 'Open')
    );
    try {
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((docSnap) => {
          issues.push(mapDocumentToIssue(docSnap));
        });
    } catch(error: any) {
        console.error(`issueService: Error in getOpenIssuesForTaskIds for chunk`, error);
        if (error.message?.includes("index")) {
            console.error("Firestore query requires an index for issues. Fields: 'taskId' (IN), 'status' (==).");
        }
    }
  }
  return issues;
};

export const getAllIssuesAssignedToUser = async (userUid: string): Promise<Issue[]> => {
  if (!userUid) return [];
  console.log(`issueService: getAllIssuesAssignedToUser for userUid: ${userUid}`);

  const q = query(
    issuesCollection,
    where('assignedToUids', 'array-contains', userUid)
  );

  try {
    const querySnapshot = await getDocs(q);
    const issues = querySnapshot.docs.map(mapDocumentToIssue);

    issues.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

    if (issues.length === 0) {
      console.log(`issueService: getAllIssuesAssignedToUser - Query executed successfully but found 0 issues assigned to user ${userUid}.`);
    } else {
      console.log(`issueService: Fetched ${issues.length} issues assigned to user ${userUid}`);
    }
    return issues;
  } catch (error: any) {
    console.error('issueService: Error fetching all issues assigned to user:', userUid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
      console.error("Firestore query for getAllIssuesAssignedToUser requires an index on 'assignedToUids' (array-contains). Check Firebase console.");
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

  if (updates.dueDate !== undefined) {
    updatePayload.dueDate = Timestamp.fromDate(updates.dueDate); 
  }

  try {
    await updateDoc(issueDocRef, updatePayload as any);

    if (updates.status && updates.status !== issueData.status) {
        await logTimelineEvent(
            issueData.taskId,
            userUid,
            'ISSUE_STATUS_CHANGED',
            `changed status of issue "${issueData.title}" to '${updates.status}'.`,
            { issueId, oldStatus: issueData.status, newStatus: updates.status, title: issueData.title }
        );
    }

  } catch (error: any) {
    console.error('issueService: Error updating issue ID:', issueId, error.message, error.code ? `(${error.code})` : '', error.stack);
    throw error;
  }
};

interface IssueProof {
  comments: string;
  attachment: Omit<AttachmentMetadata, 'projectId' | 'taskId' | 'ownerUid' | 'ownerName'>;
}

export const updateIssueStatus = async (
  issueId: string, 
  userUid: string, 
  newStatus: IssueProgressStatus, 
  userRole?: UserRole,
  proof?: IssueProof
): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated');

  const issueDocRef = doc(db, 'issues', issueId);
  const issueSnap = await getDoc(issueDocRef);
  if (!issueSnap.exists()){
      throw new Error('Issue not found.');
  }
  const issueData = mapDocumentToIssue(issueSnap);
  const oldStatus = issueData.status;

  if (issueData.ownerUid !== userUid && !(issueData.assignedToUids?.includes(userUid))) {
    throw new Error('Access denied. You did not create this issue nor are you assigned to it.');
  }

  try {
    if (oldStatus === newStatus) return; // No change needed

    if (proof) {
      // Create attachment and update issue status in a transaction/batch
      const ownerName = (await getDoc(doc(db, 'users', userUid))).data()?.displayName || 'Unknown User';
      
      await addAttachmentMetadata({
        projectId: issueData.projectId,
        taskId: issueData.taskId,
        ownerUid: userUid,
        ownerName: ownerName,
        ...proof.attachment
      });

      await updateDoc(issueDocRef, { status: newStatus, updatedAt: serverTimestamp() as Timestamp });
      
      await logTimelineEvent(
          issueData.taskId,
          userUid,
          'ISSUE_STATUS_CHANGED',
          `changed status of issue "${issueData.title}" to '${newStatus}' with comments and proof.`,
          { 
            issueId, 
            oldStatus, 
            newStatus, 
            title: issueData.title,
            comments: proof.comments,
            attachmentUrl: proof.attachment.url,
          }
      );

    } else {
      // This path is for future use if some status changes don't require proof.
      // Currently, UI forces proof.
      await updateDoc(issueDocRef, { status: newStatus, updatedAt: serverTimestamp() as Timestamp });
      await logTimelineEvent(
          issueData.taskId,
          userUid,
          'ISSUE_STATUS_CHANGED',
          `changed status of issue "${issueData.title}" to '${newStatus}'.`,
          { issueId, oldStatus, newStatus, title: issueData.title }
      );
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

export const deleteIssuesForTask = async (taskId: string, userUid: string): Promise<void> => {
  if (!userUid) throw new Error('User not authenticated for deleting issues for task');

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
    console.error('issueService: Error deleting issues for task ID (sub-task ID):', taskId, error.message, error.code ? `(${error.code})` : '', error.stack);
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
    if (error.message?.includes("index")) {
        console.error("Firestore query for counting open issues requires a composite index. Collection: 'issues', Fields: 'taskId' (ASC), 'status' (ASC).");
    }
    return 0;
  }
};

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
    throw new Error(`Failed to check for open issues for task ${taskId}. ${error.message}`);
  }
};

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
    return 0;
  }
};


import { db, storage } from '@/lib/firebase';
import type { Attachment } from '@/types';
import {
  collection,
  addDoc,
  query,
  getDocs,
  serverTimestamp,
  Timestamp,
  orderBy,
  doc,
  getDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { logTimelineEvent } from './timelineService';

export interface AttachmentMetadata {
  projectId: string;
  taskId: string;
  issueId?: string;
  ownerUid: string;
  ownerName: string;
  url: string;
  filename: string;
  reportType: 'daily-progress' | 'completion-proof' | 'issue-update-proof' | 'issue-report';
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  } | null;
}

// Uploads a file and returns its public URL, with progress reporting
export const uploadAttachment = (
  taskId: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // The filename from the File object is now used directly, as it's already unique.
    const filePath = `attachments/${taskId}/${file.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(error);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref)
          .then((downloadURL) => {
            resolve(downloadURL);
          })
          .catch((error) => {
            console.error('Failed to get download URL:', error);
            reject(error);
          });
      }
    );
  });
};

// Adds attachment metadata to a subcollection under the task
export const addAttachmentMetadata = async (attachmentData: AttachmentMetadata): Promise<string> => {
  const attachmentsCollectionRef = collection(db, 'tasks', attachmentData.taskId, 'attachments');
  
  const payload: any = {
    ...attachmentData,
    createdAt: serverTimestamp() as Timestamp,
  };
  
  // Don't save undefined fields to firestore
  if (!payload.issueId) {
    delete payload.issueId;
  }

  const docRef = await addDoc(attachmentsCollectionRef, payload);
  
  const descriptionKey = attachmentData.issueId ? 'timeline.attachmentAddedToIssue' : 'timeline.attachmentAdded';
  
  const timelineDetails: Record<string, any> = {
    reportType: attachmentData.reportType,
    url: attachmentData.url,
    filename: attachmentData.filename,
  };

  if (attachmentData.issueId) {
    timelineDetails.issueId = attachmentData.issueId;
  }

  // Log timeline event for attachment
  await logTimelineEvent(
    attachmentData.taskId,
    attachmentData.ownerUid,
    'ATTACHMENT_ADDED',
    descriptionKey,
    timelineDetails
  );

  return docRef.id;
};

// Gets all attachments for a specific task
export const getAttachmentsForTask = async (taskId: string): Promise<Attachment[]> => {
  const attachmentsCollectionRef = collection(db, 'tasks', taskId, 'attachments');
  const q = query(attachmentsCollectionRef, orderBy('createdAt', 'desc'));
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: (data.createdAt as Timestamp).toDate(),
    } as Attachment;
  });
};

// Gets attachments for a specific issue (by querying attachments on the parent task)
export const getAttachmentsForIssue = async (taskId: string, issueId: string): Promise<Attachment[]> => {
    const attachmentsCollectionRef = collection(db, 'tasks', taskId, 'attachments');
    // This query will require an index
    const q = query(attachmentsCollectionRef, where('issueId', '==', issueId), orderBy('createdAt', 'desc'));

    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
            id: docSnap.id,
            ...data,
            createdAt: (data.createdAt as Timestamp).toDate(),
            } as Attachment;
        });
    } catch(error: any) {
        console.error(`attachmentService: Error getting attachments for issue ${issueId}`, error);
        if (error.message?.includes("index")) {
            console.error("Firestore index needed for getAttachmentsForIssue: on 'attachments' subcollection, field 'issueId' (ASC), 'createdAt' (DESC).");
        }
        throw error;
    }
};

// Deletes an attachment from Storage and its metadata from Firestore
export const deleteAttachment = async (taskId: string, attachmentId: string, userUid: string): Promise<void> => {
    if (!userUid) throw new Error('User not authenticated');

    const attachmentDocRef = doc(db, 'tasks', taskId, 'attachments', attachmentId);
    const attachmentSnap = await getDoc(attachmentDocRef);

    if (!attachmentSnap.exists()) {
        throw new Error('Attachment not found.');
    }

    const attachmentData = attachmentSnap.data() as Attachment;

    if (attachmentData.ownerUid !== userUid) {
        throw new Error('Access denied. You can only delete your own attachments.');
    }
    
    // 1. Log event before deletion
    await logTimelineEvent(
        taskId,
        userUid,
        'ATTACHMENT_DELETED',
        'timeline.attachmentDeleted',
        { attachmentId: attachmentData.id, filename: attachmentData.filename }
    );
    
    // 2. Delete file from storage
    const fileRef = ref(storage, `attachments/${taskId}/${attachmentData.filename}`);
    await deleteObject(fileRef);

    // 3. Delete metadata from firestore
    await deleteDoc(attachmentDocRef);
};

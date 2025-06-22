
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
} from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { logTimelineEvent } from './timelineService';

export interface AttachmentMetadata {
  projectId: string;
  taskId: string;
  ownerUid: string;
  ownerName: string;
  url: string;
  filename: string;
  reportType: 'daily-progress' | 'completion-proof' | 'issue-update-proof' | 'issue-report';
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
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
  
  const payload = {
    ...attachmentData,
    createdAt: serverTimestamp() as Timestamp,
  };

  const docRef = await addDoc(attachmentsCollectionRef, payload);
  
  // Log timeline event for attachment
  await logTimelineEvent(
    attachmentData.taskId,
    attachmentData.ownerUid,
    'ATTACHMENT_ADDED',
    `uploaded an attachment: "${attachmentData.filename}".`,
    { reportType: attachmentData.reportType, url: attachmentData.url, filename: attachmentData.filename }
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
        `deleted an attachment: "${attachmentData.filename}".`,
        { attachmentId: attachmentData.id, filename: attachmentData.filename }
    );
    
    // 2. Delete file from storage
    const fileRef = ref(storage, `attachments/${taskId}/${attachmentData.filename}`);
    await deleteObject(fileRef);

    // 3. Delete metadata from firestore
    await deleteDoc(attachmentDocRef);
};

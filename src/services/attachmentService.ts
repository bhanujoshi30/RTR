
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
} from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';

interface AttachmentMetadata {
  projectId: string;
  taskId: string;
  ownerUid: string;
  ownerName: string;
  url: string;
  filename: string;
  reportType: 'daily-progress' | 'completion-proof';
  location?: {
    latitude: number;
    longitude: number;
  };
}

// Uploads a file and returns its public URL, with progress reporting
export const uploadAttachment = (
  taskId: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const filePath = `attachments/${taskId}/${Date.now()}-${file.name}`;
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

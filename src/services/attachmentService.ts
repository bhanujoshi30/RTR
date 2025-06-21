
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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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

// Uploads a file and returns its public URL
export const uploadAttachment = async (taskId: string, file: File): Promise<string> => {
  const filePath = `attachments/${taskId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, filePath);
  
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);
  
  return downloadURL;
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

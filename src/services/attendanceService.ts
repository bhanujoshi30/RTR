
import { db, storage } from '@/lib/firebase';
import type { AttendanceRecord } from '@/types';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { format } from 'date-fns';

export const uploadAttendancePhoto = (
  file: File,
  onProgress: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const filePath = `attendance-photos/${file.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      },
      (error) => {
        console.error('Attendance photo upload failed:', error);
        reject(error);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref)
          .then((downloadURL) => resolve(downloadURL))
          .catch((error) => {
            console.error('Failed to get download URL for attendance photo:', error);
            reject(error);
          });
      }
    );
  });
};

interface AttendanceData {
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  photoUrl: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
}

export const addAttendanceRecord = async (data: AttendanceData): Promise<string> => {
  const today = new Date();
  const attendanceCollectionRef = collection(db, 'attendance');
  
  const payload = {
    userId: data.userId,
    userName: data.userName,
    projectId: data.projectId,
    projectName: data.projectName,
    photoUrl: data.photoUrl,
    location: data.location || null,
    date: format(today, 'yyyy-MM-dd'),
    timestamp: serverTimestamp() as Timestamp,
  };

  const docRef = await addDoc(attendanceCollectionRef, payload);
  return docRef.id;
};

export const getTodaysAttendanceForUserInProject = async (userId: string, projectId: string, dateString: string): Promise<AttendanceRecord | null> => {
  const attendanceCollectionRef = collection(db, 'attendance');
  const q = query(
    attendanceCollectionRef,
    where('userId', '==', userId),
    where('projectId', '==', projectId),
    where('date', '==', dateString),
    orderBy('timestamp', 'desc'),
    limit(1)
  );
  
  try {
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    const docSnap = querySnapshot.docs[0];
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      timestamp: (data.timestamp as Timestamp).toDate(),
    } as AttendanceRecord;
  } catch (error) {
    console.error("Error fetching today's project attendance submission:", error);
    return null;
  }
};

export const getAttendanceForUser = async (userId: string): Promise<AttendanceRecord[]> => {
  const attendanceCollectionRef = collection(db, 'attendance');
  const q = query(
    attendanceCollectionRef,
    where('userId', '==', userId)
  );

  const querySnapshot = await getDocs(q);
  const records = querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      timestamp: (data.timestamp as Timestamp).toDate(),
    } as AttendanceRecord;
  });

  records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return records;
};

export const getAttendanceByDateForProject = async (dateString: string, projectId: string): Promise<AttendanceRecord[]> => {
  const attendanceCollectionRef = collection(db, 'attendance');
  const q = query(
    attendanceCollectionRef,
    where('date', '==', dateString),
    where('projectId', '==', projectId),
    orderBy('timestamp', 'desc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      timestamp: (data.timestamp as Timestamp).toDate(),
    } as AttendanceRecord;
  });
};

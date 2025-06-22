
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
    photoUrl: data.photoUrl,
    location: data.location || null,
    date: format(today, 'yyyy-MM-dd'),
    timestamp: serverTimestamp() as Timestamp,
  };

  const docRef = await addDoc(attendanceCollectionRef, payload);
  return docRef.id;
};

export const hasUserSubmittedAttendanceToday = async (userId: string, dateString: string): Promise<boolean> => {
  const attendanceCollectionRef = collection(db, 'attendance');
  const q = query(
    attendanceCollectionRef,
    where('userId', '==', userId),
    where('date', '==', dateString),
    limit(1)
  );
  
  try {
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error("Error checking attendance submission:", error);
    // Let it proceed as if not submitted, to avoid blocking user on error
    return false;
  }
};

export const getAttendanceByDate = async (dateString: string): Promise<AttendanceRecord[]> => {
  const attendanceCollectionRef = collection(db, 'attendance');
  const q = query(
    attendanceCollectionRef,
    where('date', '==', dateString),
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

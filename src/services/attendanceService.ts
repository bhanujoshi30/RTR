
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
  documentId,
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

  // Query ONLY by userId to avoid needing a composite index. This is allowed by security rules.
  // We will filter by date and projectId in the application code.
  const q = query(
    attendanceCollectionRef,
    where('userId', '==', userId)
  );
  
  try {
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }

    const allUserRecords = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        timestamp: (data.timestamp as Timestamp).toDate(),
      } as AttendanceRecord;
    });

    // Now, filter the user's records by date and projectId in the application code.
    const recordsForProjectToday = allUserRecords.filter(rec => rec.date === dateString && rec.projectId === projectId);

    if (recordsForProjectToday.length === 0) {
      return null;
    }
    
    // Sort to get the most recent one for that specific project on that day.
    recordsForProjectToday.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return recordsForProjectToday[0]; // Return the most recent record

  } catch (error) {
    console.error("Error fetching today's project attendance submission:", error);
    return null; // Return null if there's an error. The UI will handle it.
  }
};


export const getAttendanceForUser = async (userId: string): Promise<AttendanceRecord[]> => {
  const attendanceCollectionRef = collection(db, 'attendance');
  const attendanceQuery = query(
    attendanceCollectionRef,
    where('userId', '==', userId)
  );

  const attendanceSnapshot = await getDocs(attendanceQuery);
  if (attendanceSnapshot.empty) {
    return [];
  }

  const records: Omit<AttendanceRecord, 'projectExists'>[] = attendanceSnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      timestamp: (data.timestamp as Timestamp).toDate(),
    } as AttendanceRecord;
  });

  const projectIds = [...new Set(records.map(rec => rec.projectId))].filter(Boolean) as string[];

  if (projectIds.length === 0) {
    records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return records.map(r => ({ ...r, projectExists: false }));
  }

  const existingProjectIds = new Set<string>();
  const projectChunks: string[][] = [];
  for (let i = 0; i < projectIds.length; i += 30) {
    projectChunks.push(projectIds.slice(i, i + 30));
  }

  for (const chunk of projectChunks) {
      if (chunk.length > 0) {
        const projectsRef = collection(db, 'projects');
        const projectsQuery = query(projectsRef, where(documentId(), 'in', chunk));
        const projectsSnapshot = await getDocs(projectsQuery);
        projectsSnapshot.forEach(doc => existingProjectIds.add(doc.id));
      }
  }

  const recordsWithProjectStatus = records.map(record => ({
    ...record,
    projectExists: existingProjectIds.has(record.projectId),
  }));

  recordsWithProjectStatus.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return recordsWithProjectStatus;
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

import { db, auth } from '@/lib/firebase';
import type { Task, TaskStatus } from '@/types';
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

const tasksCollection = collection(db, 'tasks');

export const createTask = async (
  projectId: string,
  taskData: { name: string; description?: string; status: TaskStatus; dueDate?: Timestamp | null }
): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  // Verify project ownership before adding task
  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== user.uid) {
    throw new Error('Project not found or access denied.');
  }

  const newTaskData: Omit<Task, 'id' | 'createdAt'> & { createdAt: Timestamp } = {
    projectId,
    ownerUid: user.uid,
    name: taskData.name,
    description: taskData.description || '',
    status: taskData.status,
    dueDate: taskData.dueDate || undefined,
    createdAt: serverTimestamp() as Timestamp,
  };

  const newTaskRef = await addDoc(tasksCollection, newTaskData);
  return newTaskRef.id;
};

export const getProjectTasks = async (projectId: string): Promise<Task[]> => {
  const user = auth.currentUser;
  if (!user) return [];
  
  // We might not need to check ownerUid here if tasks are always fetched in context of a project
  // that's already been validated for ownership.
  // However, for direct task queries, this would be important.
  const q = query(
    tasksCollection, 
    where('projectId', '==', projectId), 
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
};

export const getTaskById = async (taskId: string): Promise<Task | null> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);

  if (taskSnap.exists() && taskSnap.data().ownerUid === user.uid) {
    return { id: taskSnap.id, ...taskSnap.data() } as Task;
  }
  return null;
};


export const updateTask = async (
  taskId: string,
  updates: Partial<Pick<Task, 'name' | 'description' | 'status' | 'dueDate'>>
): Promise<void> => {
   const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const taskDocRef = doc(db, 'tasks', taskId);
  // Add ownership check if necessary
  await updateDoc(taskDocRef, updates);
};

export const updateTaskStatus = async (taskId: string, status: TaskStatus): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const taskDocRef = doc(db, 'tasks', taskId);
  // Add ownership check if necessary
  await updateDoc(taskDocRef, { status });
};

export const deleteTask = async (taskId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const taskDocRef = doc(db, 'tasks', taskId);
  // Add ownership check if necessary
  await deleteDoc(taskDocRef);
};

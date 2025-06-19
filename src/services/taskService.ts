
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

  const projectDocRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectDocRef);
  if (!projectSnap.exists() || projectSnap.data().ownerUid !== user.uid) {
    throw new Error('Project not found or access denied.');
  }

  const newTaskDataOmit = { // Omit<Task, 'id' | 'createdAt' | 'ownerUid'> & { createdAt: Timestamp, ownerUid: string } = { // This was getting too complex with TS
    projectId,
    ownerUid: user.uid,
    name: taskData.name,
    description: taskData.description || '',
    status: taskData.status,
    dueDate: taskData.dueDate || undefined, // Firestore handles undefined by not writing the field
    createdAt: serverTimestamp() as Timestamp,
  };

  const newTaskRef = await addDoc(tasksCollection, newTaskDataOmit);
  return newTaskRef.id;
};

export const getProjectTasks = async (projectId: string): Promise<Task[]> => {
  const user = auth.currentUser;
  if (!user) {
    console.warn('taskService: getProjectTasks called without authenticated user.');
    return [];
  }
  
  const q = query(
    tasksCollection, 
    where('projectId', '==', projectId),
    where('ownerUid', '==', user.uid), // Ensure user only sees their tasks
    orderBy('createdAt', 'desc')
  );

  try {
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    return tasks;
  } catch (error: any) {
    console.error('taskService: Error fetching project tasks for projectId:', projectId, 'uid:', user.uid, error.message, error.code ? `(${error.code})` : '', error.stack);
    if (error.message && (error.message.includes("query requires an index") || error.message.includes("needs an index"))) {
        console.error("Firestore query for tasks requires a composite index. Please create it in the Firebase console. The error message should provide a direct link or details for manual creation. Fields to index: 'projectId' (ASC), 'ownerUid' (ASC), and 'createdAt' (DESC).");
    }
    throw error;
  }
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
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== user.uid) {
    throw new Error('Task not found or access denied for update.');
  }
  await updateDoc(taskDocRef, updates);
};

export const updateTaskStatus = async (taskId: string, status: TaskStatus): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== user.uid) {
    throw new Error('Task not found or access denied for status update.');
  }
  await updateDoc(taskDocRef, { status });
};

export const deleteTask = async (taskId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const taskDocRef = doc(db, 'tasks', taskId);
  const taskSnap = await getDoc(taskDocRef);
  if (!taskSnap.exists() || taskSnap.data().ownerUid !== user.uid) {
    throw new Error('Task not found or access denied for deletion.');
  }
  await deleteDoc(taskDocRef);
};

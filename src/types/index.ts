import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface User extends FirebaseUser {}

export type ProjectStatus = 'Not Started' | 'In Progress' | 'Completed';
export type TaskStatus = 'To Do' | 'In Progress' | 'Completed';

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerUid: string;
  createdAt: Timestamp;
  status: ProjectStatus;
  progress: number; // 0-100
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: TaskStatus;
  createdAt: Timestamp;
  dueDate?: Timestamp;
  ownerUid: string; // To ensure only project owner can create tasks under their project
}

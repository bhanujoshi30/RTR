
import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface User extends FirebaseUser {}

export type ProjectStatus = 'Not Started' | 'In Progress' | 'Completed';
export type TaskStatus = 'To Do' | 'In Progress' | 'Completed';

export type IssueSeverity = 'Normal' | 'Critical';
export type IssueProgressStatus = 'Open' | 'Closed';

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
  ownerUid: string; 
}

export interface Issue {
  id: string;
  projectId: string; // Keep projectId for potential project-wide issue queries if needed later
  taskId: string; // New: Issues are now directly linked to a task
  ownerUid: string;
  title: string;
  description?: string;
  severity: IssueSeverity;
  status: IssueProgressStatus;
  assignedToName?: string; 
  endDate?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

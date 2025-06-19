
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
  parentId?: string | null; // ID of the main task if this is a sub-task
  name: string;
  // Details below are primarily for sub-tasks. Main tasks might not use them directly.
  description?: string;
  status: TaskStatus; // Status might apply to sub-tasks or roll up to main tasks
  createdAt: Timestamp;
  dueDate?: Timestamp | null;
  ownerUid: string;
}

export interface Issue {
  id: string;
  projectId: string;
  taskId: string; // ID of the sub-task this issue belongs to
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

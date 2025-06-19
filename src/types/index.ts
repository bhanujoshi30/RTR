
import type { User as FirebaseUser } from 'firebase/auth';

// For client-facing types, we'll use JavaScript Date objects.

export type UserRole = 'admin' | 'supervisor' | 'member';

export interface User extends FirebaseUser {
  role?: UserRole; 
}

export type ProjectStatus = 'Not Started' | 'In Progress' | 'Completed';
export type TaskStatus = 'To Do' | 'In Progress' | 'Completed';

export type IssueSeverity = 'Normal' | 'Critical';
export type IssueProgressStatus = 'Open' | 'Closed';

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerUid: string;
  createdAt: Date;
  status: ProjectStatus;
  progress: number; // 0-100
}

export interface Task {
  id: string;
  projectId: string;
  parentId?: string | null;
  name: string;
  description?: string;
  status: TaskStatus;
  createdAt: Date;
  dueDate?: Date | null;
  ownerUid: string;
  assignedToUid?: string; 
  assignedToName?: string; 
}

export interface Issue {
  id: string;
  projectId: string;
  taskId: string;
  ownerUid: string;
  title: string;
  description?: string;
  severity: IssueSeverity;
  status: IssueProgressStatus;
  assignedToUid?: string; 
  assignedToName?: string; 
  endDate?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

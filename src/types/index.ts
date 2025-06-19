
import type { User as FirebaseUser } from 'firebase/auth';

// For client-facing types, we'll use JavaScript Date objects.

export interface User extends FirebaseUser {
  role?: 'supervisor' | 'admin' | 'member'; // Added role
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
  assignedToUid?: string; // Added for sub-tasks
  assignedToName?: string; // Added for sub-tasks
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
  assignedToUid?: string; // Changed from assignedToName to assignedToUid
  assignedToName?: string; // Added for consistency
  endDate?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

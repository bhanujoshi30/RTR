
import type { User as FirebaseUser } from 'firebase/auth';
// Remove Timestamp import from here if not used elsewhere, or keep if other raw Timestamps are needed.
// For client-facing types, we'll use JavaScript Date objects.

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
  createdAt: Date; // Changed from Timestamp
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
  createdAt: Date; // Changed from Timestamp
  dueDate?: Date | null; // Changed from Timestamp
  ownerUid: string;
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
  assignedToName?: string;
  endDate?: Date | null; // Changed from Timestamp
  createdAt: Date; // Changed from Timestamp
  updatedAt?: Date; // Changed from Timestamp
}

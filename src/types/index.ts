
export type UserRole = 'admin' | 'supervisor' | 'member';

export interface User {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  emailVerified?: boolean; 
  role?: UserRole; 
  createdAt?: Date; 
  updatedAt?: Date; 
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
  assignedToUids?: string[] | null; 
  assignedToNames?: string[] | null; 
}

export interface Issue {
  id: string;
  projectId: string;
  taskId: string; // This is the ID of the parent SubTask
  ownerUid: string;
  title: string;
  description?: string;
  severity: IssueSeverity;
  status: IssueProgressStatus;
  assignedToUids?: string[] | null; 
  assignedToNames?: string[] | null; 
  endDate?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

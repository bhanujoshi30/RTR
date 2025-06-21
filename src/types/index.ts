
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
  progress: number; // 0-100, Now dynamically calculated
  totalMainTasks?: number;
  totalSubTasks?: number;
  totalOpenIssues?: number;
}

export interface Task {
  id: string;
  projectId: string;
  parentId?: string | null; // null if it's a main task
  name: string;
  description?: string;
  status: TaskStatus; // Status is user-editable only for sub-tasks
  createdAt: Date;
  dueDate: Date; // Made mandatory from previous change for sub-tasks, optional for main tasks
  ownerUid: string;
  assignedToUids?: string[] | null; // Array of UIDs, applicable for sub-tasks
  assignedToNames?: string[] | null; // Array of names, applicable for sub-tasks
  updatedAt?: Date;
  progress?: number; // For main tasks: % completion based on sub-tasks
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
  assignedToUids?: string[] | null; // Array of UIDs
  assignedToNames?: string[] | null; // Array of names
  dueDate: Date; // Renamed from endDate and made mandatory
  createdAt: Date;
  updatedAt?: Date;
}

export interface Attachment {
  id: string;
  projectId: string;
  taskId: string; // This is the ID of the parent SubTask
  ownerUid: string;
  ownerName: string;
  url: string;
  filename: string;
  reportType: 'daily-progress' | 'completion-proof';
  location?: {
    latitude: number;
    longitude: number;
  };
  createdAt: Date;
}

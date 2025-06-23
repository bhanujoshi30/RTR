
export type UserRole = 'admin' | 'supervisor' | 'member' | 'client';

export type ProjectStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Payment Incomplete';
export type TaskStatus = 'To Do' | 'In Progress' | 'Completed';

export type IssueSeverity = 'Normal' | 'Critical';
export type IssueProgressStatus = 'Open' | 'Closed';

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerUid: string;
  clientUid?: string | null;
  clientName?: string | null;
  createdAt: Date;
  status: ProjectStatus;
  progress: number; // 0-100, Now dynamically calculated
  photoURL?: string | null;
  totalMainTasks?: number;
  totalSubTasks?: number;
  totalOpenIssues?: number;
  hasUpcomingReminder?: boolean;
  totalCost?: number;
  memberUids?: string[];
}

export interface Task {
  id: string;
  projectId: string;
  projectOwnerUid?: string; // For security rules
  clientUid?: string | null; // For security rules
  parentId?: string | null; // null if it's a main task
  name: string;
  description?: string;
  status: TaskStatus; // Status is user-editable only for sub-tasks
  taskType?: 'standard' | 'collection';
  reminderDays?: number | null;
  cost?: number | null;
  createdAt: Date;
  dueDate: Date; // Made mandatory from previous change for sub-tasks, optional for main tasks
  ownerUid: string;
  ownerName?: string | null;
  assignedToUids?: string[] | null; // Array of UIDs, applicable for sub-tasks
  assignedToNames?: string[] | null; // Array of names, applicable for sub-tasks
  updatedAt?: Date;
  progress?: number; // For main tasks: % completion based on sub-tasks
  openIssueCount?: number;
  isOverdue?: boolean;
  displaySubTaskCountLabel?: string;
}

export interface Issue {
  id: string;
  projectId: string;
  projectOwnerUid?: string;
  clientUid?: string | null;
  taskId: string; // This is the ID of the parent SubTask
  ownerUid: string;
  ownerName?: string | null;
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
  issueId?: string; // ID of the issue it's related to, if any
  ownerUid: string;
  ownerName: string;
  url: string;
  filename: string;
  reportType: 'daily-progress' | 'completion-proof' | 'issue-update-proof' | 'issue-report';
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  createdAt: Date;
}

export type TimelineEventType =
  | 'TASK_CREATED'
  | 'MAIN_TASK_UPDATED'
  | 'STATUS_CHANGED'
  | 'ASSIGNMENT_CHANGED'
  | 'ISSUE_CREATED'
  | 'ISSUE_STATUS_CHANGED'
  | 'ATTACHMENT_DELETED'
  | 'ISSUE_DELETED'
  | 'ATTACHMENT_ADDED'
  | 'MAIN_TASK_COMPLETED'
  | 'MAIN_TASK_REOPENED';

export interface TimelineEvent {
  id: string;
  taskId: string;
  timestamp: Date;
  type: TimelineEventType;
  descriptionKey: string;
  author: {
    uid: string;
    name: string;
  };
  details: Record<string, any>;
}

export interface AggregatedEvent {
  id: string; // main event ID or subtask ID
  timestamp: Date; // for sorting, usually the latest event in a group
  type: 'mainTaskEvent' | 'subTaskEventGroup';
  data: TimelineEvent | {
    subTaskInfo: {
      id: string;
      name: string;
    };
    events: TimelineEvent[];
  };
}

export interface ProjectAggregatedEvent {
  id: string; // main task ID
  timestamp: Date; // for sorting, latest event in the group
  type: 'mainTaskGroup';
  data: {
    mainTaskInfo: {
      id: string;
      name: string;
      taskType?: 'standard' | 'collection';
    };
    // The events here are the ones from getTimelineForMainTask
    events: AggregatedEvent[];
  };
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
  role?: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
  preferredLanguage?: 'en' | 'hi';
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  date: string; // YYYY-MM-DD for easy querying
  timestamp: Date;
  photoUrl: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  projectExists?: boolean;
}

export interface DprData {
  projectId: string;
  projectName: string;
  date: string; // YYYY-MM-DD
  language: 'en' | 'hi';
  tasksCreated: Pick<Task, 'id' | 'name' | 'parentId'>[];
  tasksCompleted: Pick<Task, 'id' | 'name' | 'parentId'>[];
  issuesOpened: Pick<Issue, 'id' | 'title' | 'severity'>[];
  issuesClosed: Pick<Issue, 'id' | 'title'>[];
  teamAttendance: {
    present: { uid: string; name: string; }[];
    absent: { uid: string; name: string; }[];
    total: number;
  };
  attachments: Pick<Attachment, 'id' | 'url' | 'filename' | 'ownerName'>[];
  timelineEvents: {
    description: string;
    authorName: string;
  }[];
}

export interface DprSummary {
  executiveSummary: string;
  keyAchievements: string[];
  newIssues: string[];
  attendanceSummary: string;
  outlook: string;
}

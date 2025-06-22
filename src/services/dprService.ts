
import { db } from '@/lib/firebase';
import type { DprData, Task, Issue, Attachment, User } from '@/types';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { getProjectById } from './projectService';
import { getAllProjectTasks } from './taskService';
import { getProjectIssues } from './issueService';
import { getAttendanceByDate } from './attendanceService';
import { getUsersByIds } from './userService';
import { getAttachmentsForTask } from './attachmentService';
import { isSameDay, parseISO } from 'date-fns';

const isActivityOnDate = (activityDate: Date | undefined, targetDate: Date): boolean => {
    if (!activityDate) return false;
    return isSameDay(activityDate, targetDate);
}

export const getDprData = async (projectId: string, date: string): Promise<DprData | null> => {
    const targetDate = parseISO(date);

    // 1. Get Project Details
    const project = await getProjectById(projectId, 'dpr-service-call'); // userUid is for security, service call can bypass if rules allow
    if (!project) {
        throw new Error(`Project with ID ${projectId} not found.`);
    }

    // 2. Get All Tasks and Issues for the project
    const allTasks = await getAllProjectTasks(projectId);
    const allIssues = await getProjectIssues(projectId);
    
    // 3. Filter activities for the target date
    const tasksCreated = allTasks.filter(t => isActivityOnDate(t.createdAt, targetDate));
    const tasksCompleted = allTasks.filter(t => t.status === 'Completed' && isActivityOnDate(t.updatedAt, targetDate));
    
    const issuesOpened = allIssues.filter(i => isActivityOnDate(i.createdAt, targetDate));
    const issuesClosed = allIssues.filter(i => i.status === 'Closed' && isActivityOnDate(i.updatedAt, targetDate));

    // 4. Get Attachments for the day
    const dailyAttachments: Attachment[] = [];
    const taskAttachmentPromises = allTasks.map(async task => {
        const attachments = await getAttachmentsForTask(task.id);
        return attachments.filter(att => isActivityOnDate(att.createdAt, targetDate));
    });
    const attachmentsByTask = await Promise.all(taskAttachmentPromises);
    attachmentsByTask.forEach(atts => dailyAttachments.push(...atts));

    // 5. Get Team Attendance
    const assignedUserUids = [...new Set(allTasks.flatMap(t => t.assignedToUids || []))];
    const assignedUsers = await getUsersByIds(assignedUserUids);
    const attendanceRecords = await getAttendanceByDate(date);
    const presentUids = new Set(attendanceRecords.map(rec => rec.userId));

    const presentTeam = assignedUsers.filter(u => presentUids.has(u.uid));
    const absentTeam = assignedUsers.filter(u => !presentUids.has(u.uid));

    // 6. Assemble the raw data payload
    const dprData: DprData = {
        projectId,
        projectName: project.name,
        date,
        tasksCreated: tasksCreated.map(t => ({ id: t.id, name: t.name, parentId: t.parentId })),
        tasksCompleted: tasksCompleted.map(t => ({ id: t.id, name: t.name, parentId: t.parentId })),
        issuesOpened: issuesOpened.map(i => ({ id: i.id, title: i.title, severity: i.severity })),
        issuesClosed: issuesClosed.map(i => ({ id: i.id, title: i.title })),
        teamAttendance: {
            present: presentTeam.map(u => ({ uid: u.uid, name: u.displayName || u.email! })),
            absent: absentTeam.map(u => ({ uid: u.uid, name: u.displayName || u.email! })),
            total: assignedUsers.length,
        },
        attachments: dailyAttachments.map(a => ({ id: a.id, url: a.url, filename: a.filename, ownerName: a.ownerName })),
    };

    return dprData;
};

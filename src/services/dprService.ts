
import { db } from '@/lib/firebase';
import type { DprData, Task, Issue, Attachment, User, TimelineEvent } from '@/types';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { getProjectById } from './projectService';
import { getAllProjectTasks } from './taskService';
import { getProjectIssues } from './issueService';
import { getAttendanceByDateForProject } from './attendanceService';
import { getUsersByIds } from './userService';
import { getAttachmentsForTask } from './attachmentService';
import { isSameDay, parseISO } from 'date-fns';
import { getTimelineForTask } from './timelineService';

const isActivityOnDate = (activityDate: Date | undefined, targetDate: Date): boolean => {
    if (!activityDate) return false;
    return isSameDay(activityDate, targetDate);
}

export const getDprData = async (projectId: string, date: string): Promise<DprData | null> => {
    const targetDate = parseISO(date);

    // 1. Get Project Details
    const project = await getProjectById(projectId, 'dpr-service-call', 'admin'); 
    if (!project) {
        throw new Error(`Project with ID ${projectId} not found.`);
    }

    // 2. Get All Tasks and Issues for the project
    const allTasks = await getAllProjectTasks(projectId);
    const allIssues = await getProjectIssues(projectId);
    
    // 3. Filter summary activities for the target date
    const tasksCreated = allTasks.filter(t => isActivityOnDate(t.createdAt, targetDate));
    const tasksCompleted = allTasks.filter(t => t.status === 'Completed' && isActivityOnDate(t.updatedAt, targetDate));
    
    const issuesOpened = allIssues.filter(i => isActivityOnDate(i.createdAt, targetDate));
    const issuesClosed = allIssues.filter(i => i.status === 'Closed' && isActivityOnDate(i.updatedAt, targetDate));

    // 4. Get Timeline events for the day
    const dailyTimelineEvents: { description: string; authorName: string }[] = [];
    const timelinePromises = allTasks.map(async (task) => {
        const events = await getTimelineForTask(task.id);
        return events.filter(event => isActivityOnDate(event.timestamp, targetDate));
    });
    
    const allDailyEventsNested = await Promise.all(timelinePromises);
    const allDailyEvents = allDailyEventsNested.flat();
    allDailyEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    allDailyEvents.forEach(event => {
        dailyTimelineEvents.push({
            description: event.description,
            authorName: event.author.name
        });
    });

    // 5. Get Attachments for the day
    const dailyAttachments: Attachment[] = [];
    const taskAttachmentPromises = allTasks.map(async task => {
        const attachments = await getAttachmentsForTask(task.id);
        return attachments.filter(att => isActivityOnDate(att.createdAt, targetDate));
    });
    const attachmentsByTask = await Promise.all(taskAttachmentPromises);
    attachmentsByTask.forEach(atts => dailyAttachments.push(...atts));

    // 6. Get Team Attendance for this specific project
    const assignedUserUids = [...new Set(allTasks.flatMap(t => t.assignedToUids || []))];
    const assignedUsers = await getUsersByIds(assignedUserUids);
    const attendanceRecords = await getAttendanceByDateForProject(date, projectId);
    const presentUids = new Set(attendanceRecords.map(rec => rec.userId));

    const presentTeam = assignedUsers.filter(u => presentUids.has(u.uid));
    const absentTeam = assignedUsers.filter(u => !presentUids.has(u.uid));

    // 7. Assemble the raw data payload
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
        timelineEvents: dailyTimelineEvents,
    };

    return dprData;
};

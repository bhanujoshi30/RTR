
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import type { TimelineEvent, TimelineEventType, AggregatedEvent, ProjectAggregatedEvent } from '@/types';
import { getUserDisplayName } from './userService';
import { getSubTasks, getProjectMainTasks } from './taskService';

/**
 * Logs a new event to a sub-task's timeline.
 * @param taskId The ID of the sub-task.
 * @param userUid The UID of the user performing the action.
 * @param type The type of event.
 * @param description A human-readable summary of the event.
 * @param details An object containing event-specific data.
 */
export const logTimelineEvent = async (
  taskId: string,
  userUid: string,
  type: TimelineEventType,
  description: string,
  details: Record<string, any> = {}
): Promise<void> => {
  try {
    const authorName = await getUserDisplayName(userUid) || 'System';
    const timelineCollectionRef = collection(db, 'tasks', taskId, 'timeline');
    
    const eventPayload = {
      taskId,
      type,
      description,
      author: { uid: userUid, name: authorName },
      details,
      timestamp: serverTimestamp(),
    };

    await addDoc(timelineCollectionRef, eventPayload);
  } catch (error) {
    console.error(`TimelineService: Failed to log event for task ${taskId}. Type: ${type}`, error);
    // Fail silently to not disrupt the user's main action
  }
};

/**
 * Fetches the complete timeline for a given sub-task.
 * @param taskId The ID of the sub-task.
 * @returns A promise that resolves to an array of timeline events.
 */
export const getTimelineForTask = async (taskId: string): Promise<TimelineEvent[]> => {
  try {
    const timelineCollectionRef = collection(db, 'tasks', taskId, 'timeline');
    // Query without ordering to prevent index-related permission errors. Sorting is done client-side.
    const q = query(timelineCollectionRef);
    
    const querySnapshot = await getDocs(q);
    
    const events = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        timestamp: (data.timestamp as Timestamp).toDate(),
      } as TimelineEvent;
    });

    // Sort events in application code.
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return events;
  } catch (error: any) {
    console.error(`TimelineService: Failed to fetch timeline for task ${taskId}`, error);
    // No need to check for index error message anymore, as the query is index-free.
    return []; // Return empty on error
  }
};

/**
 * Fetches an aggregated timeline for a main task, including its own events and grouped events from its sub-tasks.
 * @param mainTaskId The ID of the main task.
 * @returns A promise that resolves to an array of aggregated events, sorted by timestamp.
 */
export const getTimelineForMainTask = async (mainTaskId: string): Promise<AggregatedEvent[]> => {
  try {
    // 1. Fetch main task's own timeline events
    const mainTaskEvents = await getTimelineForTask(mainTaskId);
    const aggregatedMainTaskEvents: AggregatedEvent[] = mainTaskEvents.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      type: 'mainTaskEvent',
      data: event,
    }));

    // 2. Fetch sub-tasks and their timelines
    const subTasks = await getSubTasks(mainTaskId);
    const subTaskTimelinePromises = subTasks.map(async (subTask) => {
      const events = await getTimelineForTask(subTask.id);
      if (events.length > 0) {
        return {
          id: subTask.id,
          timestamp: events[0].timestamp, // The latest event's timestamp for sorting
          type: 'subTaskEventGroup' as const,
          data: {
            subTaskInfo: { id: subTask.id, name: subTask.name },
            events: events,
          },
        };
      }
      return null;
    });

    const subTaskEventGroupsWithNulls = await Promise.all(subTaskTimelinePromises);
    const aggregatedSubTaskEvents = subTaskEventGroupsWithNulls.filter((group): group is AggregatedEvent => group !== null);

    // 3. Combine and sort
    const combinedEvents = [...aggregatedMainTaskEvents, ...aggregatedSubTaskEvents];
    combinedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return combinedEvents;
    
  } catch (error) {
    console.error(`TimelineService: Failed to aggregate timeline for main task ${mainTaskId}`, error);
    return [];
  }
};

/**
 * Fetches an aggregated timeline for a project, grouping events by main tasks.
 * @param projectId The ID of the project.
 * @returns A promise that resolves to an array of project-aggregated events.
 */
export const getTimelineForProject = async (projectId: string): Promise<ProjectAggregatedEvent[]> => {
  try {
    const mainTasks = await getProjectMainTasks(projectId);

    const projectTimelinePromises = mainTasks.map(async (mainTask) => {
      const events = await getTimelineForMainTask(mainTask.id);
      if (events.length > 0) {
        return {
          id: mainTask.id,
          timestamp: events[0].timestamp, // Latest event for sorting
          type: 'mainTaskGroup' as const,
          data: {
            mainTaskInfo: { id: mainTask.id, name: mainTask.name },
            events: events,
          },
        };
      }
      return null;
    });

    const projectEventGroupsWithNulls = await Promise.all(projectTimelinePromises);
    const aggregatedProjectEvents = projectEventGroupsWithNulls.filter((group): group is ProjectAggregatedEvent => group !== null);

    aggregatedProjectEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return aggregatedProjectEvents;

  } catch (error) {
    console.error(`TimelineService: Failed to aggregate timeline for project ${projectId}`, error);
    return [];
  }
};

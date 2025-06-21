
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import type { TimelineEvent, TimelineEventType, Task } from '@/types';
import { getUserDisplayName } from './userService';
import { getSubTasks } from './taskService';

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
    const q = query(timelineCollectionRef, orderBy('timestamp', 'desc'));
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        timestamp: (data.timestamp as Timestamp).toDate(),
      } as TimelineEvent;
    });
  } catch (error: any) {
    console.error(`TimelineService: Failed to fetch timeline for task ${taskId}`, error);
    if (error.message?.includes("index")) {
        console.error("A Firestore index is required for the timeline query. Collection: 'timeline' (subcollection of 'tasks'), Field: 'timestamp' (descending).");
    }
    return []; // Return empty on error
  }
};

/**
 * Fetches an aggregated timeline for a main task, including its own events and events from all its sub-tasks.
 * @param mainTaskId The ID of the main task.
 * @returns A promise that resolves to an array of all relevant timeline events, sorted by timestamp.
 */
export const getTimelineForMainTask = async (mainTaskId: string): Promise<TimelineEvent[]> => {
  try {
    // 1. Fetch main task's own timeline
    const mainTaskEventsPromise = getTimelineForTask(mainTaskId);
    
    // 2. Fetch all sub-tasks
    const subTasksPromise = getSubTasks(mainTaskId);

    const [mainTaskEvents, subTasks] = await Promise.all([mainTaskEventsPromise, subTasksPromise]);

    // Add source info to main task events
    mainTaskEvents.forEach(event => {
      event.source = 'mainTask';
    });

    // 3. Fetch timelines for all sub-tasks
    const subTaskTimelinePromises = subTasks.map(subTask => 
      getTimelineForTask(subTask.id).then(events => 
        events.map(event => ({
          ...event,
          source: 'subTask' as const,
          subTaskInfo: { id: subTask.id, name: subTask.name }
        }))
      )
    );

    const subTaskTimelines = await Promise.all(subTaskTimelinePromises);
    const allSubTaskEvents = subTaskTimelines.flat();

    // 4. Combine and sort all events
    const combinedEvents = [...mainTaskEvents, ...allSubTaskEvents];
    combinedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return combinedEvents;

  } catch (error) {
    console.error(`TimelineService: Failed to aggregate timeline for main task ${mainTaskId}`, error);
    return [];
  }
};

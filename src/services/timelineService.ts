
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import type { TimelineEvent, TimelineEventType } from '@/types';
import { getUserDisplayName } from './userService';

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

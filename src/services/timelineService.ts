
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import type { TimelineEvent, TimelineEventType } from '@/types';
import { getUserDisplayName } from '@/services/userService';

/**
 * Logs a new event to a sub-task's timeline.
 * @param taskId The ID of the sub-task.
 * @param userUid The UID of the user performing the action.
 * @param type The type of event.
 * @param descriptionKey A key for i18n translation of the event summary.
 * @param details An object containing event-specific data for translation.
 */
export const logTimelineEvent = async (
  taskId: string,
  userUid: string,
  type: TimelineEventType,
  descriptionKey: string,
  details: Record<string, any> = {}
): Promise<void> => {
  try {
    const authorName = await getUserDisplayName(userUid) || 'System';
    const timelineCollectionRef = collection(db, 'tasks', taskId, 'timeline');
    
    const eventPayload = {
      taskId,
      type,
      descriptionKey,
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
    return []; // Return empty on error
  }
};

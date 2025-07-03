import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Function to send notifications when a new task is created
export const onTaskCreated = functions.firestore
  .document("tasks/{taskId}")
  .onCreate(async (snapshot) => {
    const task = snapshot.data();
    if (!task) {
      return;
    }

    const assignedToUids = task.assignedToUids || [];
    if (assignedToUids.length === 0) {
      return;
    }

    const userDocs = await db
      .collection("users")
      .where(admin.firestore.FieldPath.documentId(), "in", assignedToUids)
      .get();

    const notificationPromises = userDocs.docs.map(async (userDoc) => {
      const user = userDoc.data();
      const { fcmTokens } = user;

      // 1. Create In-App Notification
      await db.collection("notifications").add({
        userId: userDoc.id,
        title: "New Task Assigned",
        message: `You have been assigned a new task: ${task.name}`,
        link: `/projects/${task.projectId}/tasks/${snapshot.id}`,
        isRead: false,
        createdAt: new Date(),
      });

      // 2. Send Web Push Notification
      if (fcmTokens && fcmTokens.length > 0) {
        const message = {
          notification: {
            title: "New Task Assigned",
            body: `You have been assigned a new task: ${task.name}`,
          },
          webpush: {
            fcmOptions: {
              link: `/projects/${task.projectId}/tasks/${snapshot.id}`,
            },
          },
          tokens: fcmTokens,
        };
        await messaging.sendEachForMulticast(message);
      }
    });

    await Promise.all(notificationPromises);
  });

// Function to send notifications when a new issue is created
export const onIssueCreated = functions.firestore
  .document("issues/{issueId}")
  .onCreate(async (snapshot) => {
    const issue = snapshot.data();
    if (!issue) {
      return;
    }

    const assignedToUids = issue.assignedToUids || [];
    if (assignedToUids.length === 0) {
      return;
    }

    const userDocs = await db
      .collection("users")
      .where(admin.firestore.FieldPath.documentId(), "in", assignedToUids)
      .get();

    const notificationPromises = userDocs.docs.map(async (userDoc) => {
      const user = userDoc.data();
      const { fcmTokens } = user;

      // 1. Create In-App Notification
      await db.collection("notifications").add({
        userId: userDoc.id,
        title: "New Issue Reported",
        message: `A new issue has been assigned to you: ${issue.title}`,
        link: `/projects/${issue.projectId}/tasks/${issue.taskId}/issues/${snapshot.id}`,
        isRead: false,
        createdAt: new Date(),
      });

      // 2. Send Web Push Notification
      if (fcmTokens && fcmTokens.length > 0) {
        const message = {
          notification: {
            title: "New Issue Reported",
            body: `A new issue has been assigned to you: ${issue.title}`,
          },
          webpush: {
            fcmOptions: {
              link: `/projects/${issue.projectId}/tasks/${issue.taskId}/issues/${snapshot.id}`,
            },
          },
          tokens: fcmTokens,
        };
        await messaging.sendEachForMulticast(message);
      }
    });

    await Promise.all(notificationPromises);
  });

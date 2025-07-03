import { useState, useEffect } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { app as firebaseApp, db } from '@/lib/firebase';
import { useAuth } from './useAuth';

export const usePushNotifications = () => {
  const { user } = useAuth();
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const requestPermission = async () => {
      if (!user) return;

      const messaging = getMessaging(firebaseApp);
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

        // Enhanced debugging
        console.log('Attempting to use VAPID key:', vapidKey);

        if (!vapidKey || vapidKey === 'YOUR_VAPID_KEY') {
          console.error(
            'Firebase VAPID key is not defined, empty, or still a placeholder. Please check your .env.local file and restart the server.'
          );
          return;
        }
        const currentToken = await getToken(messaging, {
          vapidKey: vapidKey,
        });

        if (currentToken) {
          console.log('FCM Token received:', currentToken);
          // Save the token to the user's document in Firestore
          const userDocRef = doc(db, 'users', user.uid);
          await updateDoc(userDocRef, {
            fcmTokens: arrayUnion(currentToken),
          });
        }
      }
    };

    requestPermission();

    const messaging = getMessaging(firebaseApp);
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Message received. ', payload);
      setNotification(payload);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  return { notification };
};

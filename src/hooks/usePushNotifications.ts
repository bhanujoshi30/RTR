import { useState, useEffect } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { app as firebaseApp, db } from '@/lib/firebase';
import { useToast } from './use-toast';
import { useAuth } from './useAuth';

export const usePushNotifications = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const requestPermission = async () => {
      if (!user) return;

      const messaging = getMessaging(firebaseApp);
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

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
      toast({
        title: payload.notification?.title,
        description: payload.notification?.body,
      });
    });

    return () => {
      unsubscribe();
    };
  }, [user, toast]);
};

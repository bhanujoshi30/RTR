"use client";

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Notification {
  id: string;
  title: string;
  message: string;
  link: string;
  createdAt: Date;
  isRead: boolean;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
      })) as Notification[];
      setNotifications(notifs);

      const unread = notifs.filter((n) => !n.isRead).length;
      setUnreadCount(unread);
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative rounded-full p-2 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
          <Bell className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Notifications</h4>
            <p className="text-sm text-muted-foreground">
              Your most recent updates.
            </p>
          </div>
          <div className="grid gap-2">
            {notifications.length > 0 ? (
              notifications.map((notif) => (
                <Link href={notif.link} key={notif.id}>
                  <div className="grid grid-cols-[25px_1fr] items-start pb-4 last:mb-0 last:pb-0">
                    <span className="flex h-2 w-2 translate-y-1 rounded-full bg-sky-500" />
                    <div className="grid gap-1">
                      <p className="text-sm font-medium">{notif.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {notif.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(notif.createdAt, {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No new notifications.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

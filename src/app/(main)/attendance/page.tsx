
"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { AttendanceList } from '@/components/admin/AttendanceList';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CalendarCheck } from 'lucide-react';
import type { AttendanceRecord } from '@/types';
import { getAttendanceByDate } from '@/services/attendanceService';
import { format } from 'date-fns';

export default function AttendancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !selectedDate) return;

    const fetchRecords = async () => {
      setLoadingRecords(true);
      setError(null);
      try {
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        const fetchedRecords = await getAttendanceByDate(dateString);
        setRecords(fetchedRecords);
      } catch (err: any) {
        setError("Failed to load attendance records. This may be due to a missing database index. Check the browser console for details.");
        console.error(err);
      } finally {
        setLoadingRecords(false);
      }
    };
    fetchRecords();
  }, [selectedDate, isAdmin]);

  if (authLoading || !isAdmin) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-headline text-3xl font-semibold tracking-tight flex items-center">
          <CalendarCheck className="mr-3 h-8 w-8 text-primary" />
          Attendance Records
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Select a Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border p-0"
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Records for {selectedDate ? format(selectedDate, 'PPP') : '...'}</CardTitle>
            <CardDescription>
              Showing all attendance submissions for the selected date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRecords && (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="ml-2 text-lg">Loading records...</p>
              </div>
            )}
            {error && <p className="text-center text-destructive py-4">{error}</p>}
            
            {!loadingRecords && !error && (
              <AttendanceList records={records} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

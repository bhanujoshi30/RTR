
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarCheck, User, Camera, MapPin, Search, BarChart, XCircle } from 'lucide-react';
import type { AttendanceRecord, User as AppUser } from '@/types';
import { getAttendanceForUser } from '@/services/attendanceService';
import { getAllUsers } from '@/services/userService';
import { format, isSameMonth, addDays, isBefore, startOfToday } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import Image from 'next/image';

const AttendanceDetailCard = ({ record, selectedDate }: { record: AttendanceRecord | null, selectedDate?: Date }) => {
  if (!selectedDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance Details</CardTitle>
          <CardDescription>Select a highlighted day on the calendar to view details.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center h-96">
          <CalendarCheck className="h-16 w-16 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No date selected</p>
        </CardContent>
      </Card>
    );
  }

  if (!record) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Details for {format(selectedDate, 'PPP')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center h-96">
          <XCircle className="h-16 w-16 text-destructive/80" />
          <p className="mt-4 text-foreground font-semibold">No Attendance Recorded</p>
          <p className="text-muted-foreground text-sm">There is no attendance record for this day.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details for {format(record.timestamp, 'PPP')}</CardTitle>
        <CardDescription>Attendance submitted by {record.userName} at {format(record.timestamp, 'p')}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative aspect-video w-full rounded-lg overflow-hidden border">
           <Image src={record.photoUrl} alt={`Attendance for ${record.userName}`} layout="fill" objectFit="cover" />
        </div>
        
        <div className="space-y-2">
            <h4 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Location</h4>
             {record.location ? (
                <div className="text-sm pl-6">
                    <p className="whitespace-normal break-words text-foreground">
                    {record.location.address || 'Address not available'}
                    </p>
                    <a
                        href={`https://www.google.com/maps?q=${record.location.latitude},${record.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground mt-1 hover:text-primary hover:underline block"
                    >
                        {`Lat: ${record.location.latitude.toFixed(4)}, Lon: ${record.location.longitude.toFixed(4)}`}
                    </a>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground pl-6">Not available</p>
            )}
        </div>

        <Button asChild className="w-full">
            <Link href={record.photoUrl} target="_blank" rel="noopener noreferrer">
                <Camera className="mr-2 h-4 w-4" /> View Original Photo
            </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

const AttendanceSummaryCard = ({ present, absent }: { present: number, absent: number }) => (
    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart className="h-5 w-5" /> Monthly Summary</CardTitle>
            <CardDescription>Attendance for the selected month.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-center">
            <div>
                <p className="text-2xl font-bold text-green-600">{present}</p>
                <p className="text-sm text-muted-foreground">Days Present</p>
            </div>
             <div>
                <p className="text-2xl font-bold text-red-600">{absent}</p>
                <p className="text-sm text-muted-foreground">Days Absent</p>
            </div>
        </CardContent>
    </Card>
)

export default function AttendancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // State
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const [userAttendance, setUserAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [month, setMonth] = useState<Date>(new Date());
  
  const [error, setError] = useState<string | null>(null);
  
  // Explicit state and effect for selected record to fix refresh issue
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  useEffect(() => {
    if (!selectedDate || loadingAttendance) {
      setSelectedRecord(null);
      return;
    }
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    const record = userAttendance.find(rec => rec.date === dateString) || null;
    setSelectedRecord(record);
  }, [selectedDate, userAttendance, loadingAttendance]);


  const isAdmin = user?.role === 'admin';

  // Check for admin role
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router, isAdmin]);

  // Fetch all users for the dropdown
  useEffect(() => {
    if (!isAdmin || !user) return;
    
    const fetchUsers = async () => {
      setLoadingUsers(true);
      setError(null);
      try {
        const fetchedUsers = await getAllUsers(user.uid);
        const membersAndSupervisors = fetchedUsers.filter(u => u.role === 'member' || u.role === 'supervisor');
        setUsers(membersAndSupervisors);
      } catch (err: any) {
        setError("Failed to load users.");
        console.error(err);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [isAdmin, user]);
  
  // Fetch attendance records when a user is selected
  useEffect(() => {
    if (!selectedUserId) {
      setUserAttendance([]); // Clear data if no user is selected
      return;
    }

    const fetchRecords = async () => {
      setLoadingAttendance(true);
      setError(null);
      try {
        const fetchedRecords = await getAttendanceForUser(selectedUserId);
        setUserAttendance(fetchedRecords);
      } catch (err: any) {
        setError("Failed to load attendance records.");
        console.error(err);
      } finally {
        setLoadingAttendance(false);
      }
    };
    fetchRecords();
  }, [selectedUserId]);


  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
  };
  
  const attendedDays = useMemo(() => userAttendance.map(record => record.timestamp), [userAttendance]);
  
  const missedDays = useMemo(() => {
    if (!selectedUserId) return [];
    
    const today = startOfToday();
    const attendedDates = new Set(userAttendance.map(rec => rec.date)); // 'YYYY-MM-DD' format
    
    const missed: Date[] = [];
    let dayIterator = new Date(month.getFullYear(), month.getMonth(), 1);

    while (isSameMonth(dayIterator, month) && isBefore(dayIterator, today)) {
        const dateString = format(dayIterator, 'yyyy-MM-dd');
        if (!attendedDates.has(dateString)) {
            missed.push(new Date(dayIterator));
        }
        dayIterator = addDays(dayIterator, 1);
    }
    return missed;
  }, [userAttendance, month, selectedUserId]);

  const summaryStats = useMemo(() => {
    if (!selectedUserId) return { present: 0, absent: 0 };
    const present = userAttendance.filter(rec => isSameMonth(rec.timestamp, month)).length;
    const absent = missedDays.length;
    return { present, absent };
  }, [userAttendance, month, selectedUserId, missedDays]);


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
          User Attendance Viewer
        </h1>
      </div>
      
      {error && <p className="text-center text-destructive py-4">{error}</p>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
        {/* Left Column: User selection, summary and calendar */}
        <div className="lg:col-span-1 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Select User</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select onValueChange={setSelectedUserId} disabled={loadingUsers}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select a user"} />
                        </SelectTrigger>
                        <SelectContent>
                        {users.map(u => (
                            <SelectItem key={u.uid} value={u.uid}>
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                        <AvatarImage src={u.photoURL || undefined} />
                                        <AvatarFallback>{u.displayName?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <span>{u.displayName}</span>
                                </div>
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {selectedUserId && <AttendanceSummaryCard present={summaryStats.present} absent={summaryStats.absent} />}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Find Attendance</CardTitle>
                    <CardDescription>Days with attendance are green. Missed days are red.</CardDescription>
                </CardHeader>
                <CardContent className="relative">
                    {loadingAttendance && (
                         <div className="absolute inset-0 bg-background/80 flex flex-col justify-center items-center rounded-b-lg z-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="mt-2 text-sm text-muted-foreground">Loading records...</p>
                        </div>
                    )}
                    <Calendar
                        mode="single"
                        onSelect={handleDateSelect}
                        selected={selectedDate}
                        month={month}
                        onMonthChange={setMonth}
                        className="rounded-md border p-0"
                        modifiers={{ 
                            attended: attendedDays, 
                            missed: missedDays,
                        }}
                        modifiersStyles={{ 
                            attended: {
                                backgroundColor: 'hsl(var(--primary))',
                                color: 'hsl(var(--primary-foreground))',
                            },
                            missed: {
                                backgroundColor: 'hsl(var(--destructive) / 0.15)',
                            },
                            selected: {
                                outline: '2px solid hsl(var(--ring))',
                                outlineOffset: '2px',
                            },
                        }}
                        disabled={!selectedUserId || loadingAttendance}
                    />
                </CardContent>
            </Card>
        </div>

        {/* Right Column: Attendance Details */}
        <div className="lg:col-span-2">
           <AttendanceDetailCard record={selectedRecord} selectedDate={selectedDate} />
        </div>
      </div>
    </div>
  );
}

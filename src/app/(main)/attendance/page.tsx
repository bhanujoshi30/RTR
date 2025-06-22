
"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarCheck, User, Camera, MapPin, Search } from 'lucide-react';
import type { AttendanceRecord, User as AppUser } from '@/types';
import { getAttendanceForUser } from '@/services/attendanceService';
import { getAllUsers } from '@/services/userService';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import Image from 'next/image';

const AttendanceDetailCard = ({ record }: { record: AttendanceRecord | null }) => {
  if (!record) {
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
                    <p className="text-xs text-muted-foreground mt-1">
                    {`Lat: ${record.location.latitude.toFixed(4)}, Lon: ${record.location.longitude.toFixed(4)}`}
                    </p>
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


export default function AttendancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // State
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const [userAttendance, setUserAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  const [error, setError] = useState<string | null>(null);

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
        setUserAttendance([]);
        setSelectedRecord(null);
        return;
    };

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
    if (!date) {
        setSelectedRecord(null);
        return;
    }
    const dateString = format(date, 'yyyy-MM-dd');
    const recordForDay = userAttendance.find(rec => rec.date === dateString);
    setSelectedRecord(recordForDay || null);
  };
  
  // Dates with attendance records to highlight in the calendar
  const attendedDays = userAttendance.map(record => record.timestamp);

  // Main render logic
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
        {/* Left Column: User selection and calendar */}
        <div className="lg:col-span-1 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Select User</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select onValueChange={setSelectedUserId} disabled={loadingUsers}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select a user to view attendance"} />
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

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Find Attendance</CardTitle>
                    <CardDescription>Days with submitted attendance are highlighted.</CardDescription>
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
                        className="rounded-md border p-0"
                        modifiers={{ attended: attendedDays }}
                        modifiersStyles={{ attended: {
                            backgroundColor: 'hsl(var(--primary))',
                            color: 'hsl(var(--primary-foreground))',
                            opacity: 0.8,
                        }}}
                        disabled={!selectedUserId || loadingAttendance}
                    />
                </CardContent>
            </Card>
        </div>

        {/* Right Column: Attendance Details */}
        <div className="lg:col-span-2">
           <AttendanceDetailCard record={selectedRecord} />
        </div>
      </div>
    </div>
  );
}

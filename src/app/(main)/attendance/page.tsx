
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarCheck, User, Search, BarChart, XCircle, Building, FolderX } from 'lucide-react';
import type { AttendanceRecord, User as AppUser } from '@/types';
import { getAttendanceForUser } from '@/services/attendanceService';
import { getAllUsers } from '@/services/userService';
import { format, isSameMonth, addDays, isBefore, startOfToday, startOfMonth } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';
import { replaceDevanagariNumerals } from '@/lib/utils';

const AttendanceDetailCard = ({ records, selectedDate }: { records: AttendanceRecord[] | null, selectedDate?: Date }) => {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;

  if (!selectedDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('attendance.detailsTitle')}</CardTitle>
          <CardDescription>{t('attendance.detailsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center h-96">
          <CalendarCheck className="h-16 w-16 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('attendance.noDateSelected')}</p>
        </CardContent>
      </Card>
    );
  }

  const formattedDate = format(selectedDate, 'PPP', { locale: dateLocale });
  const displayDate = locale === 'hi' ? replaceDevanagariNumerals(formattedDate) : formattedDate;

  if (!records || records.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('attendance.detailsFor')} {displayDate}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center text-center h-96">
          <XCircle className="h-16 w-16 text-destructive/80" />
          <p className="mt-4 text-foreground font-semibold">{t('attendance.noAttendanceRecorded')}</p>
          <p className="text-muted-foreground text-sm">{t('attendance.noRecordForDay')}</p>
        </CardContent>
      </Card>
    );
  }
  
  const recordCount = locale === 'hi' ? replaceDevanagariNumerals(records.length.toString()) : records.length.toString();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('attendance.detailsFor')} {displayDate}</CardTitle>
        <CardDescription>
          {records[0].userName} {t('attendance.submittedAttendanceFor')} {recordCount} {t('attendance.projectsToday')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {records.map(record => {
            const formattedTime = format(record.timestamp, 'p', { locale: dateLocale });
            const displayTime = locale === 'hi' ? replaceDevanagariNumerals(formattedTime) : formattedTime;
            return (
              <div key={record.id} className="rounded-lg border p-4 space-y-4 bg-background">
                   <div className="flex justify-between items-start">
                      <div>
                          {record.projectExists === false ? (
                             <p className="font-semibold flex items-center gap-2 text-muted-foreground"><FolderX className="h-4 w-4 text-destructive" />{record.projectName} {t('attendance.deletedProject')}</p>
                          ) : (
                             <p className="font-semibold flex items-center gap-2"><Building className="h-4 w-4 text-primary" />{record.projectName}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{t('common.submittedAt')} {displayTime}</p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                          <Link href={record.photoUrl} target="_blank" rel="noopener noreferrer">
                             {t('attendance.viewPhoto')}
                          </Link>
                      </Button>
                  </div>
                  
                  <div className="relative aspect-video w-full rounded-lg overflow-hidden border">
                      <Image src={record.photoUrl} alt={`Attendance for ${record.userName}`} layout="fill" objectFit="cover" />
                  </div>
                  
                  {record.location ? (
                      <div className="text-sm">
                          <p className="whitespace-normal break-words text-foreground">
                          {record.location.address || t('attendance.addressNotAvailable')}
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
                      <p className="text-sm text-muted-foreground">{t('attendance.locationNotAvailable')}</p>
                  )}
              </div>
          )})}
      </CardContent>
    </Card>
  );
};

const AttendanceSummaryCard = ({ present, absent }: { present: number, absent: number }) => {
    const { t } = useTranslation();
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart className="h-5 w-5" /> {t('attendance.monthlySummary')}</CardTitle>
                <CardDescription>{t('attendance.monthlySummaryDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-center">
                <div>
                    <p className="text-2xl font-bold text-green-600">{present}</p>
                    <p className="text-sm text-muted-foreground">{t('attendance.daysPresent')}</p>
                </div>
                 <div>
                    <p className="text-2xl font-bold text-red-600">{absent}</p>
                    <p className="text-sm text-muted-foreground">{t('attendance.daysAbsent')}</p>
                </div>
            </CardContent>
        </Card>
    )
}

export default function AttendancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const [allUserAttendance, setAllUserAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [month, setMonth] = useState<Date>(new Date());
  
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDateRecords, setSelectedDateRecords] = useState<AttendanceRecord[] | null>(null);
  
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/dashboard');
  }, [user, authLoading, router, isAdmin]);

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
  
  useEffect(() => {
    if (!selectedUserId) {
      setAllUserAttendance([]);
      return;
    }
    const fetchRecords = async () => {
      setLoadingAttendance(true);
      setError(null);
      try {
        const fetchedRecords = await getAttendanceForUser(selectedUserId);
        setAllUserAttendance(fetchedRecords);
      } catch (err: any) {
        setError("Failed to load attendance records.");
        console.error(err);
      } finally {
        setLoadingAttendance(false);
      }
    };
    fetchRecords();
  }, [selectedUserId]);

  const updateSelectedDateRecords = useCallback(() => {
    if (!selectedDate || !selectedUserId) {
        setSelectedDateRecords(null);
        return;
    }
    const dateString = format(selectedDate, 'yyyy-MM-dd', { locale: dateLocale });
    const records = allUserAttendance.filter(rec => rec.date === dateString);
    setSelectedDateRecords(records);
  }, [selectedDate, allUserAttendance, selectedUserId, dateLocale]);

  useEffect(() => {
    updateSelectedDateRecords();
  }, [selectedDate, allUserAttendance, updateSelectedDateRecords]);


  const attendedDays = useMemo(() => {
    const dates = new Set(allUserAttendance.map(record => record.date));
    return Array.from(dates).map(dateStr => new Date(dateStr + 'T12:00:00')); // Use noon to avoid timezone issues
  }, [allUserAttendance]);
  
  const missedDays = useMemo(() => {
    if (!selectedUserId) return [];
    
    const today = startOfToday();
    const attendedDates = new Set(allUserAttendance.map(rec => rec.date));
    
    const missed: Date[] = [];
    let dayIterator = startOfMonth(month);

    while (isSameMonth(dayIterator, month) && isBefore(dayIterator, today)) {
        const dateString = format(dayIterator, 'yyyy-MM-dd', { locale: dateLocale });
        if (!attendedDates.has(dateString)) {
            missed.push(new Date(dayIterator));
        }
        dayIterator = addDays(dayIterator, 1);
    }
    return missed;
  }, [allUserAttendance, month, selectedUserId, dateLocale]);

  const summaryStats = useMemo(() => {
    if (!selectedUserId) return { present: 0, absent: 0 };
    const monthlyRecords = allUserAttendance.filter(rec => isSameMonth(rec.timestamp, month));
    const presentDays = new Set(monthlyRecords.map(r => r.date));
    return { present: presentDays.size, absent: missedDays.length };
  }, [allUserAttendance, month, selectedUserId, missedDays]);


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
          {t('attendance.pageTitle')}
        </h1>
      </div>
      
      {error && <p className="text-center text-destructive py-4">{error}</p>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-1 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> {t('attendance.selectUser')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select onValueChange={setSelectedUserId} disabled={loadingUsers}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder={loadingUsers ? t('attendance.loadingUsers') : t('attendance.selectAUser')} />
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
                    <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> {t('attendance.findAttendance')}</CardTitle>
                    <CardDescription>{t('attendance.findAttendanceDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="relative">
                    {loadingAttendance && (
                         <div className="absolute inset-0 bg-background/80 flex flex-col justify-center items-center rounded-b-lg z-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="mt-2 text-sm text-muted-foreground">{t('attendance.loadingRecords')}</p>
                        </div>
                    )}
                    <Calendar
                        locale={dateLocale}
                        mode="single"
                        onSelect={setSelectedDate}
                        selected={selectedDate}
                        month={month}
                        onMonthChange={setMonth}
                        className="rounded-md border p-0"
                        modifiers={{ attended: attendedDays, missed: missedDays }}
                        modifiersStyles={{ 
                            attended: { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' },
                            missed: { backgroundColor: 'hsl(var(--destructive) / 0.15)' },
                            selected: { outline: '2px solid hsl(var(--ring))', outlineOffset: '2px' },
                        }}
                        disabled={!selectedUserId || loadingAttendance}
                    />
                </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-2">
           <AttendanceDetailCard records={selectedDateRecords} selectedDate={selectedDate} />
        </div>
      </div>
    </div>
  );
}

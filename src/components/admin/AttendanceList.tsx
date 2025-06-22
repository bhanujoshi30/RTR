
"use client";

import type { AttendanceRecord } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, MapPin, User, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface AttendanceListProps {
  records: AttendanceRecord[];
}

export function AttendanceList({ records }: AttendanceListProps) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <CalendarClock className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No Records Found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No attendance was submitted on the selected date.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Proof</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-medium align-top">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    {/* Assuming user might have a photoURL, otherwise fallback */}
                    <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <span>{record.userName}</span>
                </div>
              </TableCell>
              <TableCell className="align-top">{format(record.timestamp, 'p')}</TableCell>
              <TableCell className="max-w-xs align-top">
                {record.location ? (
                  <div>
                    <p className="whitespace-normal break-words text-sm text-foreground">
                      {record.location.address || 'Address not available'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {`Lat: ${record.location.latitude.toFixed(4)}, Lon: ${record.location.longitude.toFixed(4)}`}
                    </p>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Not available</span>
                )}
              </TableCell>
              <TableCell className="text-right align-top">
                <Button variant="outline" size="sm" asChild>
                  <Link href={record.photoUrl} target="_blank" rel="noopener noreferrer">
                    <Camera className="mr-2 h-4 w-4" />
                    View Photo
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

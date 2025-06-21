
"use client";

import { useEffect, useState } from 'react';
import { getAttachmentsForTask } from '@/services/attachmentService';
import type { Attachment } from '@/types';
import { Loader2, Paperclip, FileImage } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import { format } from 'date-fns';

interface AttachmentListProps {
  taskId: string;
}

export function AttachmentList({ taskId }: AttachmentListProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAttachments = async () => {
      if (!taskId) return;
      try {
        setLoading(true);
        const fetchedAttachments = await getAttachmentsForTask(taskId);
        setAttachments(fetchedAttachments);
      } catch (err: any) {
        setError('Failed to load attachments.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAttachments();
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading attachments...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  if (attachments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <Paperclip className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">No Attachments</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          There are no attachments for this sub-task yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {attachments.map((att) => (
        <Card key={att.id} className="overflow-hidden">
          <a href={att.url} target="_blank" rel="noopener noreferrer" className="block relative aspect-square w-full">
            <Image
              src={att.url}
              alt={att.filename}
              layout="fill"
              objectFit="cover"
              className="transition-transform duration-300 hover:scale-105"
            />
             <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
          </a>
          <CardHeader className="p-3">
             <CardTitle className="text-sm font-semibold truncate flex items-center gap-1.5">
                <FileImage className="h-4 w-4 text-muted-foreground" />
                {att.reportType === 'completion-proof' ? 'Completion Proof' : 'Daily Progress'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
            <p>By: <span className="font-medium text-foreground">{att.ownerName}</span></p>
            <p>{format(att.createdAt, 'PPp')}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}


"use client";

import { useEffect, useState } from 'react';
import { getAttachmentsForTask, deleteAttachment } from '@/services/attachmentService';
import type { Attachment } from '@/types';
import { Loader2, Paperclip, FileImage, Trash2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { replaceDevanagariNumerals } from '@/lib/utils';


interface AttachmentListProps {
  taskId: string;
  projectId: string;
}

export function AttachmentList({ taskId, projectId }: AttachmentListProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;

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

  useEffect(() => {
    fetchAttachments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const handleDelete = async (attachmentId: string) => {
    if (!user) {
        toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
        return;
    }
    try {
        await deleteAttachment(taskId, attachmentId, user.uid);
        toast({ title: "Success", description: "Attachment deleted." });
        fetchAttachments(); // Re-fetch list
    } catch (error: any) {
        toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
    }
  };

  const getTitleForAttachment = (attachment: Attachment): React.ReactNode => {
      const issueLink = attachment.issueId ? (
          <Link href={`/projects/${projectId}/tasks/${taskId}/issues/${attachment.issueId}`} className="hover:underline text-primary flex items-center gap-1">
              Issue Report <ExternalLink className="h-3 w-3" />
          </Link>
      ) : null;
      
      switch (attachment.reportType) {
          case 'daily-progress':
              return 'Daily Progress';
          case 'completion-proof':
              return 'Completion Proof';
          case 'issue-report':
              return issueLink || 'Issue Report';
           case 'issue-update-proof':
               return issueLink ? <>Status Proof for {issueLink}</> : 'Issue Update Proof';
          default:
              return 'Attachment';
      }
  }


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
        <h3 className="font-headline text-lg font-semibold">No Attachments</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          There are no attachments for this sub-task yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {attachments.map((att) => {
        const createdAtText = format(att.createdAt, 'PPp', { locale: dateLocale });
        const displayDate = locale === 'hi' ? replaceDevanagariNumerals(createdAtText) : createdAtText;

        return (
            <Card key={att.id} className="overflow-hidden group/attachment">
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
               {user && user.uid === att.ownerUid && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon" className="absolute top-2 right-2 z-10 h-7 w-7 opacity-0 transition-opacity group-hover/attachment:opacity-100">
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete Attachment</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Attachment?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete "{att.filename}". This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(att.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <CardHeader className="p-3">
                 <CardTitle className="text-sm font-semibold truncate flex items-center gap-1.5">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    {getTitleForAttachment(att)}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                <p>By: <span className="font-medium text-foreground">{att.ownerName}</span></p>
                <p>{displayDate}</p>
              </CardContent>
            </Card>
        )})}
    </div>
  );
}

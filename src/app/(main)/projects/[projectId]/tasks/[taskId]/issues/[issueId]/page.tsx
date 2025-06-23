
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getIssueById } from '@/services/issueService';
import { getAttachmentsForIssue } from '@/services/attachmentService';
import type { Issue, Attachment } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Edit, CalendarDays, AlertTriangle, User, Users, Tag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { replaceDevanagariNumerals } from '@/lib/utils';

export default function IssueDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;
  const projectId = params.projectId as string;
  const taskId = params.taskId as string;
  const issueId = params.issueId as string;

  const [issue, setIssue] = useState<Issue | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user || !issueId) return;

    const fetchIssueDetails = async () => {
      try {
        setLoading(true);
        const [fetchedIssue, fetchedAttachments] = await Promise.all([
            getIssueById(issueId, user.uid),
            getAttachmentsForIssue(taskId, issueId)
        ]);
        
        if (fetchedIssue) {
          setIssue(fetchedIssue);
          setAttachments(fetchedAttachments);
        } else {
          setError('Issue not found or you do not have permission to view it.');
        }
      } catch (err: any) {
        console.error('Error fetching issue details:', err);
        setError('Failed to load issue details.');
      } finally {
        setLoading(false);
      }
    };

    fetchIssueDetails();
  }, [issueId, taskId, user, authLoading]);

  const getSeverityBadgeColor = (severity: Issue['severity']) => {
    if (severity === 'Critical') return 'bg-red-500 hover:bg-red-500 text-white';
    return 'bg-yellow-400 hover:bg-yellow-400 text-yellow-900';
  };

  const getStatusBadgeColor = (status: Issue['status']) => {
    if (status === 'Open') return 'bg-green-500 hover:bg-green-500 text-white';
    return 'bg-gray-500 hover:bg-gray-500 text-white';
  };

  if (loading || authLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  if (!issue) {
    return <p className="text-center text-muted-foreground py-10">Issue details could not be loaded.</p>;
  }
  
  const canEditIssue = user && user.uid === issue.ownerUid;
  const backPath = `/projects/${projectId}/tasks/${taskId}`;
  const displayAssignedNames = issue.assignedToNames && issue.assignedToNames.length > 0 ? issue.assignedToNames.join(', ') : 'None';
  
  const formattedDatePart = format(issue.createdAt, 'PPP', { locale: dateLocale });
  const formattedTimePart = format(issue.createdAt, 'h:mm a');
  const formattedCreatedAt = `${formattedDatePart}, ${formattedTimePart}`;
  const displayCreatedAt = locale === 'hi' ? replaceDevanagariNumerals(formattedCreatedAt) : formattedCreatedAt;

  const formattedDueDate = format(issue.dueDate, 'PPP', { locale: dateLocale });
  const displayDueDate = locale === 'hi' ? replaceDevanagariNumerals(formattedDueDate) : formattedDueDate;

  return (
    <div className="space-y-6">
       <Button variant="outline" onClick={() => router.push(backPath)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> {t('issueDetails.backToSubTask')}
      </Button>

      <Card>
        <CardHeader>
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <CardTitle className="font-headline text-3xl tracking-tight">{issue.title}</CardTitle>
                 {canEditIssue && (
                    <Button asChild>
                        <Link href={`/projects/${projectId}/tasks/${taskId}/issues/${issueId}/edit`}>
                            <Edit className="mr-2 h-4 w-4" /> {t('issueDetails.editIssue')}
                        </Link>
                    </Button>
                )}
            </div>
             {issue.description && <CardDescription className="mt-2 text-lg">{issue.description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
                <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" /> <strong>{t('common.status')}</strong> <Badge className={`${getStatusBadgeColor(issue.status)}`}>{t(`status.${issue.status.toLowerCase()}`)}</Badge></div>
                <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-muted-foreground" /> <strong>{t('common.severity')}</strong> <Badge className={`${getSeverityBadgeColor(issue.severity)}`}>{t(`severity.${issue.severity.toLowerCase()}`)}</Badge></div>
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> <strong>{t('common.createdBy')}</strong> {issue.ownerName || 'N/A'}</div>
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> <strong>{t('common.assignedTo')}</strong> {displayAssignedNames}</div>
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /> <strong>{t('common.created')}:</strong> {displayCreatedAt}</div>
                <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /> <strong>{t('common.due')}:</strong> {displayDueDate}</div>
            </div>
            <div>
                <h4 className="font-semibold mb-2">{t('common.attachments')}</h4>
                {attachments.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                    {attachments.map(att => (
                        <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded border overflow-hidden group">
                           <Image src={att.url} alt={att.filename} layout="fill" objectFit="cover" className="transition-transform group-hover:scale-105" />
                            <div className="absolute inset-x-0 bottom-0 p-1.5 text-xs text-white bg-black/50 truncate">
                                {att.filename}
                            </div>
                        </a>
                    ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('common.noAttachments')}</p>
                )}
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

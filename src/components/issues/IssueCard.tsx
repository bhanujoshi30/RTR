
"use client";

import type { Issue, IssueProgressStatus, IssueSeverity, UserRole } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, Edit2, Trash2, Users, CheckSquare, AlertTriangle, RotateCcw, Loader2, Eye } from 'lucide-react'; 
import { formatDistanceToNow, format } from 'date-fns';
import { deleteIssue, updateIssueStatus } from '@/services/issueService';
import { getTaskById, updateTaskStatus as updateParentTaskStatus } from '@/services/taskService';
import { useToast } from '@/hooks/use-toast';
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
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { IssueStatusChangeDialog } from './IssueStatusChangeDialog';
import Link from 'next/link';

interface IssueCardProps {
  issue: Issue;
  projectId: string;
  taskId: string; 
  onIssueUpdated: () => void;
  canManageIssue?: boolean; 
}

export function IssueCard({ issue, projectId, taskId, onIssueUpdated, canManageIssue }: IssueCardProps) {
  const { toast } = useToast();
  const [statusChangeState, setStatusChangeState] = useState<{ open: boolean; newStatus: IssueProgressStatus | null }>({ open: false, newStatus: null });
  const [isDeleting, setIsDeleting] = useState(false);

  const { user } = useAuth();

  const isIssueOwner = user && issue.ownerUid === user.uid;
  
  const canChangeStatusOfThisIssue = isIssueOwner || (user && issue.assignedToUids?.includes(user.uid));
  const canEditOrDeleteThisIssue = isIssueOwner;


  const handleInitiateStatusChange = (newStatus: IssueProgressStatus) => {
    if (!canChangeStatusOfThisIssue) {
      toast({ title: 'Permission Denied', description: 'You cannot modify this issue status.', variant: 'destructive' });
      return;
    }
    setStatusChangeState({ open: true, newStatus });
  };
  
  const handleStatusChangeSuccess = async () => {
     setStatusChangeState({ open: false, newStatus: null });
     onIssueUpdated(); // Refresh the list
     
     if (statusChangeState.newStatus === 'Open' && issue.status === 'Closed' && user) {
       try {
         const parentTask = await getTaskById(taskId, user.uid, user.role);
         if (parentTask && parentTask.status === 'Completed') {
           await updateParentTaskStatus(taskId, user.uid, 'In Progress', user.role);
           toast({ title: 'Task Status Updated', description: `Parent sub-task "${parentTask.name}" was automatically moved to 'In Progress'.` });
         }
       } catch (error) {
         console.error("Failed to reopen parent task", error);
       }
     }
  };


  const handleDeleteIssue = async () => {
     if (!canEditOrDeleteThisIssue) {
      toast({ title: 'Permission Denied', description: 'You cannot delete this issue.', variant: 'destructive' });
      return;
    }
    if (!user) {
        toast({ title: 'Error', description: 'User not authenticated.', variant: 'destructive'});
        return;
    }
    setIsDeleting(true);
    try {
      await deleteIssue(issue.id, user.uid);
      toast({ title: 'Issue Deleted', description: `"${issue.title}" has been deleted.` });
      onIssueUpdated();
    } catch (error: any) {
      toast({
        title: 'Deletion Failed',
        description: error.message || 'Could not delete the issue.',
        variant: 'destructive',
      });
    } finally {
        setIsDeleting(false);
    }
  };

  const getSeverityBadgeColor = (severity: IssueSeverity) => {
    if (severity === 'Critical') return 'bg-red-500 hover:bg-red-500 text-white';
    return 'bg-yellow-400 hover:bg-yellow-400 text-yellow-900'; 
  };

  const getStatusBadgeColor = (status: IssueProgressStatus) => {
    if (status === 'Open') return 'bg-green-500 hover:bg-green-500 text-white';
    return 'bg-gray-500 hover:bg-gray-500 text-white'; 
  };

  const displayAssignedNames = issue.assignedToNames && issue.assignedToNames.length > 0 
    ? issue.assignedToNames.join(', ') 
    : 'N/A';

  return (
    <>
      <IssueStatusChangeDialog
        open={statusChangeState.open}
        onOpenChange={(isOpen) => setStatusChangeState({ open: isOpen, newStatus: isOpen ? statusChangeState.newStatus : null })}
        issue={issue}
        newStatus={statusChangeState.newStatus}
        onSuccess={handleStatusChangeSuccess}
      />
      <Card className="shadow-md transition-shadow hover:shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="font-headline text-lg flex items-center">
              {issue.severity === 'Critical' && <AlertTriangle className="mr-2 h-5 w-5 text-red-500" />}
              {issue.title}
            </CardTitle>
            <div className="flex gap-2">
              <Badge className={`${getSeverityBadgeColor(issue.severity)}`}>
                {issue.severity}
              </Badge>
              <Badge className={`${getStatusBadgeColor(issue.status)}`}>
                {issue.status}
              </Badge>
            </div>
          </div>
          {issue.description && (
            <CardDescription className="pt-1 line-clamp-2">{issue.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div className="flex items-center">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              Created {issue.createdAt ? formatDistanceToNow(issue.createdAt, { addSuffix: true }) : 'N/A'}
              {issue.dueDate && ( 
                <span className="ml-2 border-l pl-2">
                  Due: {format(issue.dueDate, 'PP')}
                </span>
              )}
            </div>
            {issue.assignedToNames && issue.assignedToNames.length > 0 && ( 
              <div className="flex items-center">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Assigned to: {displayAssignedNames}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            {issue.status === 'Open' && (
              <Button variant="outline" size="sm" onClick={() => handleInitiateStatusChange('Closed')} disabled={!canChangeStatusOfThisIssue}>
                <CheckSquare className="mr-2 h-4 w-4" /> Close Issue
              </Button>
            )}
            {issue.status === 'Closed' && (
               <Button variant="outline" size="sm" onClick={() => handleInitiateStatusChange('Open')} disabled={!canChangeStatusOfThisIssue}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reopen Issue
              </Button>
            )}
             <Button asChild variant="outline" size="sm">
               <Link href={`/projects/${projectId}/tasks/${taskId}/issues/${issue.id}`}>
                  <Eye className="mr-2 h-4 w-4" /> View
               </Link>
             </Button>
             {canEditOrDeleteThisIssue && (
                <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="hover:bg-destructive hover:text-destructive-foreground" disabled={isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Delete Issue "{issue.title}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the issue.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteIssue} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete Issue
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
                </AlertDialog>
             )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

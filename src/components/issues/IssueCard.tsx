
"use client";

import type { Issue, IssueProgressStatus, IssueSeverity, UserRole } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, Edit2, Trash2, Users, CheckSquare, AlertTriangle } from 'lucide-react'; 
import { formatDistanceToNow, format } from 'date-fns';
import { updateIssueStatus, deleteIssue } from '@/services/issueService';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { IssueForm } from './IssueForm';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface IssueCardProps {
  issue: Issue;
  projectId: string;
  taskId: string; 
  onIssueUpdated: () => void;
  canManageIssue?: boolean; // Prop from IssueList indicating if current user can generally add issues to this parent task
}

export function IssueCard({ issue, projectId, taskId, onIssueUpdated, canManageIssue }: IssueCardProps) {
  const { toast } = useToast();
  const [showEditModal, setShowEditModal] = useState(false);
  const { user } = useAuth();

  const isIssueOwner = user && issue.ownerUid === user.uid;
  const isSupervisorAssignedToIssue = user?.role === 'supervisor' && issue.assignedToUids?.includes(user.uid);

  const canEditOrDeleteThisIssue = isIssueOwner;
  const canChangeStatusOfThisIssue = isIssueOwner || isSupervisorAssignedToIssue;


  const handleStatusChange = async (newStatus: IssueProgressStatus) => {
    if (!canChangeStatusOfThisIssue) {
      toast({ title: 'Permission Denied', description: 'You cannot modify this issue status.', variant: 'destructive' });
      return;
    }
    if (!user) {
        toast({ title: 'Error', description: 'User not authenticated.', variant: 'destructive'});
        return;
    }
    try {
      await updateIssueStatus(issue.id, user.uid, newStatus);
      toast({ title: 'Issue Updated', description: `Status of "${issue.title}" changed to ${newStatus}.` });
      onIssueUpdated();
    } catch (error) {
      toast({ title: 'Update Failed', description: 'Could not update issue status.', variant: 'destructive' });
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
            {issue.dueDate && ( // Changed from endDate
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
            <Button variant="outline" size="sm" onClick={() => handleStatusChange('Closed')} disabled={!canChangeStatusOfThisIssue}>
              <CheckSquare className="mr-2 h-4 w-4" /> Close Issue
            </Button>
          )}
           <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!canEditOrDeleteThisIssue}>
                <Edit2 className="mr-2 h-4 w-4" /> Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-headline text-xl">Edit Issue</DialogTitle>
                <DialogDescription>Modify the details of this issue.</DialogDescription>
              </DialogHeader>
              {user && <IssueForm projectId={projectId} taskId={taskId} issue={issue} onFormSuccess={() => { setShowEditModal(false); onIssueUpdated(); }} />}
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="hover:bg-destructive hover:text-destructive-foreground" disabled={!canEditOrDeleteThisIssue}>
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
                <AlertDialogAction onClick={handleDeleteIssue} className="bg-destructive hover:bg-destructive/90">
                  Delete Issue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}


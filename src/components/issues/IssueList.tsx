
"use client";

import { useEffect, useState } from 'react';
import { getTaskIssues } from '@/services/issueService';
import type { Issue } from '@/types';
import { IssueCard } from './IssueCard';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Bug } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { IssueForm } from './IssueForm';

interface IssueListProps {
  projectId: string;
  taskId: string;
}

export function IssueList({ projectId, taskId }: IssueListProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchIssues = async () => {
    if (authLoading || !user || !taskId) return;
    try {
      setLoading(true);
      const taskIssues = await getTaskIssues(taskId, user.uid); // Pass user.uid
      setIssues(taskIssues);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching issues for task:', taskId, err);
      setError(`Failed to load issues. ${err.message?.includes("index") ? "A database index might be required. Check console for details." : ""}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) { // Ensure user object is available
        fetchIssues();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, user, authLoading]);

  const handleFormSuccess = () => {
    setShowCreateModal(false);
    fetchIssues(); 
  };

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading issues...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h3 className="font-headline text-xl font-semibold flex items-center">
          <Bug className="mr-3 h-6 w-6 text-primary" />
          Task Issues
        </h3>
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!user}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add New Issue
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-headline text-xl">Add New Issue</DialogTitle>
              <DialogDescription>Fill in the details below to create a new issue for this task.</DialogDescription>
            </DialogHeader>
            {user && <IssueForm projectId={projectId} taskId={taskId} onFormSuccess={handleFormSuccess} />}
          </DialogContent>
        </Dialog>
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
          <Bug className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-3 font-headline text-lg font-semibold">No issues for this task yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add issues to this task to start tracking them.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} projectId={projectId} taskId={taskId} onIssueUpdated={fetchIssues} />
          ))}
        </div>
      )}
    </div>
  );
}

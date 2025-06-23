
"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { createIssue, updateIssue } from '@/services/issueService';
import { getTaskById, updateTask } from '@/services/taskService';
import type { Issue, IssueSeverity, IssueProgressStatus, User as AppUser, Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Save, Loader2, Users, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

const issueSeverities: IssueSeverity[] = ['Normal', 'Critical'];
const issueProgressStatuses: IssueProgressStatus[] = ['Open', 'Closed'];

interface IssueFormProps {
  projectId: string;
  taskId: string; 
  issue?: Issue;
  onFormSuccess: () => void;
}

export function IssueForm({ projectId, taskId, issue, onFormSuccess }: IssueFormProps) {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [title, setTitle] = useState(issue?.title || '');
  const [description, setDescription] = useState(issue?.description || '');
  const [severity, setSeverity] = useState<IssueSeverity>(issue?.severity || 'Normal');
  const [status, setStatus] = useState<IssueProgressStatus>(issue?.status || 'Open');
  const [dueDate, setDueDate] = useState<Date | undefined>(issue?.dueDate);
  const [assignedUsers, setAssignedUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [parentSubTask, setParentSubTask] = useState<Task | null>(null);
  const [allAssignableUsers, setAllAssignableUsers] = useState<AppUser[]>([]);
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(true);

  useEffect(() => {
    const fetchPrerequisites = async () => {
      if (!user || !taskId) return;
      setLoadingAssignableUsers(true);
      try {
        const fetchedParentTask = await getTaskById(taskId, user.uid, user.role);

        if (!fetchedParentTask) {
          toast({ title: "Error", description: "Parent sub-task not found.", variant: "destructive" });
          setLoadingAssignableUsers(false);
          return;
        }
        setParentSubTask(fetchedParentTask);
        
        const assignableUsersMap = new Map<string, AppUser>();
        if (fetchedParentTask.ownerUid && fetchedParentTask.ownerName) {
            assignableUsersMap.set(fetchedParentTask.ownerUid, { uid: fetchedParentTask.ownerUid, displayName: fetchedParentTask.ownerName, email: null, photoURL: null });
        }
        if (fetchedParentTask.assignedToUids && fetchedParentTask.assignedToNames) {
            fetchedParentTask.assignedToUids.forEach((uid, index) => {
                const name = fetchedParentTask.assignedToNames?.[index];
                if (uid && name) assignableUsersMap.set(uid, { uid, displayName: name, email: null, photoURL: null });
            });
        }
        const sortedUsers = Array.from(assignableUsersMap.values()).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        setAllAssignableUsers(sortedUsers);

        if (issue?.assignedToUids) {
            const preAssignedUsers = sortedUsers.filter(u => issue.assignedToUids!.includes(u.uid));
            setAssignedUsers(preAssignedUsers);
        }

      } catch (error: any) {
        console.error("Failed to fetch prerequisites for IssueForm:", error);
        toast({ title: "Error loading form data", description: `Could not load parent task data. ${error.message}`, variant: "destructive" });
        setAllAssignableUsers([]);
      } finally {
        setLoadingAssignableUsers(false);
      }
    };
    if (!authLoading && user) fetchPrerequisites();
  }, [taskId, user, authLoading, toast, issue]);

  const handleAddMember = () => {
    if (!selectedUserId) return;
    const userToAdd = allAssignableUsers.find(u => u.uid === selectedUserId);
    if (userToAdd && !assignedUsers.some(u => u.uid === selectedUserId)) {
      setAssignedUsers([...assignedUsers, userToAdd]);
      setSelectedUserId('');
    }
  };

  const handleRemoveMember = (uid: string) => {
    setAssignedUsers(assignedUsers.filter(u => u.uid !== uid));
  };
  
  const availableUsersToAssign = allAssignableUsers.filter(u => !assignedUsers.some(au => au.uid === u.uid));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !parentSubTask) {
      toast({ title: 'Error', description: 'User or parent task details are missing. Cannot proceed.', variant: 'destructive' });
      return;
    }
    if (!title || !dueDate) {
        toast({ title: 'Missing Fields', description: 'Title and Due Date are required.', variant: 'destructive'});
        return;
    }

    setLoading(true);
    
    const assignedToUids = assignedUsers.map(u => u.uid);
    const assignedToNames = assignedUsers.map(u => u.displayName || u.email || 'N/A');

    const issueDataPayload = { 
        title,
        description,
        severity,
        status,
        dueDate,
        assignedToUids,
        assignedToNames,
    };

    try {
      if (issue) {
        await updateIssue(issue.id, user.uid, taskId, issueDataPayload);
        toast({ title: 'Issue Updated', description: `"${title}" has been updated.` });
      } else {
        const ownerName = user.displayName || user.email || 'Unknown User';
        await createIssue(projectId, taskId, user.uid, ownerName, issueDataPayload);
        toast({ title: 'Issue Created', description: `"${title}" has been added.` });

        if (parentSubTask.status === 'Completed') {
          await updateTask(taskId, user.uid, { status: 'In Progress' }, user.role);
          toast({ title: 'Task Status Updated', description: `Parent sub-task "${parentSubTask.name}" was automatically moved to 'In Progress'.` });
        }
      }
      
      const newUidsToAdd = (assignedToUids || []).filter(uid => !(parentSubTask.assignedToUids || []).includes(uid));

      if (newUidsToAdd.length > 0) {
        const newNamesToAdd = newUidsToAdd.map(uid => allAssignableUsers.find(u => u.uid === uid)?.displayName || uid);
        await updateTask(taskId, user.uid, {
          assignedToUids: [...(parentSubTask.assignedToUids || []), ...newUidsToAdd],
          assignedToNames: [...(parentSubTask.assignedToNames || []), ...newNamesToAdd],
        }, user.role);
        toast({ title: "Parent Task Updated", description: "New assignees were added to the parent sub-task." });
      }
      onFormSuccess();
    } catch (error: any) {
      toast({ title: issue ? 'Update Failed' : 'Creation Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">Title</label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Describe the issue" />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">Description (Optional)</label>
            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="More details about the issue" rows={3} />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Severity</label>
              <Select onValueChange={(val: IssueSeverity) => setSeverity(val)} value={severity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {issueSeverities.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select onValueChange={(val: IssueProgressStatus) => setStatus(val)} value={status}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {issueProgressStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Assign To</label>
              <p className="text-sm text-muted-foreground">Select team members to assign this issue to.</p>
              {loadingAssignableUsers ? (
                  <p className="text-sm text-muted-foreground">Loading users...</p>
              ) : allAssignableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assignable users found for the parent task.</p>
              ) : (
                <>
                    <div className="flex gap-2">
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="">Select a user to add...</option>
                            {availableUsersToAssign.map(u => (
                                <option key={u.uid} value={u.uid}>{u.displayName}</option>
                            ))}
                        </select>
                        <Button type="button" onClick={handleAddMember} disabled={!selectedUserId}>Add</Button>
                    </div>
                    {assignedUsers.length > 0 && (
                        <div className="space-y-2 rounded-md border p-2">
                            <h4 className="text-xs font-semibold text-muted-foreground">Assigned:</h4>
                            <ul className="flex flex-wrap gap-2">
                                {assignedUsers.map(u => (
                                    <li key={u.uid} className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                                        {u.displayName}
                                        <button type="button" onClick={() => handleRemoveMember(u.uid)} className="rounded-full hover:bg-muted p-0.5">
                                            <X className="h-3 w-3" />
                                            <span className="sr-only">Remove {u.displayName}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
              )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Due Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={loading || !user || loadingAssignableUsers}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {issue ? 'Save Changes' : 'Create Issue'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

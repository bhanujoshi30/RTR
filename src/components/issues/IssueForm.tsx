
"use client";

import { useEffect, useState } from 'react';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createIssue, updateIssue } from '@/services/issueService';
import type { Issue, IssueSeverity, IssueProgressStatus, User as AppUser, Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Save, Loader2, Users, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getUsersByRole } from '@/services/userService';
import { getTaskById } from '@/services/taskService';

const issueSeverities: IssueSeverity[] = ['Normal', 'Critical'];
const issueProgressStatuses: IssueProgressStatus[] = ['Open', 'Closed'];

const issueSchema = z.object({
  title: z.string().min(3, { message: 'Issue title must be at least 3 characters' }).max(150),
  description: z.string().max(1000).optional(),
  severity: z.enum(issueSeverities),
  status: z.enum(issueProgressStatuses),
  assignedToUids: z.array(z.string()).optional().default([]),
  dueDate: z.date({ required_error: "Due date is required." }),
});

type IssueFormValues = z.infer<typeof issueSchema>;

interface IssueFormProps {
  projectId: string;
  taskId: string; // This is the parent SubTask ID
  issue?: Issue;
  onFormSuccess: () => void;
}

export function IssueForm({ projectId, taskId, issue, onFormSuccess }: IssueFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const [assignableUsersForIssue, setAssignableUsersForIssue] = useState<AppUser[]>([]);
  const [parentSubTask, setParentSubTask] = useState<Task | null>(null);
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(true);

  const form = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      title: issue?.title || '',
      description: issue?.description || '',
      severity: issue?.severity || 'Normal',
      status: issue?.status || 'Open',
      assignedToUids: issue?.assignedToUids || [],
      dueDate: issue?.dueDate || undefined,
    },
  });

  useEffect(() => {
    const fetchParentTaskAndAssignableUsers = async () => {
      if (!user || !taskId) return;
      setLoadingAssignableUsers(true);
      try {
        const fetchedParentTask = await getTaskById(taskId, user.uid, user.role);
        if (!fetchedParentTask) {
          toast({ title: "Error", description: "Parent sub-task not found.", variant: "destructive" });
          setAssignableUsersForIssue([]);
          setParentSubTask(null);
          setLoadingAssignableUsers(false);
          return;
        }
        setParentSubTask(fetchedParentTask);

        const parentAssigneeUids = fetchedParentTask.assignedToUids || [];

        if (parentAssigneeUids.length === 0) {
          setAssignableUsersForIssue([]);
          setLoadingAssignableUsers(false);
          return;
        }

        const [supervisors, members] = await Promise.all([
          getUsersByRole('supervisor'),
          getUsersByRole('member')
        ]);
        
        const allPotentialAssigneesMap = new Map<string, AppUser>();
        [...supervisors, ...members].forEach(u => allPotentialAssigneesMap.set(u.uid, u));

        const filteredUsers = parentAssigneeUids
          .map(uid => allPotentialAssigneesMap.get(uid))
          .filter(Boolean) as AppUser[]; 

        const sortedFilteredUsers = filteredUsers.sort((a, b) =>
          (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '')
        );
        setAssignableUsersForIssue(sortedFilteredUsers);

      } catch (error) {
        console.error("Failed to fetch parent task or assignable users for IssueForm:", error);
        toast({
          title: "Error",
          description: "Could not load users for assignment. Ensure parent sub-task is accessible and has assignees.",
          variant: "destructive"
        });
        setAssignableUsersForIssue([]);
      } finally {
        setLoadingAssignableUsers(false);
      }
    };

    if (!authLoading && user) {
      fetchParentTaskAndAssignableUsers();
    }
  }, [taskId, user, authLoading, toast]);

  const onSubmit: SubmitHandler<IssueFormValues> = async (data) => {
    if (!user) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to perform this action.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    let assignedToNamesForPayload: string[] | undefined = undefined;
    if (data.assignedToUids && data.assignedToUids.length > 0) {
      assignedToNamesForPayload = data.assignedToUids.map(uid => {
        const assignedUser = assignableUsersForIssue.find(u => u.uid === uid);
        return assignedUser?.displayName || uid;
      });
    }

    const issueDataPayload = {
      ...data,
      assignedToUids: data.assignedToUids || [],
      assignedToNames: assignedToNamesForPayload || [],
      dueDate: data.dueDate, // Pass JavaScript Date directly
    };

    try {
      if (issue) {
        await updateIssue(issue.id, user.uid, taskId, issueDataPayload);
        toast({ title: 'Issue Updated', description: `"${data.title}" has been updated.` });
      } else {
        await createIssue(projectId, taskId, user.uid, issueDataPayload);
        toast({ title: 'Issue Created', description: `"${data.title}" has been added.` });
      }
      onFormSuccess();
    } catch (error: any) {
      toast({
        title: issue ? 'Update Failed' : 'Creation Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Describe the issue" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="More details about the issue" {...field} value={field.value ?? ''} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="severity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Severity</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {issueSeverities.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {issueProgressStatuses.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Controller
          control={form.control}
          name="assignedToUids"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center"><Users className="mr-2 h-4 w-4 text-muted-foreground"/>Assign To (from Sub-task Assignees)</FormLabel>
              {loadingAssignableUsers && <p className="text-sm text-muted-foreground">Loading assignable users...</p>}
              {!loadingAssignableUsers && assignableUsersForIssue.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground border rounded-md flex items-center gap-2">
                   <AlertCircle className="h-5 w-5 text-amber-500" />
                  {parentSubTask && (parentSubTask.assignedToUids || []).length === 0
                    ? "Parent sub-task has no assigned users. Assign users to the sub-task first to enable issue assignment."
                    : "No users from the parent sub-task are available for assignment, or parent task not loaded."
                  }
                </div>
              )}
              {!loadingAssignableUsers && assignableUsersForIssue.length > 0 && (
                <div className="space-y-2 rounded-md border p-4 max-h-48 overflow-y-auto">
                  {assignableUsersForIssue.map(assignableUser => (
                    <FormItem key={assignableUser.uid} className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(assignableUser.uid)}
                          onCheckedChange={(checked) => {
                            const currentUids = field.value || [];
                            return checked
                              ? field.onChange([...currentUids, assignableUser.uid])
                              : field.onChange(currentUids.filter((uid) => uid !== assignableUser.uid));
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        {assignableUser.displayName || assignableUser.email} ({assignableUser.role})
                      </FormLabel>
                    </FormItem>
                  ))}
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Due Date</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value || undefined}
                    onSelect={field.onChange}
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={loading || !user || loadingAssignableUsers || (assignableUsersForIssue.length === 0 && !issue?.id) }>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {issue ? 'Save Changes' : 'Create Issue'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

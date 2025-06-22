
"use client";

import { useEffect, useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createIssue, updateIssue } from '@/services/issueService';
import { getTaskById, updateTask } from '@/services/taskService';
import type { Issue, IssueSeverity, IssueProgressStatus, User as AppUser, Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Save, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

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

  // Effect for fetching prerequisites (users, parent task)
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
        setAssignableUsersForIssue(sortedUsers);
      } catch (error: any) {
        console.error("Failed to fetch prerequisites for IssueForm:", error);
        toast({ title: "Error loading form data", description: `Could not load parent task data. ${error.message}`, variant: "destructive" });
        setAssignableUsersForIssue([]);
      } finally {
        setLoadingAssignableUsers(false);
      }
    };
    if (!authLoading && user) fetchPrerequisites();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, user, authLoading, toast]);


  const onSubmit: SubmitHandler<IssueFormValues> = async (data) => {
    if (!user || !parentSubTask) {
      toast({ title: 'Error', description: 'User or parent task details are missing. Cannot proceed.', variant: 'destructive' });
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

    const issueDataPayload = { ...data, assignedToUids: data.assignedToUids || [], assignedToNames: assignedToNamesForPayload || [], dueDate: data.dueDate };

    try {
      if (issue) {
        await updateIssue(issue.id, user.uid, taskId, issueDataPayload);
        toast({ title: 'Issue Updated', description: `"${data.title}" has been updated.` });
      } else {
        const ownerName = user.displayName || user.email || 'Unknown User';
        await createIssue(projectId, taskId, user.uid, ownerName, issueDataPayload);
        toast({ title: 'Issue Created', description: `"${data.title}" has been added.` });

        if (parentSubTask.status === 'Completed') {
          await updateTask(taskId, user.uid, { status: 'In Progress' }, user.role);
          toast({ title: 'Task Status Updated', description: `Parent sub-task "${parentSubTask.name}" was automatically moved to 'In Progress'.` });
        }
      }
      
      const finalAssigneeUids = data.assignedToUids || [];
      if (finalAssigneeUids.length > 0) {
        const parentTaskAssigneeUids = parentSubTask.assignedToUids || [];
        const newUidsToAdd = finalAssigneeUids.filter(uid => !parentTaskAssigneeUids.includes(uid));

        if (newUidsToAdd.length > 0) {
          const newNamesToAdd = newUidsToAdd.map(uid => assignableUsersForIssue.find(u => u.uid === uid)?.displayName || uid);
          await updateTask(taskId, user.uid, {
            assignedToUids: [...parentTaskAssigneeUids, ...newUidsToAdd],
            assignedToNames: [...(parentSubTask.assignedToNames || []), ...newNamesToAdd],
          }, user.role);
          toast({ title: "Parent Task Updated", description: "New assignees were added to the parent sub-task." });
        }
      }
      onFormSuccess();
    } catch (error: any) {
      toast({ title: issue ? 'Update Failed' : 'Creation Failed', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField control={form.control} name="title" render={({ field }) => ( <FormItem> <FormLabel>Title</FormLabel> <FormControl> <Input placeholder="Describe the issue" {...field} /> </FormControl> <FormMessage /> </FormItem> )} />
        <FormField control={form.control} name="description" render={({ field }) => ( <FormItem> <FormLabel>Description (Optional)</FormLabel> <FormControl> <Textarea placeholder="More details about the issue" {...field} value={field.value ?? ''} rows={3} /> </FormControl> <FormMessage /> </FormItem> )} />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField control={form.control} name="severity" render={({ field }) => ( <FormItem> <FormLabel>Severity</FormLabel> <Select onValueChange={field.onChange} defaultValue={field.value}> <FormControl> <SelectTrigger> <SelectValue placeholder="Select severity" /> </SelectTrigger> </FormControl> <SelectContent> {issueSeverities.map(s => ( <SelectItem key={s} value={s}>{s}</SelectItem> ))} </SelectContent> </Select> <FormMessage /> </FormItem> )} />
          <FormField control={form.control} name="status" render={({ field }) => ( <FormItem> <FormLabel>Status</FormLabel> <Select onValueChange={field.onChange} defaultValue={field.value}> <FormControl> <SelectTrigger> <SelectValue placeholder="Select status" /> </SelectTrigger> </FormControl> <SelectContent> {issueProgressStatuses.map(s => ( <SelectItem key={s} value={s}>{s}</SelectItem> ))} </SelectContent> </Select> <FormMessage /> </FormItem> )} />
        </div>
        
        <FormField
          control={form.control}
          name="assignedToUids"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="flex items-center"><Users className="mr-2 h-4 w-4 text-muted-foreground" />Assign To (Team Members)</FormLabel>
                <FormDescription>
                  Select team members to assign this issue to.
                </FormDescription>
              </div>
              <div className="space-y-2 rounded-md border p-4 max-h-48 overflow-y-auto">
                {assignableUsersForIssue.map((item) => (
                  <FormField
                    key={item.uid}
                    control={form.control}
                    name="assignedToUids"
                    render={({ field }) => {
                      return (
                        <FormItem
                          key={item.uid}
                          className="flex flex-row items-start space-x-3 space-y-0"
                        >
                          <FormControl>
                            <Checkbox
                              checked={(field.value || []).includes(item.uid)}
                              onCheckedChange={(checked) => {
                                const currentValue = field.value || [];
                                return checked
                                  ? field.onChange([...currentValue, item.uid])
                                  : field.onChange(
                                      currentValue.filter(
                                        (value) => value !== item.uid
                                      )
                                    );
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            {item.displayName || item.email} ({item.role})
                          </FormLabel>
                        </FormItem>
                      );
                    }}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />


        <FormField control={form.control} name="dueDate" render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Due Date</FormLabel>
            <Popover>
              <PopoverTrigger asChild> <FormControl> <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}> <CalendarIcon className="mr-2 h-4 w-4" /> {field.value ? format(field.value, "PPP") : <span>Pick a date</span>} </Button> </FormControl> </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"> <Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} /> </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end">
          <Button type="submit" disabled={loading || !user || loadingAssignableUsers}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {issue ? 'Save Changes' : 'Create Issue'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

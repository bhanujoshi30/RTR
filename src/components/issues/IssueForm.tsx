
"use client";

import { useEffect, useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createIssue, updateIssue } from '@/services/issueService';
import type { Issue, IssueSeverity, IssueProgressStatus, User as AppUser } from '@/types'; // Renamed User to AppUser
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Save, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getUsersByRole } from '@/services/userService';

const issueSeverities: IssueSeverity[] = ['Normal', 'Critical'];
const issueProgressStatuses: IssueProgressStatus[] = ['Open', 'Closed'];

const issueSchema = z.object({
  title: z.string().min(3, { message: 'Issue title must be at least 3 characters' }).max(150),
  description: z.string().max(1000).optional(),
  severity: z.enum(issueSeverities),
  status: z.enum(issueProgressStatuses),
  assignedToUid: z.string({ required_error: "Assignee is required" }).min(1, "Assignee is required"),
  endDate: z.date().optional().nullable(),
});

type IssueFormValues = z.infer<typeof issueSchema>;

interface IssueFormProps {
  projectId: string;
  taskId: string;
  issue?: Issue;
  onFormSuccess: () => void;
}

export function IssueForm({ projectId, taskId, issue, onFormSuccess }: IssueFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const [supervisors, setSupervisors] = useState<AppUser[]>([]); // Renamed User to AppUser

  const form = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      title: issue?.title || '',
      description: issue?.description || '',
      severity: issue?.severity || 'Normal',
      status: issue?.status || 'Open',
      assignedToUid: issue?.assignedToUid || '',
      endDate: issue?.endDate || null,
    },
  });

  useEffect(() => {
    const fetchSupervisors = async () => {
      try {
        const fetchedSupervisors = await getUsersByRole('supervisor');
        setSupervisors(fetchedSupervisors);
      } catch (error) {
        console.error("Failed to fetch supervisors for IssueForm:", error);
        toast({
          title: "Error",
          description: "Could not load list of supervisors. Please ensure they are set up correctly.",
          variant: "destructive"
        });
      }
    };
    fetchSupervisors();
  }, [toast]);

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
    const selectedSupervisor = supervisors.find(s => s.uid === data.assignedToUid);
    const assignedToName = selectedSupervisor?.displayName || undefined;

    const issueDataPayload = {
      ...data,
      assignedToName: assignedToName, // Add name for display convenience
      endDate: data.endDate ? data.endDate : null,
    };

    try {
      if (issue) {
        await updateIssue(issue.id, user.uid, issueDataPayload);
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
        <FormField
          control={form.control}
          name="assignedToUid"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center"><Users className="mr-2 h-4 w-4 text-muted-foreground"/>Assigned To</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a supervisor" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {supervisors.length === 0 && <SelectItem value="loading" disabled>Loading supervisors...</SelectItem>}
                  {supervisors.map(supervisor => (
                    <SelectItem key={supervisor.uid} value={supervisor.uid}>{supervisor.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="endDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>End Date (Optional)</FormLabel>
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
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={loading || !user}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {issue ? 'Save Changes' : 'Create Issue'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

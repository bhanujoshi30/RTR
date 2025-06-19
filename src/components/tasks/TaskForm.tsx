
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createTask, updateTask } from '@/services/taskService';
import type { Task, TaskStatus, User as AppUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Save, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getUsersByRole } from '@/services/userService';

const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Completed'];

const baseTaskSchema = z.object({
  name: z.string().min(3, { message: 'Task name must be at least 3 characters' }).max(150),
});

const subTaskSchema = baseTaskSchema.extend({
  description: z.string().max(1000).optional(),
  status: z.enum(taskStatuses),
  dueDate: z.date().optional().nullable(),
  assignedToUids: z.array(z.string()).optional().default([]),
});

const mainTaskSchema = baseTaskSchema.extend({
  description: z.string().max(1000).optional().nullable().default(null),
  status: z.enum(taskStatuses).default('To Do'), // Default, not user-editable for main task here
  dueDate: z.date().optional().nullable().default(null), // Default, not user-editable
  assignedToUids: z.array(z.string()).optional().default([]), // Main tasks are not assigned in this form
});

type SubTaskFormValues = z.infer<typeof subTaskSchema>;
type MainTaskFormValues = z.infer<typeof mainTaskSchema>;

interface TaskFormProps {
  projectId: string;
  task?: Task;
  parentId?: string | null;
  onFormSuccess?: () => void;
}

export function TaskForm({ projectId, task, parentId, onFormSuccess }: TaskFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const [supervisors, setSupervisors] = useState<AppUser[]>([]);

  const isSubTask = !!(parentId || task?.parentId);
  const currentSchema = isSubTask ? subTaskSchema : mainTaskSchema;

  const form = useForm<z.infer<typeof currentSchema>>({
    resolver: zodResolver(currentSchema),
    defaultValues: {
      name: task?.name || '',
      description: isSubTask ? (task?.description || '') : undefined,
      status: isSubTask ? (task?.status || 'To Do') : 'To Do',
      dueDate: task?.dueDate || null,
      assignedToUids: isSubTask ? (task?.assignedToUids || []) : [],
    },
  });

  useEffect(() => {
    if (isSubTask) {
      const fetchSupervisors = async () => {
        try {
          const fetchedSupervisors = await getUsersByRole('supervisor');
          setSupervisors(fetchedSupervisors);
        } catch (error) {
          console.error("Failed to fetch supervisors for TaskForm:", error);
          toast({
            title: "Error",
            description: "Could not load list of supervisors.",
            variant: "destructive"
          });
        }
      };
      fetchSupervisors();
    }
  }, [isSubTask, toast]);

  const onSubmit: SubmitHandler<z.infer<typeof currentSchema>> = async (data) => {
    if (!user) {
      toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive' });
      return;
    }
    setLoading(true);

    let assignedToNames: string[] | undefined = undefined;
    if (isSubTask && data.assignedToUids && data.assignedToUids.length > 0) {
      assignedToNames = data.assignedToUids.map(uid => {
        const supervisor = supervisors.find(s => s.uid === uid);
        return supervisor?.displayName || uid; 
      });
    }

    const taskPayload: any = {
      name: data.name,
      description: isSubTask ? (data as SubTaskFormValues).description || '' : '',
      status: isSubTask ? (data as SubTaskFormValues).status : 'To Do',
      dueDate: (isSubTask && (data as SubTaskFormValues).dueDate) ? (data as SubTaskFormValues).dueDate : null,
      parentId: parentId || task?.parentId || null,
      assignedToUids: isSubTask ? (data as SubTaskFormValues).assignedToUids || [] : [],
      assignedToNames: isSubTask ? assignedToNames || [] : [],
    };
    
    if (!isSubTask) { // Main task specific handling
      delete taskPayload.description;
      delete taskPayload.dueDate;
      delete taskPayload.assignedToUids;
      delete taskPayload.assignedToNames;
      delete taskPayload.status; // Main task status not set by form, derived or fixed
    }


    try {
      if (task) {
        await updateTask(task.id, user.uid, taskPayload, user.role);
        toast({ title: 'Task Updated', description: `"${data.name}" has been updated.` });
      } else {
        await createTask(projectId, user.uid, taskPayload);
        toast({ title: 'Task Created', description: `"${data.name}" has been added.` });
      }

      if (onFormSuccess) {
        onFormSuccess();
      } else {
        if (parentId || task?.parentId) {
          router.push(`/projects/${projectId}/tasks/${parentId || task?.parentId}`);
        } else {
          router.push(`/projects/${projectId}`);
        }
      }
      router.refresh();
    } catch (error: any) {
      toast({
        title: task ? 'Update Failed' : 'Creation Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formTitle = task
    ? (isSubTask ? "Edit Sub-task" : "Edit Main Task")
    : (isSubTask ? "Add New Sub-task" : "New Main Task");

  return (
    <Card className="shadow-lg">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">{formTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder={isSubTask ? "Sub-task name" : "Main task name"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isSubTask && (
              <>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Detailed information about the sub-task" {...field} value={(field.value as string) ?? ''} rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value as TaskStatus}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select sub-task status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {taskStatuses.map(status => (
                              <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Due Date (Optional)</FormLabel>
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
                                {field.value ? format(field.value as Date, "PPP") : <span>Pick a date</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value as Date | undefined}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
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
                      <FormLabel className="flex items-center"><Users className="mr-2 h-4 w-4 text-muted-foreground"/>Assigned To Supervisors</FormLabel>
                      {supervisors.length === 0 && <p className="text-sm text-muted-foreground">Loading supervisors...</p>}
                      <div className="space-y-2 rounded-md border p-4 max-h-48 overflow-y-auto">
                        {supervisors.map(supervisor => (
                          <FormItem key={supervisor.uid} className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                               <Checkbox
                                checked={field.value?.includes(supervisor.uid)}
                                onCheckedChange={(checked) => {
                                  const currentUids = field.value || [];
                                  return checked
                                    ? field.onChange([...currentUids, supervisor.uid])
                                    : field.onChange(currentUids.filter((uid) => uid !== supervisor.uid));
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {supervisor.displayName} ({supervisor.email})
                            </FormLabel>
                          </FormItem>
                        ))}
                      </div>
                       <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={loading || !user}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {task ? 'Save Changes' : (isSubTask ? 'Add Sub-task' : 'Create Main Task')}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

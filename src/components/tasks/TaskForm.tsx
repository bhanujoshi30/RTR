
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createTask, updateTask } from '@/services/taskService';
import type { Task, TaskStatus, User as AppUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from '@/components/ui/label';
import { CalendarIcon, Save, Loader2, Users, Layers } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getAllUsers } from '@/services/userService';

const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Completed'];
const taskTypes = ['standard', 'collection'] as const;

const subTaskSchema = z.object({
  name: z.string().min(3, { message: 'Task name must be at least 3 characters' }).max(150),
  description: z.string().max(1000).optional(),
  status: z.enum(taskStatuses),
  dueDate: z.date({ required_error: "Due date is required for sub-tasks." }),
  assignedToUids: z.array(z.string()).optional(),
});

const mainTaskSchema = z.object({
  name: z.string().min(3, { message: 'Task name must be at least 3 characters' }).max(150),
  description: z.string().max(1000).optional().nullable().default(null),
  dueDate: z.date({ required_error: "Due date is required." }),
  taskType: z.enum(taskTypes).default('standard'),
  reminderDays: z.coerce.number().int().min(0).optional().nullable(),
  cost: z.coerce.number().positive({ message: "Cost must be a positive number"}).optional().nullable(),
}).superRefine((data, ctx) => {
    if (data.taskType === 'collection' && (data.cost === undefined || data.cost === null || data.cost <= 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A positive cost amount is required for collection tasks.",
            path: ["cost"],
        });
    }
});


type TaskFormValues = z.infer<typeof subTaskSchema> | z.infer<typeof mainTaskSchema>;


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
  const [assignableUsers, setAssignableUsers] = useState<AppUser[]>([]);
  
  const isSubTask = !!(parentId || task?.parentId);
  const currentSchema = isSubTask ? subTaskSchema : mainTaskSchema;

  // State to manually manage checkbox selections for sub-tasks
  const [selectedUids, setSelectedUids] = useState<string[]>(isSubTask ? task?.assignedToUids || [] : []);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(currentSchema),
    defaultValues: {
      name: task?.name || '',
      description: task?.description || (isSubTask ? '' : null),
      status: isSubTask ? (task?.status || 'To Do') : undefined,
      dueDate: task?.dueDate || undefined, 
      assignedToUids: isSubTask ? (task?.assignedToUids || []) : undefined,
      taskType: !isSubTask ? (task?.taskType || 'standard') : undefined,
      reminderDays: !isSubTask ? (task?.reminderDays || null) : undefined,
      cost: !isSubTask ? (task?.cost || null) : undefined,
    },
  });
  
  // Sync react-hook-form's value when our manual state changes
  useEffect(() => {
    if(isSubTask){
      form.setValue('assignedToUids', selectedUids);
    }
  }, [selectedUids, form, isSubTask]);

  const taskTypeWatcher = form.watch('taskType');

  useEffect(() => {
    if (isSubTask && user) {
      const fetchAssignableUsers = async () => {
        try {
          const allUsers = await getAllUsers(user.uid);
          const assignable = allUsers.filter(u => u.role === 'supervisor' || u.role === 'member');
          setAssignableUsers(assignable);
        } catch (error) {
          console.error("Failed to fetch assignable users for TaskForm:", error);
          toast({
            title: "Error fetching users",
            description: "Could not load list of users for assignment. This may be a permissions issue.",
            variant: "destructive"
          });
          setAssignableUsers([]); 
        }
      };
      fetchAssignableUsers();
    }
  }, [isSubTask, toast, user]);


  const onSubmit: SubmitHandler<TaskFormValues> = async (data) => {
    if (!user) {
      toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive' });
      return;
    }
    setLoading(true);

    const taskPayload: any = {
      name: data.name,
      description: data.description || '',
      parentId: parentId || task?.parentId || null,
    };

    if (isSubTask) {
      const subTaskData = data as z.infer<typeof subTaskSchema>;
      
      const finalSelectedUids = selectedUids;
      const assignedToNamesForPayload = finalSelectedUids.map(uid => {
        const assignedUser = assignableUsers.find(u => u.uid === uid);
        return assignedUser?.displayName || uid; 
      }) || [];

      taskPayload.status = subTaskData.status;
      taskPayload.dueDate = subTaskData.dueDate;
      taskPayload.assignedToUids = finalSelectedUids;
      taskPayload.assignedToNames = assignedToNamesForPayload;
      taskPayload.taskType = 'standard';
      taskPayload.cost = null;
    } else {
      const mainTaskData = data as z.infer<typeof mainTaskSchema>;
      taskPayload.description = mainTaskData.description || '';
      taskPayload.dueDate = mainTaskData.dueDate;
      taskPayload.status = 'To Do';
      taskPayload.assignedToUids = []; 
      taskPayload.assignedToNames = [];
      taskPayload.taskType = mainTaskData.taskType;
      taskPayload.reminderDays = (mainTaskData.taskType === 'collection' && mainTaskData.reminderDays) ? mainTaskData.reminderDays : null;
      taskPayload.cost = (mainTaskData.taskType === 'collection' && mainTaskData.cost) ? mainTaskData.cost : null;
    }


    try {
      if (task) {
        await updateTask(task.id, user.uid, taskPayload, user.role);
        toast({ title: 'Task Updated', description: `"${data.name}" has been updated.` });
      } else {
        const ownerName = user.displayName || user.email || 'Unknown User';
        await createTask(projectId, user.uid, ownerName, taskPayload);
        toast({ title: 'Task Created', description: `"${data.name}" has been added.` });
      }

      if (onFormSuccess) {
        onFormSuccess();
      } else {
        if (taskPayload.parentId) {
          router.push(`/projects/${projectId}/tasks/${taskPayload.parentId}`);
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

  const handleCheckboxChange = (checked: boolean, uid: string) => {
    setSelectedUids(prev => {
      if (checked) {
        return [...new Set([...prev, uid])];
      } else {
        return prev.filter(id => id !== uid);
      }
    });
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
             {!isSubTask && (
                <FormField
                  control={form.control}
                  name="taskType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Main Task Type</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value as string}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="standard" />
                            </FormControl>
                            <FormLabel className="font-normal flex items-center gap-2">
                              <Layers className="h-4 w-4 text-muted-foreground" /> Standard Task (with sub-tasks)
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="collection" />
                            </FormControl>
                            <FormLabel className="font-normal flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg>
                                Collection Task (payment reminder)
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
             )}
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
             <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder={isSubTask ? "Detailed information about the sub-task" : "Brief description of the main task"} 
                        {...field} 
                        value={(field.value as string) ?? ''} 
                        rows={4} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            {isSubTask && (
              <>
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
                                {field.value ? format(field.value as Date, "PPP") : <span>Pick a date</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value as Date | undefined}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormItem>
                  <div className="mb-4">
                    <Label className="flex items-center text-base font-medium"><Users className="mr-2 h-4 w-4 text-muted-foreground"/>Assign To Team Members</Label>
                    <FormDescription>
                      Select team members to assign this sub-task to.
                    </FormDescription>
                  </div>
                  <div className="space-y-2 rounded-md border p-4 max-h-48 overflow-y-auto">
                    {assignableUsers.length === 0 && !loading && <p className="text-sm text-muted-foreground">No users available to assign.</p>}
                    {assignableUsers.map((assignableUser) => (
                      <div key={assignableUser.uid} className="flex flex-row items-center space-x-3">
                          <Checkbox
                            id={`user-task-${assignableUser.uid}`}
                            checked={selectedUids.includes(assignableUser.uid)}
                            onCheckedChange={(checked) => handleCheckboxChange(Boolean(checked), assignableUser.uid)}
                          />
                          <Label htmlFor={`user-task-${assignableUser.uid}`} className="font-normal cursor-pointer text-sm">
                            {assignableUser.displayName || assignableUser.email} ({assignableUser.role})
                          </Label>
                      </div>
                    ))}
                  </div>
                  <FormMessage>{form.formState.errors.assignedToUids?.message}</FormMessage>
                </FormItem>
              </>
            )}
            {!isSubTask && (
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
                                {field.value ? format(field.value as Date, "PPP") : <span>Pick a date</span>}
                            </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                            mode="single"
                            selected={field.value as Date | undefined}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))}
                            />
                        </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                />
            )}
             {taskTypeWatcher === 'collection' && !isSubTask && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Amount (INR)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="E.g., 10000" 
                          {...field} 
                          value={(field.value as number) ?? ''}
                          onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reminderDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reminder (Days Before Due)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="E.g., 7" 
                          {...field} 
                          value={(field.value as number) ?? ''}
                          onChange={e => field.onChange(e.target.value === '' ? null : e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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

    

"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createTask, updateTask } from '@/services/taskService';
import type { Task, TaskStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Completed'];

const subTaskSchema = z.object({
  name: z.string().min(3, { message: 'Task name must be at least 3 characters' }).max(150),
  description: z.string().max(1000).optional(),
  status: z.enum(taskStatuses),
  dueDate: z.date().optional().nullable(),
});

const mainTaskSchema = z.object({
  name: z.string().min(3, { message: 'Task name must be at least 3 characters' }).max(150),
  description: z.string().max(1000).optional().nullable().default(null), 
  status: z.enum(taskStatuses).default('To Do'), 
  dueDate: z.date().optional().nullable().default(null),
});


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

  const isSubTask = !!(parentId || task?.parentId);
  const currentSchema = isSubTask ? subTaskSchema : mainTaskSchema;

  const form = useForm<z.infer<typeof currentSchema>>({
    resolver: zodResolver(currentSchema),
    defaultValues: {
      name: task?.name || '',
      description: isSubTask ? (task?.description || '') : undefined,
      status: isSubTask ? (task?.status || 'To Do') : 'To Do',
      dueDate: task?.dueDate || null, // task.dueDate is now a JS Date or null
    },
  });

  const onSubmit: SubmitHandler<z.infer<typeof currentSchema>> = async (data) => {
    if (!user) {
      toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    
    const taskPayload: any = {
      name: data.name,
      description: isSubTask ? data.description || '' : '',
      status: isSubTask ? data.status : 'To Do', 
      dueDate: (isSubTask && data.dueDate) ? data.dueDate : null, // Pass Date object directly, service will handle conversion
      parentId: parentId || task?.parentId || null,
    };
    
    try {
      if (task) { 
        await updateTask(task.id, user.uid, taskPayload);
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
                        <Textarea placeholder="Detailed information about the sub-task" {...field} value={field.value ?? ''} rows={4} />
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                </div>
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

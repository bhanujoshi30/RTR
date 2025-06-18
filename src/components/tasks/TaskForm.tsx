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
import { Timestamp } from 'firebase/firestore';

const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Completed'];

const taskSchema = z.object({
  name: z.string().min(3, { message: 'Task name must be at least 3 characters' }).max(150),
  description: z.string().max(1000).optional(),
  status: z.enum(taskStatuses),
  dueDate: z.date().optional().nullable(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

interface TaskFormProps {
  projectId: string;
  task?: Task; // For editing existing task
}

export function TaskForm({ projectId, task }: TaskFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      name: task?.name || '',
      description: task?.description || '',
      status: task?.status || 'To Do',
      dueDate: task?.dueDate ? task.dueDate.toDate() : null,
    },
  });

  const onSubmit: SubmitHandler<TaskFormValues> = async (data) => {
    setLoading(true);
    const taskDataPayload = {
      ...data,
      dueDate: data.dueDate ? Timestamp.fromDate(data.dueDate) : null,
    };

    try {
      if (task) {
        await updateTask(task.id, taskDataPayload);
        toast({ title: 'Task Updated', description: `"${data.name}" has been updated.` });
      } else {
        await createTask(projectId, taskDataPayload);
        toast({ title: 'Task Created', description: `"${data.name}" has been added to the project.` });
      }
      router.push(`/projects/${projectId}`);
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

  return (
    <Card className="shadow-lg">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">{task ? 'Edit Task' : 'New Task Details'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Design homepage mockups" {...field} />
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
                    <Textarea placeholder="Detailed information about the task" {...field} rows={4} />
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
                          <SelectValue placeholder="Select task status" />
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
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {task ? 'Save Changes' : 'Add Task'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

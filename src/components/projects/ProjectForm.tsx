
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createProject, updateProject } from '@/services/projectService';
import type { Project, ProjectStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2 } from 'lucide-react';

const projectStatuses: ProjectStatus[] = ['Not Started', 'In Progress', 'Completed'];

const projectSchema = z.object({
  name: z.string().min(3, { message: 'Project name must be at least 3 characters' }).max(100),
  description: z.string().max(500).optional(),
  status: z.enum(projectStatuses),
  progress: z.number().min(0).max(100),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  project?: Project; // For editing existing project
  onFormSuccess?: () => void; // Optional: Callback for successful submission, e.g., to close a modal
}

export function ProjectForm({ project, onFormSuccess }: ProjectFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name || '',
      description: project?.description || '',
      status: project?.status || 'Not Started',
      progress: project?.progress || 0,
    },
  });

  const onSubmit: SubmitHandler<ProjectFormValues> = async (data) => {
    setLoading(true);
    try {
      if (project) {
        await updateProject(project.id, data);
        toast({ title: 'Project Updated', description: `"${data.name}" has been updated.` });
        // No router.push needed here if onFormSuccess handles UI changes like modal closing.
        // router.refresh() will be called by the parent or here if no onFormSuccess.
      } else {
        const newProjectId = await createProject(data);
        toast({ title: 'Project Created', description: `"${data.name}" has been created.` });
        router.push(`/projects/${newProjectId}`); // Redirect to the new project page
      }
      
      if (onFormSuccess) {
        onFormSuccess(); // Call success callback (e.g., close modal)
      }
      router.refresh(); // Refresh data on the current or new page
    } catch (error: any) {
      toast({
        title: project ? 'Update Failed' : 'Creation Failed',
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
            <CardTitle className="font-headline text-2xl">{project ? 'Edit Project' : 'New Project Details'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="E.g., Website Redesign" {...field} />
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
                    <Textarea placeholder="Briefly describe the project" {...field} rows={4} />
                  </FormControl>
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
                        <SelectValue placeholder="Select project status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projectStatuses.map(status => (
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
              name="progress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progress: {field.value}%</FormLabel>
                  <FormControl>
                    <Slider
                      defaultValue={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                      max={100}
                      step={1}
                      aria-label="Project progress slider"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {project ? 'Save Changes' : 'Create Project'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

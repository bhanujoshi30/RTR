
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createProject, updateProject } from '@/services/projectService';
import type { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Save, Loader2 } from 'lucide-react';

// Status removed from schema, as it's now dynamic
const projectSchema = z.object({
  name: z.string().min(3, { message: 'Project name must be at least 3 characters' }).max(100),
  description: z.string().max(500).optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  project?: Project;
  onFormSuccess?: () => void;
}

export function ProjectForm({ project, onFormSuccess }: ProjectFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name || '',
      description: project?.description || '',
      // status is no longer part of the form's default values
    },
  });

  const onSubmit: SubmitHandler<ProjectFormValues> = async (data) => {
    if (!user) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to perform this action.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    // projectData will not include status
    const projectData = {
      name: data.name,
      description: data.description || '', // Ensure description is at least an empty string
    };

    try {
      if (project) {
        await updateProject(project.id, user.uid, projectData);
        toast({ title: 'Project Updated', description: `"${data.name}" has been updated.` });
      } else {
        const newProjectId = await createProject(user.uid, projectData);
        toast({ title: 'Project Created', description: `"${data.name}" has been created.` });
        router.push(`/projects/${newProjectId}`);
      }

      if (onFormSuccess) {
        onFormSuccess();
      }
      router.refresh();
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
                    <Textarea placeholder="Briefly describe the project" {...field} value={field.value ?? ''} rows={4} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Status Field Removed */}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={loading || !user}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {project ? 'Save Changes' : 'Create Project'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

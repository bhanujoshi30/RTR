
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createProject, updateProject, uploadProjectPhoto } from '@/services/projectService';
import { getAllUsers } from '@/services/userService';
import type { Project, User as AppUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Save, Loader2, ImagePlus, User as UserIcon } from 'lucide-react';
import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';

const projectSchema = z.object({
  name: z.string().min(3, { message: 'Project name must be at least 3 characters' }).max(100),
  description: z.string().max(500).optional(),
  clientUid: z.string().optional().nullable(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  project?: Project;
  onFormSuccess?: () => void;
}

export function ProjectForm({ project, onFormSuccess }: ProjectFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(project?.photoURL || null);
  const [clients, setClients] = useState<AppUser[]>([]);
  
  const isAdmin = user?.role === 'admin';

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name || '',
      description: project?.description || '',
      clientUid: project?.clientUid || null,
    },
  });
  
  useEffect(() => {
    if (isAdmin && user) {
        const fetchClients = async () => {
            try {
                const allUsers = await getAllUsers(user.uid);
                const clientUsers = allUsers.filter(u => u.role === 'client');
                setClients(clientUsers);
            } catch (error) {
                console.error("Failed to fetch clients:", error);
                toast({ title: "Error", description: "Could not load list of clients.", variant: "destructive" });
            }
        };
        fetchClients();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, user]);


  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

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
    
    let photoURLToSave = project?.photoURL || null;

    try {
      if (selectedFile) {
        toast({ title: 'Uploading photo...', description: 'Please wait.' });
        photoURLToSave = await uploadProjectPhoto(selectedFile);
      }
      
      const selectedClient = data.clientUid ? clients.find(c => c.uid === data.clientUid) : null;

      const projectData = {
        name: data.name,
        description: data.description || '',
        photoURL: photoURLToSave,
        clientUid: data.clientUid || null,
        clientName: selectedClient?.displayName || null,
      };

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
            <CardTitle className="font-headline text-2xl">{t(project ? 'projectForm.editTitle' : 'projectForm.newTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormItem>
              <FormLabel>{t('projectForm.photoLabel')}</FormLabel>
              <FormControl>
                <div className="w-full">
                  <label htmlFor="photo-upload" className="cursor-pointer">
                    <div className="relative mt-2 flex justify-center rounded-lg border border-dashed border-input px-6 py-10 hover:border-primary">
                      {previewUrl ? (
                        <Image
                          src={previewUrl}
                          alt="Project preview"
                          width={400}
                          height={225}
                          className="object-cover rounded-md aspect-video"
                        />
                      ) : (
                        <div className="text-center">
                          <ImagePlus className="mx-auto h-12 w-12 text-muted-foreground" />
                          <p className="mt-4 text-sm leading-6 text-muted-foreground">
                            {t('projectForm.photoUpload')}
                          </p>
                          <p className="text-xs leading-5 text-muted-foreground">PNG, JPG up to 5MB</p>
                        </div>
                      )}
                    </div>
                  </label>
                  <Input id="photo-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/jpeg,image/png" />
                </div>
              </FormControl>
            </FormItem>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('projectForm.nameLabel')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('projectForm.namePlaceholder')} {...field} />
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
                  <FormLabel>{t('projectForm.descriptionLabel')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('projectForm.descriptionPlaceholder')} {...field} value={field.value ?? ''} rows={4} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {isAdmin && (
               <FormField
                  control={form.control}
                  name="clientUid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2"><UserIcon className="h-4 w-4 text-muted-foreground" />{t('projectForm.assignClientLabel')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('projectForm.selectClientPlaceholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                           <SelectItem value="none">{t('projectForm.noClient')}</SelectItem>
                           {clients.map(c => (
                            <SelectItem key={c.uid} value={c.uid}>
                                {c.displayName} ({c.email})
                            </SelectItem>
                           ))}
                        </SelectContent>
                      </Select>
                       <FormMessage />
                    </FormItem>
                  )}
                />
            )}

          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={loading || !user}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {project ? t('projectForm.saveChanges') : t('projectForm.createProject')}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

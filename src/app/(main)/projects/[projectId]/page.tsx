
export const runtime = 'edge';
"use client"; 

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProjectById, deleteProject } from '@/services/projectService';
import type { Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TaskList } from '@/components/tasks/TaskList'; 
import { Loader2, ArrowLeft, Edit, PlusCircle, CalendarDays, Trash2, Layers } from 'lucide-react'; 
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from '@/hooks/use-toast';
import { ProjectForm } from '@/components/projects/ProjectForm'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';


export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.projectId as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const { user, loading: authLoading } = useAuth();
  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';

  const fetchProjectDetails = async () => {
    if (authLoading || !user || !projectId) return;

    try {
      setLoading(true);
      const fetchedProject = await getProjectById(projectId, user.uid, user.role);
      if (fetchedProject) {
        setProject(fetchedProject);
      } else {
        setError('Project not found or you do not have permission to view it.');
        router.push('/dashboard'); 
      }
    } catch (err: any) {
      console.error('Error fetching project:', err);
      setError('Failed to load project details.');
      if ((err as any)?.message?.includes('index')) {
        setError('Failed to load project details. This might be due to a missing database index. Please check Firebase console.');
      } else if ((err as any)?.message?.includes('permissions') || (err as any)?.message?.includes('Access denied')) {
         setError('Failed to load project details due to missing permissions or access denial. Please check Firestore security rules and project ownership.');
         router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if(user && !authLoading){
      fetchProjectDetails();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user, authLoading]);

  const handleDeleteProject = async () => {
    if (!project || !user || isSupervisor || isMember) return; // Supervisors or Members cannot delete
    try {
      await deleteProject(project.id, user.uid);
      toast({ title: 'Project Deleted', description: `"${project.name}" has been deleted.` });
      router.push('/dashboard');
      router.refresh();
    } catch (error: any) {
      toast({
        title: 'Deletion Failed',
        description: error.message || 'Could not delete the project.',
        variant: 'destructive',
      });
    }
  };

  const handleProjectFormSuccess = () => {
    setShowEditModal(false);
    fetchProjectDetails(); 
    // router.refresh(); // fetchProjectDetails already re-fetches, refresh might be redundant if it causes another full reload
  };


  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'Not Started': return 'bg-gray-500 hover:bg-gray-500';
      case 'In Progress': return 'bg-blue-500 hover:bg-blue-500';
      case 'Completed': return 'bg-green-500 hover:bg-green-500';
      default: return 'bg-primary';
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  if (!project) {
    return <p className="text-center text-muted-foreground py-10">Project not found.</p>;
  }
  
  const canManageProject = user && !isSupervisor && !isMember;
  const displayProgress = project.progress !== undefined ? Math.round(project.progress) : 0;

  return (
    <div className="space-y-8">
      <Button variant="outline" onClick={() => router.push('/dashboard')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Projects
      </Button>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <CardTitle className="font-headline text-3xl tracking-tight">{project.name}</CardTitle>
            {canManageProject && ( 
              <div className="flex items-center gap-2">
                <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Edit className="mr-2 h-4 w-4" /> Edit Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="font-headline text-2xl">Edit Project</DialogTitle>
                    </DialogHeader>
                    <ProjectForm project={project} onFormSuccess={handleProjectFormSuccess} />
                  </DialogContent>
                </Dialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4"/>Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the project
                        and all associated tasks (main tasks, sub-tasks, and issues).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive hover:bg-destructive/90">
                        Delete Project
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
          {project.description && <CardDescription className="mt-2 text-lg">{project.description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant="secondary" className={`${getStatusColor(project.status)} text-primary-foreground text-base px-3 py-1`}>
                {project.status}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Progress</p>
              <div className="flex items-center gap-2">
                <Progress value={displayProgress} className="h-3 w-full" aria-label={`Project progress: ${displayProgress}%`} />
                <span className="text-sm font-semibold text-primary">{displayProgress}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Created At</p>
              <div className="flex items-center text-base">
                <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                {project.createdAt ? format(project.createdAt, 'PPP') : 'N/A'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <h2 className="font-headline text-2xl font-semibold flex items-center">
            <Layers className="mr-3 h-7 w-7 text-primary" /> 
            Main Tasks
          </h2>
          {canManageProject && ( 
            <Button asChild>
              <Link href={`/projects/${projectId}/tasks/create`}> 
                <PlusCircle className="mr-2 h-4 w-4" />
                Add New Main Task
              </Link>
            </Button>
          )}
        </div>
        {user && <TaskList projectId={projectId} />} 
      </div>
    </div>
  );
}

    

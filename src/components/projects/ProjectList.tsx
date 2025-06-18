"use client";

import { useEffect, useState } from 'react';
import { getUserProjects } from '@/services/projectService';
import type { Project } from '@/types';
import { ProjectCard } from './ProjectCard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, FolderOpen, PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user) return;

    const fetchProjects = async () => {
      try {
        setLoading(true);
        const userProjects = await getUserProjects();
        setProjects(userProjects);
        setError(null);
      } catch (err) {
        console.error('Error fetching projects:', err);
        setError('Failed to load projects.');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="ml-2 text-lg">Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive">{error}</p>;
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-12 text-center shadow-sm">
        <FolderOpen className="mx-auto h-16 w-16 text-muted-foreground/50" />
        <h3 className="mt-4 font-headline text-xl font-semibold">No projects yet</h3>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">
          Get started by creating your first project.
        </p>
        <Button asChild variant="default">
          <Link href="/projects/create">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Project
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

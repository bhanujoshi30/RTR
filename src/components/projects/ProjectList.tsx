
"use client";

import type { Project } from '@/types';
import { ProjectCard } from './ProjectCard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FolderOpen, PlusCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/hooks/useAuth';

interface ProjectListProps {
  projects: Project[];
}

export function ProjectList({ projects }: ProjectListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const isSupervisorOrMember = user?.role === 'supervisor' || user?.role === 'member';
  const isClient = user?.role === 'client';
  const isAdminOrOwner = user?.role === 'admin' || user?.role === 'owner';

  if (projects.length === 0) {
    let title = t('projectList.noProjects');
    let message = t('projectList.getStarted');
    
    if (isSupervisorOrMember) {
      title = t('projectList.welcome');
      message = t('projectList.contactAdmin');
    } else if (isClient) {
      title = t('projectList.noAssignedProjects');
      message = t('projectList.notAssigned');
    }

    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-12 text-center shadow-sm">
        <FolderOpen className="mx-auto h-16 w-16 text-muted-foreground/50" />
        <h3 className="mt-4 font-headline text-xl font-semibold">{title}</h3>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">
          {message}
        </p>
        {isAdminOrOwner && (
          <Button asChild variant="default">
            <Link href="/projects/create">
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('projectList.createProject')}
            </Link>
          </Button>
        )}
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

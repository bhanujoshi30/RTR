
"use client";

// This component now receives projects directly via props.
// The logic to determine which projects to show (owned vs. assigned)
// is handled by the parent component (e.g., DashboardPage).

import type { Project } from '@/types';
import { ProjectCard } from './ProjectCard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FolderOpen, PlusCircle } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  isSupervisorView?: boolean; // To adjust messages if needed
}

export function ProjectList({ projects, isSupervisorView = false }: ProjectListProps) {
  if (projects.length === 0) {
    const title = isSupervisorView ? "No Projects with Assigned Tasks" : "No projects yet";
    const message = isSupervisorView 
      ? "You currently have no tasks assigned to you in any project."
      : "Get started by creating your first project.";

    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-12 text-center shadow-sm">
        <FolderOpen className="mx-auto h-16 w-16 text-muted-foreground/50" />
        <h3 className="mt-4 font-headline text-xl font-semibold">{title}</h3>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">
          {message}
        </p>
        {!isSupervisorView && ( // "Create Project" button only if not supervisor view
          <Button asChild variant="default">
            <Link href="/projects/create">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Project
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

    
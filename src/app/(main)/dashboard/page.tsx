
"use client";

import { ProjectList } from '@/components/projects/ProjectList';
import { Button } from '@/components/ui/button';
import { FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import type { Project } from '@/types';
import { getAllTasksAssignedToUser } from '@/services/taskService';
import { getProjectsByIds, getUserProjects } from '@/services/projectService';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [projectsToDisplay, setProjectsToDisplay] = useState<Project[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const isSupervisor = user?.role === 'supervisor';
  const isAdminOrOwner = !isSupervisor && user; 

  useEffect(() => {
    const fetchDashboardData = async () => {
      console.log('DashboardPage: fetchDashboardData called. Auth Loading:', authLoading, 'User:', user ? `${user.displayName} (Role: ${user.role}, UID: ${user.uid})` : 'null');
      if (authLoading || !user) {
        if (!authLoading && !user) {
            console.log('DashboardPage: Auth done, no user. Stopping dashboard loading.');
            setDashboardLoading(false);
        }
        return;
      }

      setDashboardLoading(true);
      setDashboardError(null);

      try {
        if (isSupervisor) {
          console.log(`DashboardPage: User is a supervisor (UID: ${user.uid}). Fetching assigned tasks.`);
          const assignedTasks = await getAllTasksAssignedToUser(user.uid);
          console.log('DashboardPage: Supervisor - Fetched assignedTasks:', assignedTasks);

          if (assignedTasks.length > 0) {
            const projectIds = [...new Set(assignedTasks.map(task => task.projectId))];
            console.log('DashboardPage: Supervisor - Extracted projectIds:', projectIds);

            if (projectIds.length > 0) {
              const supervisorProjects = await getProjectsByIds(projectIds);
              console.log('DashboardPage: Supervisor - Fetched supervisorProjects from IDs:', supervisorProjects);
              setProjectsToDisplay(supervisorProjects);
            } else {
              console.log('DashboardPage: Supervisor - No unique project IDs found from tasks.');
              setProjectsToDisplay([]);
            }
          } else {
            console.log('DashboardPage: Supervisor - No tasks assigned to this user.');
            setProjectsToDisplay([]);
          }
        } else if (isAdminOrOwner) {
          console.log(`DashboardPage: User is admin/owner (UID: ${user.uid}). Fetching owned projects.`);
          const ownerProjects = await getUserProjects(user.uid);
          console.log('DashboardPage: Admin/Owner - Fetched ownerProjects:', ownerProjects);
          setProjectsToDisplay(ownerProjects);
        }
      } catch (err: any) {
        console.error("DashboardPage: Error fetching dashboard data:", err);
        setDashboardError("Failed to load dashboard data. " + (err.message || ""));
      } finally {
        console.log('DashboardPage: fetchDashboardData finished. Setting dashboardLoading to false.');
        setDashboardLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, authLoading, isSupervisor, isAdminOrOwner]);
  
  const pageTitle = isSupervisor ? "My Assigned Work" : "My Projects";

  if (authLoading || dashboardLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">Loading dashboard...</p>
      </div>
    );
  }


  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-headline text-3xl font-semibold tracking-tight">{pageTitle}</h1>
        {!isSupervisor && user && ( 
          <Button asChild>
            <Link href="/projects/create">
              <FolderPlus className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </Button>
        )}
      </div>
      {dashboardError && <p className="text-center text-destructive py-4">{dashboardError}</p>}
      {!dashboardError && <ProjectList projects={projectsToDisplay} isSupervisorView={isSupervisor} />}
    </div>
  );
}
    

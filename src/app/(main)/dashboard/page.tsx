
"use client";

import { ProjectList } from '@/components/projects/ProjectList';
import { Button } from '@/components/ui/button';
import { FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import type { Project } from '@/types';
import { getAllTasksAssignedToUser, countProjectSubTasks, countProjectMainTasks } from '@/services/taskService';
import { getAllIssuesAssignedToUser, countProjectOpenIssues } from '@/services/issueService';
import { getProjectsByIds, getUserProjects } from '@/services/projectService';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [projectsToDisplay, setProjectsToDisplay] = useState<Project[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';
  const isAdminOrOwner = user && !isSupervisor && !isMember; 

  useEffect(() => {
    const fetchDashboardData = async () => {
      console.log('DashboardPage: fetchDashboardData called. Auth Loading:', authLoading, 'User:', user ? `${user.displayName || user.email} (Role: ${user.role}, UID: ${user.uid})` : 'null');
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
        let baseProjects: Project[] = [];

        if (isSupervisor || isMember) {
          console.log(`DashboardPage: User is a ${user.role} (UID: ${user.uid}). Fetching assigned tasks and issues.`);
          const assignedTasks = await getAllTasksAssignedToUser(user.uid); 
          console.log(`DashboardPage: ${user.role} - Fetched assignedTasks:`, assignedTasks);
          
          const assignedIssues = await getAllIssuesAssignedToUser(user.uid); 
          console.log(`DashboardPage: ${user.role} - Fetched assignedIssues:`, assignedIssues);

          const projectIdsFromTasks = assignedTasks.map(task => task.projectId).filter(id => !!id);
          const projectIdsFromIssues = assignedIssues.map(issue => issue.projectId).filter(id => !!id);
          
          const allProjectIds = [...new Set([...projectIdsFromTasks, ...projectIdsFromIssues])];
          console.log(`DashboardPage: ${user.role} - Combined unique projectIds from tasks and issues:`, allProjectIds);

          if (allProjectIds.length > 0) {
            baseProjects = await getProjectsByIds(allProjectIds);
            console.log(`DashboardPage: ${user.role} - Fetched baseProjects from combined IDs:`, baseProjects);
          } else {
            console.log(`DashboardPage: ${user.role} - No unique project IDs found from tasks or issues.`);
            baseProjects = [];
          }
        } else if (isAdminOrOwner) { 
          console.log(`DashboardPage: User is admin/owner (UID: ${user.uid}). Fetching owned projects.`);
          baseProjects = await getUserProjects(user.uid);
          console.log('DashboardPage: Admin/Owner - Fetched baseProjects:', baseProjects);
        } else {
          baseProjects = [];
        }

        if (baseProjects.length > 0) {
          console.log('DashboardPage: Base projects found, proceeding to fetch counts for:', baseProjects.map(p => p.id));
          const projectsWithCounts = await Promise.all(
            baseProjects.map(async (project) => {
              console.log(`DashboardPage: Processing project ${project.id} (${project.name}) for counts.`);

              const mainTaskCountPromise = countProjectMainTasks(project.id);
              const subTaskCountPromise = countProjectSubTasks(project.id);
              const openIssueCountPromise = countProjectOpenIssues(project.id);
              
              console.log(`DashboardPage: [Project: ${project.id}] Initiating countProjectMainTasks.`);
              console.log(`DashboardPage: [Project: ${project.id}] Initiating countProjectSubTasks.`);
              console.log(`DashboardPage: [Project: ${project.id}] Initiating countProjectOpenIssues.`);

              const [mainTaskCount, subTaskCount, openIssueCount] = await Promise.all([
                mainTaskCountPromise,
                subTaskCountPromise,
                openIssueCountPromise
              ]);
              
              console.log(`DashboardPage: [Project: ${project.id}] Resolved mainTaskCount: ${mainTaskCount}`);
              console.log(`DashboardPage: [Project: ${project.id}] Resolved subTaskCount: ${subTaskCount}`);
              console.log(`DashboardPage: [Project: ${project.id}] Resolved openIssueCount: ${openIssueCount}`);

              console.log(`DashboardPage: Counts received for project ${project.id}: MainTasks=${mainTaskCount}, SubTasks=${subTaskCount}, OpenIssues=${openIssueCount}`);
              return {
                ...project,
                totalMainTasks: mainTaskCount,
                totalSubTasks: subTaskCount,
                totalOpenIssues: openIssueCount,
              };
            })
          );
          console.log('DashboardPage: Projects with counts:', projectsWithCounts);
          setProjectsToDisplay(projectsWithCounts);
        } else {
          console.log('DashboardPage: No base projects to display or fetch counts for.');
          setProjectsToDisplay([]);
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
  }, [user, authLoading, isSupervisor, isAdminOrOwner, isMember]);

  const pageTitle = isSupervisor ? "My Assigned Work Overview" : (isMember ? "My Assigned Work Overview" : "My Projects");
  const canCreateProject = user && !isSupervisor && !isMember;

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
        {canCreateProject && (
          <Button asChild>
            <Link href="/projects/create">
              <FolderPlus className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </Button>
        )}
      </div>
      {dashboardError && <p className="text-center text-destructive py-4">{dashboardError}</p>}
      {!dashboardError && <ProjectList projects={projectsToDisplay} isSupervisorView={isSupervisor || isMember} />}
    </div>
  );
}

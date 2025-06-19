
"use client";

import { ProjectList } from '@/components/projects/ProjectList';
import { Button } from '@/components/ui/button';
import { FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import type { Project } from '@/types';
import { getAllTasksAssignedToUser } from '@/services/taskService';
import { getAllIssuesAssignedToUser } from '@/services/issueService';
import { getProjectsByIds, getUserProjects } from '@/services/projectService';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [projectsToDisplay, setProjectsToDisplay] = useState<Project[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';
  // AdminOrOwner means not supervisor and not member, and is a logged-in user
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
        if (isSupervisor) {
          console.log(`DashboardPage: User is a supervisor (UID: ${user.uid}). Fetching assigned tasks and issues.`);
          const assignedTasks = await getAllTasksAssignedToUser(user.uid); 
          console.log('DashboardPage: Supervisor - Fetched assignedTasks:', assignedTasks);
          
          const assignedIssues = await getAllIssuesAssignedToUser(user.uid); 
          console.log('DashboardPage: Supervisor - Fetched assignedIssues:', assignedIssues);

          const projectIdsFromTasks = assignedTasks.map(task => task.projectId).filter(id => !!id);
          const projectIdsFromIssues = assignedIssues.map(issue => issue.projectId).filter(id => !!id);
          
          const allProjectIds = [...new Set([...projectIdsFromTasks, ...projectIdsFromIssues])];
          console.log('DashboardPage: Supervisor - Combined unique projectIds from tasks and issues:', allProjectIds);

          if (allProjectIds.length > 0) {
            const supervisorProjects = await getProjectsByIds(allProjectIds);
            console.log('DashboardPage: Supervisor - Fetched supervisorProjects from combined IDs:', supervisorProjects);
            setProjectsToDisplay(supervisorProjects);
          } else {
            console.log('DashboardPage: Supervisor - No unique project IDs found from tasks or issues. Assigned tasks count:', assignedTasks.length, '(Project IDs from tasks:', projectIdsFromTasks, ') Assigned issues count:', assignedIssues.length, '(Project IDs from issues:', projectIdsFromIssues,')');
            setProjectsToDisplay([]);
          }
        } else if (isAdminOrOwner) { // User is admin/owner (not supervisor, not member)
          console.log(`DashboardPage: User is admin/owner (UID: ${user.uid}). Fetching owned projects.`);
          const ownerProjects = await getUserProjects(user.uid);
          console.log('DashboardPage: Admin/Owner - Fetched ownerProjects:', ownerProjects);
          setProjectsToDisplay(ownerProjects);
        } else if (isMember) {
           console.log(`DashboardPage: User is a member (UID: ${user.uid}). Members do not own projects directly. Will check for assigned work.`);
            const assignedTasks = await getAllTasksAssignedToUser(user.uid);
            const assignedIssues = await getAllIssuesAssignedToUser(user.uid);

            const projectIdsFromTasks = assignedTasks.map(task => task.projectId).filter(id => !!id);
            const projectIdsFromIssues = assignedIssues.map(issue => issue.projectId).filter(id => !!id);
            
            const allProjectIds = [...new Set([...projectIdsFromTasks, ...projectIdsFromIssues])];
            if (allProjectIds.length > 0) {
                const memberProjects = await getProjectsByIds(allProjectIds);
                setProjectsToDisplay(memberProjects);
            } else {
                setProjectsToDisplay([]);
            }
        } else {
          // Fallback for any other roles or unhandled states
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

  const pageTitle = isSupervisor ? "My Assigned Work" : (isMember ? "My Assigned Work" : "My Projects");
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

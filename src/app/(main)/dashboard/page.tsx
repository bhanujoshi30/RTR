
"use client";

import { ProjectList } from '@/components/projects/ProjectList';
import { Button } from '@/components/ui/button';
import { FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import type { Project, Task as AppTask } from '@/types'; 
import { getAllTasksAssignedToUser, countProjectSubTasks, countProjectMainTasks } from '@/services/taskService';
import { getAllIssuesAssignedToUser, countProjectOpenIssues } from '@/services/issueService';
import { getProjectsByIds, getUserProjects } from '@/services/projectService';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [projectsToDisplay, setProjectsToDisplay] = useState<Project[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      // Determine roles here as user object might change
      const isSupervisor = user?.role === 'supervisor';
      const isMember = user?.role === 'member';
      const isAdminOrOwner = user && !isSupervisor && !isMember;

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
        let finalProjectsToDisplay: Project[] = [];

        if (isSupervisor || isMember) {
          console.log(`DashboardPage: User is ${user.role} (UID: ${user.uid}). Fetching user-specific work details.`);
          const userAssignedSubTasks = await getAllTasksAssignedToUser(user.uid);
          const userAssignedIssues = await getAllIssuesAssignedToUser(user.uid);
          console.log(`DashboardPage: ${user.role} - Fetched ${userAssignedSubTasks.length} assignedSubTasks.`);
          console.log(`DashboardPage: ${user.role} - Fetched ${userAssignedIssues.length} assignedIssues.`);

          const projectIdsFromTasks = userAssignedSubTasks.map(task => task.projectId).filter(id => !!id);
          const projectIdsFromIssues = userAssignedIssues.map(issue => issue.projectId).filter(id => !!id);
          const allRelevantProjectIds = [...new Set([...projectIdsFromTasks, ...projectIdsFromIssues])];
          console.log(`DashboardPage: ${user.role} - Combined ${allRelevantProjectIds.length} unique projectIds from user's work:`, allRelevantProjectIds);

          if (allRelevantProjectIds.length > 0) {
            const baseProjectsForUser = await getProjectsByIds(allRelevantProjectIds);
            console.log(`DashboardPage: ${user.role} - Fetched ${baseProjectsForUser.length} base projects for user-specific counts.`);

            finalProjectsToDisplay = baseProjectsForUser.map(project => {
              console.log(`DashboardPage: [${user.role} View] Processing project ${project.id} (${project.name}) for user-specific counts.`);

              const assignedSubTasksInThisProject = userAssignedSubTasks.filter(st => st.projectId === project.id);
              const countSubTasksForUser = assignedSubTasksInThisProject.length;
              console.log(`DashboardPage: [${user.role} View][Project: ${project.id}] User-assigned sub-task count: ${countSubTasksForUser}`);

              const countOpenIssuesForUser = userAssignedIssues.filter(i => i.projectId === project.id && i.status === 'Open').length;
              console.log(`DashboardPage: [${user.role} View][Project: ${project.id}] User-assigned open issue count: ${countOpenIssuesForUser}`);
              
              const mainTaskIdsUserInvolvedWith = new Set(
                assignedSubTasksInThisProject.map(st => st.parentId).filter(Boolean) as string[]
              );
              const countMainTasksForUser = mainTaskIdsUserInvolvedWith.size;
              console.log(`DashboardPage: [${user.role} View][Project: ${project.id}] User-involved main task count (via assigned sub-tasks): ${countMainTasksForUser}`);

              return {
                ...project,
                totalMainTasks: countMainTasksForUser,
                totalSubTasks: countSubTasksForUser,
                totalOpenIssues: countOpenIssuesForUser,
              };
            });
          } else {
            console.log(`DashboardPage: ${user.role} - No project IDs found from user's tasks or issues. No projects to display.`);
          }
        } else if (isAdminOrOwner) {
          console.log(`DashboardPage: User is admin/owner (UID: ${user.uid}). Fetching owned projects and project-wide counts.`);
          const baseProjectsAdmin = await getUserProjects(user.uid);
          console.log(`DashboardPage: Admin/Owner - Fetched ${baseProjectsAdmin.length} base projects.`);

          if (baseProjectsAdmin.length > 0) {
            finalProjectsToDisplay = await Promise.all(
              baseProjectsAdmin.map(async (project) => {
                console.log(`DashboardPage: [Admin/Owner View] Processing project ${project.id} (${project.name}) for project-wide counts.`);
                
                const mainTaskCountPromise = countProjectMainTasks(project.id);
                const subTaskCountPromise = countProjectSubTasks(project.id);
                const openIssueCountPromise = countProjectOpenIssues(project.id);

                const [mainTaskCount, subTaskCount, openIssueCount] = await Promise.all([
                  mainTaskCountPromise,
                  subTaskCountPromise,
                  openIssueCountPromise,
                ]);
                
                console.log(`DashboardPage: [Admin/Owner View][Project: ${project.id}] Resolved mainTaskCount: ${mainTaskCount}`);
                console.log(`DashboardPage: [Admin/Owner View][Project: ${project.id}] Resolved subTaskCount: ${subTaskCount}`);
                console.log(`DashboardPage: [Admin/Owner View][Project: ${project.id}] Resolved openIssueCount: ${openIssueCount}`);
                
                return {
                  ...project,
                  totalMainTasks: mainTaskCount,
                  totalSubTasks: subTaskCount,
                  totalOpenIssues: openIssueCount,
                };
              })
            );
          }
        }

        console.log('DashboardPage: Final projectsToDisplay with counts:', finalProjectsToDisplay.length > 0 ? finalProjectsToDisplay : 'None');
        setProjectsToDisplay(finalProjectsToDisplay);

      } catch (err: any) {
        console.error("DashboardPage: Error fetching dashboard data:", err);
        setDashboardError("Failed to load dashboard data. " + (err.message || ""));
      } finally {
        console.log('DashboardPage: fetchDashboardData finished. Setting dashboardLoading to false.');
        setDashboardLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, authLoading]);

  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';
  const pageTitle = (isSupervisor || isMember) ? "My Assigned Work Overview" : "My Projects";
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


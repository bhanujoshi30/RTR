
import type { Project } from '@/types';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, CalendarDays, ExternalLink, ListChecks, AlertTriangle, Layers } from 'lucide-react'; 
import { formatDistanceToNow } from 'date-fns';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'Not Started': return 'bg-gray-500 hover:bg-gray-500';
      case 'In Progress': return 'bg-blue-500 hover:bg-blue-500';
      case 'Completed': return 'bg-green-500 hover:bg-green-500';
      default: return 'bg-primary';
    }
  };
  
  return (
    <Card className="flex h-full transform flex-col shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <FolderKanban className="mb-2 h-8 w-8 text-primary" />
           <Badge variant="secondary" className={`${getStatusColor(project.status)} text-primary-foreground`}>
            {project.status}
          </Badge>
        </div>
        <CardTitle className="font-headline text-xl">
          <Link href={`/projects/${project.id}`} className="hover:underline">
            {project.name}
          </Link>
        </CardTitle>
        {project.description && (
          <CardDescription className="line-clamp-2 h-[40px] overflow-hidden text-ellipsis">
            {project.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-grow space-y-3">
        <div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Progress</span>
            <span>{project.progress}%</span>
          </div>
          <Progress value={project.progress} className="h-2 w-full" aria-label={`Project progress: ${project.progress}%`} />
        </div>
        {(project.totalMainTasks !== undefined || project.totalSubTasks !== undefined || project.totalOpenIssues !== undefined) && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {project.totalMainTasks !== undefined && (
              <div className="flex items-center">
                <Layers className="mr-2 h-4 w-4 text-indigo-600" />
                <span>{project.totalMainTasks} Main Task{project.totalMainTasks !== 1 ? 's' : ''}</span>
              </div>
            )}
            {project.totalSubTasks !== undefined && (
              <div className="flex items-center">
                <ListChecks className="mr-2 h-4 w-4 text-sky-600" />
                <span>{project.totalSubTasks} Sub-task{project.totalSubTasks !== 1 ? 's' : ''}</span>
              </div>
            )}
            {project.totalOpenIssues !== undefined && (
              <div className="flex items-center">
                <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" />
                <span>{project.totalOpenIssues} Open Issue{project.totalOpenIssues !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
         <div className="flex items-center text-xs text-muted-foreground">
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
          Created {project.createdAt ? formatDistanceToNow(project.createdAt, { addSuffix: true }) : 'recently'}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${project.id}`}>
            View Project
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

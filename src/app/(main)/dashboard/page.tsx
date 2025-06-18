import { ProjectList } from '@/components/projects/ProjectList';
import { Button } from '@/components/ui/button';
import { FolderPlus } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-headline text-3xl font-semibold tracking-tight">My Projects</h1>
        <Button asChild>
          <Link href="/projects/create">
            <FolderPlus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>
      <ProjectList />
    </div>
  );
}

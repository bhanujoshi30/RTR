import { ProjectForm } from '@/components/projects/ProjectForm';

export default function CreateProjectPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-8 font-headline text-3xl font-semibold tracking-tight">Create New Project</h1>
      <ProjectForm />
    </div>
  );
}

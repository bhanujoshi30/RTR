
"use client";

import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileDown, BarChart2, ClipboardList, AlertCircle, CheckCircle, Users, Image as ImageIcon } from 'lucide-react';
import type { Project, DprData, DprSummary } from '@/types';
import { getUserProjects } from '@/services/projectService';
import { getDprData } from '@/services/dprService';
import { generateDpr } from '@/ai/flows/generate-dpr-flow';
import { format, startOfDay } from 'date-fns';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import Image from 'next/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from '@/hooks/use-toast';


const StatsChart = ({ data }: { data: any[] }) => (
    <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
              cursor={{ fill: 'hsl(var(--muted))' }}
            />
            <Bar dataKey="Tasks" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Issues" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
        </BarChart>
    </ResponsiveContainer>
);

export default function DprPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    // State for controls
    const [projects, setProjects] = useState<Project[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [selectedDate] = useState<Date>(startOfDay(new Date())); // Date is fixed to today

    // State for report
    const [reportData, setReportData] = useState<DprSummary | null>(null);
    const [rawReportData, setRawReportData] = useState<DprData | null>(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State for PDF export
    const [isExporting, setIsExporting] = useState(false);
    const reportContentRef = useRef<HTMLDivElement>(null);

    const isAdmin = useMemo(() => user?.role === 'admin', [user]);

    // Permissions check
    useEffect(() => {
        if (!authLoading && !isAdmin) {
            router.push('/dashboard');
        }
    }, [user, authLoading, router, isAdmin]);

    // Fetch projects for the dropdown
    useEffect(() => {
        if (!isAdmin || !user) return;
        const fetchProjects = async () => {
            setLoadingProjects(true);
            try {
                const fetchedProjects = await getUserProjects(user.uid);
                setProjects(fetchedProjects);
            } catch (err) {
                setError("Failed to load projects.");
                console.error(err);
            } finally {
                setLoadingProjects(false);
            }
        };
        fetchProjects();
    }, [isAdmin, user]);

    const handleGenerateReport = async () => {
        if (!selectedProjectId) {
            setError("Please select a project.");
            return;
        }
        setLoadingReport(true);
        setError(null);
        setReportData(null);
        setRawReportData(null);
        try {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            const rawData = await getDprData(selectedProjectId, dateString);
            setRawReportData(rawData);
            
            if (!rawData) {
                 throw new Error("Could not retrieve the daily data for the report.");
            }

            const summary = await generateDpr(rawData);
            setReportData(summary);
        } catch (err: any) {
            setError(err.message || "An unknown error occurred while generating the report.");
            console.error(err);
        } finally {
            setLoadingReport(false);
        }
    };
    
    const handleExportPdf = async () => {
        if (!reportContentRef.current || !reportData || !rawReportData) {
            toast({
                title: "Cannot Export",
                description: "No report content is available to export.",
                variant: "destructive",
            });
            return;
        }
    
        setIsExporting(true);
        toast({ title: "Preparing PDF...", description: "This may take a moment." });
    
        try {
            const canvas = await html2canvas(reportContentRef.current, {
                scale: 2,
                useCORS: true, 
                backgroundColor: '#F0F4F7', // Use light theme background for consistency
            });
            
            const imgData = canvas.toDataURL('image/png');
            
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });
    
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;
            
            let imgWidth = pdfWidth - 20; // with 10mm margin on each side
            let imgHeight = imgWidth / ratio;
            
            if (imgHeight > pdfHeight - 20) {
                imgHeight = pdfHeight - 20; // with 10mm margin
                imgWidth = imgHeight * ratio;
            }
            
            const x = (pdfWidth - imgWidth) / 2;
            const y = 10;
    
            pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
            
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            pdf.save(`DPR_${rawReportData.projectName.replace(/\s/g, '_')}_${dateString}.pdf`);
            
        } catch (error) {
            console.error("Failed to export PDF:", error);
            toast({
                title: "Export Failed",
                description: "An error occurred while creating the PDF.",
                variant: "destructive"
            });
        } finally {
            setIsExporting(false);
        }
    };

    const chartData = useMemo(() => {
        if (!rawReportData) return [];
        return [
            { name: 'Created', Tasks: rawReportData.tasksCreated.length, Issues: rawReportData.issuesOpened.length },
            { name: 'Completed', Tasks: rawReportData.tasksCompleted.length, Issues: rawReportData.issuesClosed.length },
        ];
    }, [rawReportData]);


    if (authLoading || !isAdmin) {
        return (
            <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                    <h1 className="font-headline text-3xl font-semibold tracking-tight flex items-center">
                        <ClipboardList className="mr-3 h-8 w-8 text-primary" />
                        Daily Progress Report (DPR)
                    </h1>
                     <p className="text-muted-foreground mt-1">
                        Report for Today: {format(selectedDate, 'PPP')}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Report Controls</CardTitle>
                    <CardDescription>Select a project to generate today's progress report.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="flex-grow w-full sm:w-auto">
                        <Select onValueChange={setSelectedProjectId} disabled={loadingProjects}>
                            <SelectTrigger>
                                <SelectValue placeholder={loadingProjects ? "Loading projects..." : "Select a project"} />
                            </SelectTrigger>
                            <SelectContent>
                                {projects.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button onClick={handleGenerateReport} disabled={!selectedProjectId || loadingReport} className="flex-1 sm:flex-none">
                            {loadingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Generate Report
                        </Button>
                        <Button onClick={handleExportPdf} disabled={!reportData || isExporting} variant="outline" className="flex-1 sm:flex-none">
                             {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                            Export PDF
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {error && <p className="text-center text-destructive py-4">{error}</p>}
            
            {loadingReport && (
                 <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-12 text-center shadow-sm">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <h3 className="mt-4 font-headline text-xl font-semibold">Generating Report...</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Collecting data and preparing your summary. This may take a moment.
                    </p>
                </div>
            )}
            
            {reportData && rawReportData && (
                <div ref={reportContentRef}>
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>AI-Generated Summary for {rawReportData.projectName} on {format(selectedDate, 'PPP')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <h4 className="font-semibold text-lg mb-1">Executive Summary</h4>
                                    <p className="text-muted-foreground whitespace-pre-wrap">{reportData.executiveSummary}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-lg mb-1">Key Achievements</h4>
                                    <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                                        {reportData.keyAchievements.map((item, i) => <li key={i}>{item}</li>)}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-lg mb-1">New Issues & Blockers</h4>
                                     <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                                        {reportData.newIssues.length > 0 ? reportData.newIssues.map((item, i) => <li key={i}>{item}</li>) : <li>No new issues or blockers reported.</li>}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-lg mb-1">Outlook</h4>
                                    <p className="text-muted-foreground whitespace-pre-wrap">{reportData.outlook}</p>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5" /> Daily Stats</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <StatsChart data={chartData} />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Team Attendance ({rawReportData.teamAttendance.present.length} / {rawReportData.teamAttendance.total})</CardTitle>
                                    <CardDescription>{reportData.attendanceSummary}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                     <h4 className="font-semibold mb-2">Present</h4>
                                     {rawReportData.teamAttendance.present.length > 0 ? (
                                        <ul className="list-disc pl-5 text-sm text-muted-foreground">
                                            {rawReportData.teamAttendance.present.map(u => <li key={u.uid}>{u.name}</li>)}
                                        </ul>
                                     ) : <p className="text-sm text-muted-foreground">No team members were present.</p>}

                                     <h4 className="font-semibold mb-2 mt-4">Absent</h4>
                                     {rawReportData.teamAttendance.absent.length > 0 ? (
                                        <ul className="list-disc pl-5 text-sm text-muted-foreground">
                                            {rawReportData.teamAttendance.absent.map(u => <li key={u.uid}>{u.name}</li>)}
                                        </ul>
                                     ) : <p className="text-sm text-muted-foreground">All assigned team members were present.</p>}
                                </CardContent>
                            </Card>
                        </div>

                         <Card>
                            <CardHeader>
                                <CardTitle>Activity Feed</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                 <div>
                                    <h4 className="font-semibold text-lg mb-2 flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /> Completed Today</h4>
                                    {rawReportData.tasksCompleted.length > 0 || rawReportData.issuesClosed.length > 0 ? (
                                        <ul className="list-disc pl-5 text-sm text-muted-foreground">
                                            {rawReportData.tasksCompleted.map(t => <li key={t.id}>{t.name}</li>)}
                                            {rawReportData.issuesClosed.map(i => <li key={i.id}>Closed Issue: {i.title}</li>)}
                                        </ul>
                                    ) : <p className="text-sm text-muted-foreground">No tasks or issues were completed today.</p>}
                                </div>
                                 <div>
                                    <h4 className="font-semibold text-lg mb-2 flex items-center gap-2"><AlertCircle className="h-5 w-5 text-amber-500" /> Opened Today</h4>
                                    {rawReportData.tasksCreated.length > 0 || rawReportData.issuesOpened.length > 0 ? (
                                        <ul className="list-disc pl-5 text-sm text-muted-foreground">
                                            {rawReportData.tasksCreated.map(t => <li key={t.id}>{t.name}</li>)}
                                            {rawReportData.issuesOpened.map(i => <li key={i.id}>New Issue: {i.title} ({i.severity})</li>)}
                                        </ul>
                                    ) : <p className="text-sm text-muted-foreground">No new tasks or issues were opened today.</p>}
                                </div>
                                 <div>
                                    <h4 className="font-semibold text-lg mb-2 flex items-center gap-2"><ImageIcon className="h-5 w-5 text-sky-500" /> New Attachments</h4>
                                    {rawReportData.attachments.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                            {rawReportData.attachments.map(att => (
                                                <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded border overflow-hidden group">
                                                    <Image src={att.url} alt={att.filename} layout="fill" objectFit="cover" className="transition-transform group-hover:scale-105" />
                                                    <div className="absolute inset-x-0 bottom-0 p-1.5 text-xs text-white bg-black/50 truncate">
                                                        {att.filename}
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    ) : <p className="text-sm text-muted-foreground">No photos were attached today.</p>}
                                </div>
                            </CardContent>
                         </Card>
                    </div>
                </div>
            )}
        </div>
    );
}

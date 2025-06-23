
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { DprData, DprSummary } from '@/types';

const DprDataSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  date: z.string(),
  tasksCreated: z.array(z.object({ id: z.string(), name: z.string(), parentId: z.string().nullable() })),
  tasksCompleted: z.array(z.object({ id: z.string(), name: z.string(), parentId: z.string().nullable() })),
  issuesOpened: z.array(z.object({ id: z.string(), title: z.string(), severity: z.string() })),
  issuesClosed: z.array(z.object({ id: z.string(), title: z.string() })),
  teamAttendance: z.object({
    present: z.array(z.object({ uid: z.string(), name: z.string() })),
    absent: z.array(z.object({ uid: z.string(), name: z.string() })),
    total: z.number(),
  }),
  attachments: z.array(z.object({ id: z.string(), url: z.string(), filename: z.string(), ownerName: z.string() })),
  timelineEvents: z.array(z.object({
    description: z.string().describe("A single event that occurred during the day, e.g., 'created the sub-task', 'changed status to In Progress'."),
    authorName: z.string().describe("The name of the user who performed the action."),
  })).describe("A detailed, chronological log of all activities that happened today."),
});

const DprSummarySchema = z.object({
  executiveSummary: z.string().describe('A 2-3 sentence high-level overview of the day\'s progress.'),
  keyAchievements: z.array(z.string()).describe('A bulleted list of the most important accomplishments.'),
  newIssues: z.array(z.string()).describe('A bulleted list of newly raised issues or blockers, if any.'),
  attendanceSummary: z.string().describe('A brief, one-sentence summary of the team\'s attendance.'),
  outlook: z.string().describe('A forward-looking statement about the next steps or focus for the following day.'),
});

const dprPrompt = ai.definePrompt({
    name: 'dprPrompt',
    input: { schema: DprDataSchema },
    output: { schema: DprSummarySchema },
    prompt: `
        You are a senior project manager responsible for writing a Daily Progress Report (DPR) for project stakeholders.
        Analyze the following raw data for the project "{{projectName}}" on {{date}} and generate a clear, concise, and professional summary.

        ## Raw Data:

        ### Detailed Activity Log (Chronological)
        {{#if timelineEvents}}
            {{#each timelineEvents}}
                - **{{this.authorName}}** {{this.description}}
            {{/each}}
        {{else}}
            - No specific activities were recorded in the timeline today.
        {{/if}}

        ### Tasks Summary
        - New Tasks Created: {{tasksCreated.length}}
        - Tasks Completed: {{tasksCompleted.length}}
        
        ### Issues Summary
        - New Issues Opened: {{issuesOpened.length}}
        - Issues Closed: {{issuesClosed.length}}
        
        ### Team Attendance
        - Total Assigned Members: {{teamAttendance.total}}
        - Present: {{teamAttendance.present.length}}
        - Absent: {{teamAttendance.absent.length}}
        - Names of Absent Members:
        {{#if teamAttendance.absent}}
            {{#each teamAttendance.absent}}
                - {{this.name}}
            {{/each}}
        {{else}}
            None
        {{/if}}

        ### Attachments / Photos
        - New Attachments: {{attachments.length}}
        
        ## Instructions:
        Based on the data above, generate the following report components. Pay close attention to the Detailed Activity Log for nuanced insights into the day's progress, not just the summary counts.

        1.  **executiveSummary**: A high-level overview of the day. Mention if it was productive, if there were significant accomplishments or new blockers. Use the activity log to understand the flow of work.
        2.  **keyAchievements**: Identify the most significant completed tasks or closed issues from the activity log. If nothing was completed, state that focus was on ongoing work, referencing any status changes from the log.
        3.  **newIssues**: List any new issues, especially critical ones. If there are none, state that no new blockers were reported.
        4.  **attendanceSummary**: Briefly describe the team's presence. For example, "Full team was present," or "Most of the team was present, with 2 members absent."
        5.  **outlook**: State the main focus for the next working day based on today's activities and any new tasks or issues.
    `,
});

const generateDprFlow = ai.defineFlow(
  {
    name: 'generateDprFlow',
    inputSchema: DprDataSchema,
    outputSchema: DprSummarySchema,
  },
  async (input) => {
    const { output } = await dprPrompt(input);
    if (!output) {
      throw new Error('AI failed to generate a DPR summary.');
    }
    return output;
  }
);

export async function generateDpr(input: DprData): Promise<DprSummary> {
    return await generateDprFlow(input);
}

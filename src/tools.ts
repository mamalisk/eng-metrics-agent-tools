import * as vscode from 'vscode';
import { getAgileClient } from './jiraClient';
import { getSnowflakeConnection, executeStatement } from './snowflakeClient';

export function registerMetricsTools(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.lm.registerTool('eng-metrics_getPRStats', new GetPRStatsTool()),
		vscode.lm.registerTool('eng-metrics_getSprintCycleTime', new GetSprintCycleTimeTool()),
		vscode.lm.registerTool('eng-metrics_storeSprintData', new StoreSprintDataTool()),
	);
}

// ---------------------------------------------------------------------------
// GitHub PR Stats Tool
// ---------------------------------------------------------------------------

interface IGetPRStatsParameters {
	owner: string;
	repo: string;
}

export class GetPRStatsTool implements vscode.LanguageModelTool<IGetPRStatsParameters> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IGetPRStatsParameters>,
		token: vscode.CancellationToken
	) {
		const { owner, repo } = options.input;

		const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
		if (!session) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart('Could not authenticate with GitHub. Please sign in.'),
			]);
		}

		try {
			const headers = {
				Authorization: `Bearer ${session.accessToken}`,
				Accept: 'application/vnd.github+json',
				'User-Agent': 'eng-metrics-copilot',
			};

			const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=closed&per_page=30&sort=updated&direction=desc`;
			const response = await fetch(url, { headers, signal: token as unknown as AbortSignal });

			if (!response.ok) {
				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(`GitHub API error: ${response.status} ${response.statusText}`),
				]);
			}

			const prs = (await response.json()) as Array<{
				number: number;
				title: string;
				created_at: string;
				merged_at: string | null;
				closed_at: string | null;
				user: { login: string };
			}>;

			const mergedPRs = prs.filter((pr) => pr.merged_at);

			const cycleTimes = mergedPRs.map((pr) => {
				const created = new Date(pr.created_at).getTime();
				const merged = new Date(pr.merged_at!).getTime();
				return (merged - created) / (1000 * 60 * 60);
			});

			const avgCycleTime = cycleTimes.length > 0
				? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
				: 0;

			const summary = [
				`## PR Statistics for ${owner}/${repo}`,
				``,
				`- **Total PRs fetched (recent closed):** ${prs.length}`,
				`- **Merged PRs:** ${mergedPRs.length}`,
				`- **Average cycle time (open → merge):** ${avgCycleTime.toFixed(1)} hours`,
				``,
				`### Recent Merged PRs`,
				...mergedPRs.slice(0, 10).map((pr) => {
					const hours = ((new Date(pr.merged_at!).getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60)).toFixed(1);
					return `- #${pr.number} "${pr.title}" by @${pr.user.login} — ${hours}h cycle time`;
				}),
			].join('\n');

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(summary),
			]);
		} catch (err) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`Error fetching PR stats: ${(err as Error).message}`),
			]);
		}
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<IGetPRStatsParameters>,
		_token: vscode.CancellationToken
	) {
		return {
			invocationMessage: `Fetching PR stats for ${options.input.owner}/${options.input.repo}`,
			confirmationMessages: {
				title: 'Fetch PR Statistics',
				message: new vscode.MarkdownString(
					`Fetch pull request statistics from GitHub for **${options.input.owner}/${options.input.repo}**?`
				),
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Jira Sprint Cycle Time Tool
// ---------------------------------------------------------------------------

interface IGetSprintCycleTimeParameters {
	boardId: number;
	sprintId?: number;
}

interface JiraIssueBean {
	key: string;
	fields: {
		summary: string;
		status: { name: string };
		assignee?: { displayName: string } | null;
		created: string;
		resolutiondate?: string | null;
		statuscategorychangedate?: string | null;
	};
}

export class GetSprintCycleTimeTool implements vscode.LanguageModelTool<IGetSprintCycleTimeParameters> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IGetSprintCycleTimeParameters>,
		_token: vscode.CancellationToken
	) {
		const { boardId, sprintId } = options.input;

		let client;
		try {
			client = getAgileClient();
		} catch (err) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart((err as Error).message),
			]);
		}

		try {
			// If no sprintId provided, find the active sprint for this board
			let resolvedSprintId = sprintId;
			let sprintName = '';

			if (!resolvedSprintId) {
				const sprints = await client.board.getAllSprints({
					boardId,
					state: 'active',
				});

				const activeSprint = sprints.values?.[0];
				if (!activeSprint) {
					return new vscode.LanguageModelToolResult([
						new vscode.LanguageModelTextPart(`No active sprint found for board ${boardId}. Try providing a specific sprintId.`),
					]);
				}
				resolvedSprintId = activeSprint.id;
				sprintName = activeSprint.name ?? `Sprint ${activeSprint.id}`;
			}

			// Fetch issues in the sprint
			const sprintIssues = await client.board.getBoardIssuesForSprint({
				boardId,
				sprintId: resolvedSprintId,
				fields: ['summary', 'status', 'assignee', 'created', 'resolutiondate', 'statuscategorychangedate'],
				maxResults: 100,
			}) as { issues?: JiraIssueBean[] };

			const issues = sprintIssues.issues ?? [];

			if (!sprintName && issues.length > 0) {
				sprintName = `Sprint ${resolvedSprintId}`;
			}

			// Calculate cycle time for resolved issues
			// Cycle time = time from status category change (In Progress) to resolution
			// Fallback: created → resolutiondate
			const resolvedIssues = issues.filter(
				(issue) => issue.fields.resolutiondate
			);

			const cycleTimesHours: { key: string; summary: string; assignee: string; hours: number }[] = [];

			for (const issue of resolvedIssues) {
				const endTime = new Date(issue.fields.resolutiondate!).getTime();
				// Prefer statuscategorychangedate as a proxy for when work started
				const startTime = issue.fields.statuscategorychangedate
					? new Date(issue.fields.statuscategorychangedate).getTime()
					: new Date(issue.fields.created).getTime();

				const hours = (endTime - startTime) / (1000 * 60 * 60);
				if (hours > 0) {
					cycleTimesHours.push({
						key: issue.key,
						summary: issue.fields.summary,
						assignee: issue.fields.assignee?.displayName ?? 'Unassigned',
						hours,
					});
				}
			}

			const avgHours = cycleTimesHours.length > 0
				? cycleTimesHours.reduce((sum, i) => sum + i.hours, 0) / cycleTimesHours.length
				: 0;
			const minHours = cycleTimesHours.length > 0
				? Math.min(...cycleTimesHours.map((i) => i.hours))
				: 0;
			const maxHours = cycleTimesHours.length > 0
				? Math.max(...cycleTimesHours.map((i) => i.hours))
				: 0;

			const formatHours = (h: number) => {
				if (h < 24) { return `${h.toFixed(1)}h`; }
				return `${(h / 24).toFixed(1)}d`;
			};

			const summary = [
				`## Sprint Cycle Time — ${sprintName}`,
				``,
				`- **Total issues in sprint:** ${issues.length}`,
				`- **Resolved issues:** ${resolvedIssues.length}`,
				`- **Average cycle time:** ${formatHours(avgHours)}`,
				`- **Min cycle time:** ${formatHours(minHours)}`,
				`- **Max cycle time:** ${formatHours(maxHours)}`,
				``,
				`### Resolved Issues`,
				...cycleTimesHours
					.sort((a, b) => b.hours - a.hours)
					.map((i) => `- ${i.key} "${i.summary}" (${i.assignee}) — ${formatHours(i.hours)}`),
			].join('\n');

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(summary),
			]);
		} catch (err) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`Error fetching Jira sprint data: ${(err as Error).message}`),
			]);
		}
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<IGetSprintCycleTimeParameters>,
		_token: vscode.CancellationToken
	) {
		const label = options.input.sprintId
			? `board ${options.input.boardId}, sprint ${options.input.sprintId}`
			: `board ${options.input.boardId} (active sprint)`;

		return {
			invocationMessage: `Fetching sprint cycle time for ${label}`,
			confirmationMessages: {
				title: 'Fetch Jira Sprint Cycle Time',
				message: new vscode.MarkdownString(
					`Fetch sprint cycle time metrics from Jira for **${label}**?`
				),
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Store Sprint Data to Snowflake Tool
// ---------------------------------------------------------------------------

interface IStoreSprintDataParameters {
	boardId: number;
	sprintId?: number;
	tableName?: string;
}

const DEFAULT_TABLE_NAME = 'SPRINT_CYCLE_TIME';

export class StoreSprintDataTool implements vscode.LanguageModelTool<IStoreSprintDataParameters> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IStoreSprintDataParameters>,
		_token: vscode.CancellationToken
	) {
		const { boardId, sprintId, tableName = DEFAULT_TABLE_NAME } = options.input;

		// --- 1. Fetch sprint data from Jira ---
		let client;
		try {
			client = getAgileClient();
		} catch (err) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart((err as Error).message),
			]);
		}

		try {
			let resolvedSprintId = sprintId;
			let sprintName = '';

			if (!resolvedSprintId) {
				const sprints = await client.board.getAllSprints({
					boardId,
					state: 'active',
				});

				const activeSprint = sprints.values?.[0];
				if (!activeSprint) {
					return new vscode.LanguageModelToolResult([
						new vscode.LanguageModelTextPart(`No active sprint found for board ${boardId}. Try providing a specific sprintId.`),
					]);
				}
				resolvedSprintId = activeSprint.id;
				sprintName = activeSprint.name ?? `Sprint ${activeSprint.id}`;
			} else {
				sprintName = `Sprint ${resolvedSprintId}`;
			}

			const sprintIssues = await client.board.getBoardIssuesForSprint({
				boardId,
				sprintId: resolvedSprintId,
				fields: ['summary', 'status', 'assignee', 'created', 'resolutiondate', 'statuscategorychangedate'],
				maxResults: 100,
			}) as { issues?: JiraIssueBean[] };

			const issues = sprintIssues.issues ?? [];

			const resolvedIssues = issues.filter(
				(issue) => issue.fields.resolutiondate
			);

			if (resolvedIssues.length === 0) {
				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(`No resolved issues found in ${sprintName} (board ${boardId}). Nothing to store.`),
				]);
			}

			// --- 2. Connect to Snowflake ---
			const connection = await getSnowflakeConnection();

			try {
				// --- 3. Create table if it doesn't exist ---
				await executeStatement(connection, `
					CREATE TABLE IF NOT EXISTS ${tableName} (
						sprint_id INTEGER,
						sprint_name VARCHAR(500),
						issue_key VARCHAR(50),
						summary VARCHAR(2000),
						assignee VARCHAR(500),
						cycle_time_hours FLOAT,
						resolution_date TIMESTAMP_NTZ,
						stored_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
					)
				`);

				// --- 4. Insert resolved issues ---
				let rowsInserted = 0;
				for (const issue of resolvedIssues) {
					const endTime = new Date(issue.fields.resolutiondate!).getTime();
					const startTime = issue.fields.statuscategorychangedate
						? new Date(issue.fields.statuscategorychangedate).getTime()
						: new Date(issue.fields.created).getTime();

					const hours = (endTime - startTime) / (1000 * 60 * 60);
					if (hours <= 0) { continue; }

					await executeStatement(
						connection,
						`INSERT INTO ${tableName} (sprint_id, sprint_name, issue_key, summary, assignee, cycle_time_hours, resolution_date)
						 VALUES (?, ?, ?, ?, ?, ?, ?)`,
						[
							resolvedSprintId,
							sprintName,
							issue.key,
							issue.fields.summary,
							issue.fields.assignee?.displayName ?? 'Unassigned',
							hours,
							issue.fields.resolutiondate!,
						]
					);
					rowsInserted++;
				}

				// --- 5. Return summary ---
				const summary = [
					`## Sprint Data Stored to Snowflake`,
					``,
					`- **Sprint:** ${sprintName} (ID: ${resolvedSprintId})`,
					`- **Board:** ${boardId}`,
					`- **Table:** ${tableName}`,
					`- **Rows inserted:** ${rowsInserted}`,
				].join('\n');

				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(summary),
				]);
			} finally {
				connection.destroy(() => {});
			}
		} catch (err) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`Error storing sprint data to Snowflake: ${(err as Error).message}`),
			]);
		}
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<IStoreSprintDataParameters>,
		_token: vscode.CancellationToken
	) {
		const sprintLabel = options.input.sprintId
			? `board ${options.input.boardId}, sprint ${options.input.sprintId}`
			: `board ${options.input.boardId} (active sprint)`;
		const table = options.input.tableName ?? DEFAULT_TABLE_NAME;

		return {
			invocationMessage: `Storing sprint data from ${sprintLabel} into Snowflake table ${table}`,
			confirmationMessages: {
				title: 'Store Sprint Data to Snowflake',
				message: new vscode.MarkdownString(
					`Fetch sprint data from Jira (**${sprintLabel}**) and store it in Snowflake table **${table}**?`
				),
			},
		};
	}
}

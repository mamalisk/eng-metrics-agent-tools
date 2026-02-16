import * as vscode from 'vscode';
import { AgileClient } from 'jira.js';

function getJiraConfig() {
	const config = vscode.workspace.getConfiguration('engMetrics.jira');
	const host = config.get<string>('host', '');
	const email = config.get<string>('email', '');
	const apiToken = config.get<string>('apiToken', '');

	if (!host) {
		throw new Error('Jira host is not configured. Set "engMetrics.jira.host" in VS Code settings.');
	}
	if (!email) {
		throw new Error('Jira email is not configured. Set "engMetrics.jira.email" in VS Code settings.');
	}
	if (!apiToken) {
		throw new Error('Jira API token is not configured. Set "engMetrics.jira.apiToken" in VS Code settings.');
	}

	return { host, email, apiToken };
}

export function getAgileClient(): AgileClient {
	const { host, email, apiToken } = getJiraConfig();
	return new AgileClient({
		host,
		authentication: {
			basic: {
				email,
				apiToken,
			},
		},
	});
}

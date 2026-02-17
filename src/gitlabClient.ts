import * as vscode from 'vscode';
import { Gitlab } from '@gitbeaker/rest';

function getGitLabConfig() {
	const config = vscode.workspace.getConfiguration('engMetrics.gitlab');
	const host = config.get<string>('host', '');
	const token = config.get<string>('token', '');

	if (!host) {
		throw new Error('GitLab host is not configured. Set "engMetrics.gitlab.host" in VS Code settings.');
	}
	if (!token) {
		throw new Error('GitLab token is not configured. Set "engMetrics.gitlab.token" in VS Code settings.');
	}

	return { host, token };
}

export function getGitLabClient(): InstanceType<typeof Gitlab> {
	const { host, token } = getGitLabConfig();
	console.log(`[eng-metrics] GitLab client: host=${host}, token=${token ? token.substring(0, 4) + '...' : '(empty)'}`);
	return new Gitlab({ host, token });
}

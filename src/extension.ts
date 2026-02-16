import * as vscode from 'vscode';
import { registerMetricsParticipant } from './metricsParticipant';
import { registerMetricsTools } from './tools';

export function activate(context: vscode.ExtensionContext) {
	registerMetricsParticipant(context);
	registerMetricsTools(context);
}

export function deactivate() { }

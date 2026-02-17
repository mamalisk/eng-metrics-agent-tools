import * as vscode from 'vscode';

const PARTICIPANT_ID = 'eng-metrics.metrics';

interface IMetricsChatResult extends vscode.ChatResult {
	metadata: {
		command: string;
	};
}

export function registerMetricsParticipant(context: vscode.ExtensionContext) {
	const handler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		chatContext: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<IMetricsChatResult> => {

		if (request.command === 'prCycleTime') {
			stream.progress('Fetching PR cycle time metrics...');
			try {
				const messages = [
					vscode.LanguageModelChatMessage.User(
						'You are an engineering metrics assistant. Your job is to help teams understand their pull request cycle time — the time from PR creation to merge. You also have access to Jira sprint cycle time data (time from In Progress to Done for stories in a sprint). Provide actionable insights and suggest improvements when cycle times are high.'
					),
					vscode.LanguageModelChatMessage.User(
						request.prompt || 'Give me a summary of what PR cycle time is, why it matters, and how to improve it.'
					),
				];

				const chatResponse = await request.model.sendRequest(messages, {}, token);
				for await (const fragment of chatResponse.text) {
					stream.markdown(fragment);
				}
			} catch (err) {
				handleError(logger, err, stream);
			}

			logger.logUsage('request', { kind: 'prCycleTime' });
			return { metadata: { command: 'prCycleTime' } };

		} else if (request.command === 'reviewThroughput') {
			stream.progress('Analyzing review throughput...');
			try {
				const messages = [
					vscode.LanguageModelChatMessage.User(
						'You are an engineering metrics assistant specializing in code review throughput. Help teams understand how many reviews are happening, who the top reviewers are, and whether reviews are a bottleneck.'
					),
					vscode.LanguageModelChatMessage.User(
						request.prompt || 'Explain code review throughput metrics and how to measure them.'
					),
				];

				const chatResponse = await request.model.sendRequest(messages, {}, token);
				for await (const fragment of chatResponse.text) {
					stream.markdown(fragment);
				}
			} catch (err) {
				handleError(logger, err, stream);
			}

			logger.logUsage('request', { kind: 'reviewThroughput' });
			return { metadata: { command: 'reviewThroughput' } };

		} else if (request.command === 'deployFrequency') {
			stream.progress('Checking deployment frequency...');
			try {
				const messages = [
					vscode.LanguageModelChatMessage.User(
						'You are an engineering metrics assistant specializing in deployment frequency — a key DORA metric. Help teams understand how often they deploy, and how to increase deployment frequency safely.'
					),
					vscode.LanguageModelChatMessage.User(
						request.prompt || 'Explain deployment frequency as a DORA metric and how to improve it.'
					),
				];

				const chatResponse = await request.model.sendRequest(messages, {}, token);
				for await (const fragment of chatResponse.text) {
					stream.markdown(fragment);
				}
			} catch (err) {
				handleError(logger, err, stream);
			}

			logger.logUsage('request', { kind: 'deployFrequency' });
			return { metadata: { command: 'deployFrequency' } };

		} else {
			// Default: general engineering metrics question
			try {
				const messages = [
					vscode.LanguageModelChatMessage.User(
						`You are an engineering metrics assistant. You help software teams understand and improve their engineering metrics including:
- PR cycle time (time from PR open to merge)
- Jira sprint cycle time (time from In Progress to Done for stories in a sprint)
- Code review throughput (reviews per week, reviewer load)
- Deployment frequency (how often code ships to production)
- DORA metrics (lead time, deployment frequency, change failure rate, MTTR)
- Developer productivity signals

You have tools available to fetch real data from GitHub (PR stats), GitLab (MR stats and comments), and Jira (sprint cycle time), and to store sprint data into Snowflake for historical tracking. Provide data-driven, actionable advice.`
					),
					vscode.LanguageModelChatMessage.User(request.prompt),
				];

				const chatResponse = await request.model.sendRequest(messages, {}, token);
				for await (const fragment of chatResponse.text) {
					stream.markdown(fragment);
				}
			} catch (err) {
				handleError(logger, err, stream);
			}

			logger.logUsage('request', { kind: '' });
			return { metadata: { command: '' } };
		}
	};

	const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
	participant.iconPath = new vscode.ThemeIcon('graph');
	participant.followupProvider = {
		provideFollowups(
			_result: IMetricsChatResult,
			_context: vscode.ChatContext,
			_token: vscode.CancellationToken
		) {
			return [
				{
					prompt: 'What are the key DORA metrics I should track?',
					label: vscode.l10n.t('DORA Metrics Overview'),
					command: '',
				} satisfies vscode.ChatFollowup,
			];
		},
	};

	const logger = vscode.env.createTelemetryLogger({
		sendEventData(eventName, data) {
			console.log(`Event: ${eventName}`);
			console.log(`Data: ${JSON.stringify(data)}`);
		},
		sendErrorData(error, data) {
			console.error(`Error: ${error}`);
			console.error(`Data: ${JSON.stringify(data)}`);
		},
	});

	context.subscriptions.push(
		participant,
		participant.onDidReceiveFeedback((feedback: vscode.ChatResultFeedback) => {
			logger.logUsage('chatResultFeedback', {
				kind: feedback.kind,
			});
		})
	);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleError(logger: vscode.TelemetryLogger, err: any, stream: vscode.ChatResponseStream): void {
	logger.logError(err);

	if (err instanceof vscode.LanguageModelError) {
		console.log(err.message, err.code, err.cause);
		if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
			stream.markdown(vscode.l10n.t('I\'m sorry, I can only help with engineering metrics questions.'));
		}
	} else {
		throw err;
	}
}

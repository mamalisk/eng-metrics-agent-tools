# Engineering Metrics - Copilot Chat Extension

A VS Code extension that adds a GitHub Copilot Chat participant (`@metrics`) for engineering metrics. It provides conversational access to PR cycle time, MR cycle time, code review throughput, deployment frequency, and Jira sprint cycle time — backed by tools that fetch real data from GitHub, GitLab, and Jira, and optionally store it in Snowflake.

## Architecture

The extension has two layers:

- **Chat Participant** (`@metrics`) — registered in `src/metricsParticipant.ts`. Handles conversational commands and provides the AI system prompt. This is what users interact with in Copilot Chat.
- **Language Model Tools** — registered in `src/tools.ts`. These are callable by the language model when it needs real data. Users don't invoke them directly; the model decides when to call them based on the conversation.

```
src/
  extension.ts          # Entry point — registers participant + tools
  metricsParticipant.ts # Chat participant handler (@metrics)
  tools.ts              # Tool implementations (GitHub, GitLab, Jira, Snowflake)
  gitlabClient.ts       # GitLab API client helper
  jiraClient.ts         # Jira API client helper
  snowflakeClient.ts    # Snowflake connection helper
```

## Prerequisites

- VS Code 1.100.0 or later
- GitHub Copilot Chat extension installed and active
- Node.js 18+

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd eng-metrics-tools

# Install dependencies
npm install

# Compile
npm run compile
```

To run in development mode, press **F5** in VS Code. This opens an Extension Development Host window with the extension loaded.

## Usage

Open GitHub Copilot Chat in VS Code and use the `@metrics` participant.

### Chat Commands

| Command | Description |
|---------|-------------|
| `@metrics` | Ask any engineering metrics question |
| `@metrics /prCycleTime` | Get PR cycle time guidance |
| `@metrics /reviewThroughput` | Get code review throughput guidance |
| `@metrics /deployFrequency` | Get deployment frequency guidance |

### Tools (invoked automatically by the model)

When you ask data-driven questions, the model will automatically invoke the appropriate tool. You'll see a confirmation prompt before any tool executes.

| Tool | Triggered by | Example prompt |
|------|-------------|----------------|
| **Get PR Statistics** | Asking about a specific GitHub repo's PR data | `@metrics what's the PR cycle time for myorg/myrepo?` |
| **Get GitLab MR Statistics** | Asking about a GitLab project's MR data | `@metrics what's the MR cycle time for project 12345?` |
| **Add GitLab MR Comment** | Asking to comment on a merge request | `@metrics add a comment to MR !42 in project 12345 saying "looks good"` |
| **Get Jira Sprint Cycle Time** | Asking about sprint metrics | `@metrics what's the cycle time for board 42?` |
| **Export Sprint Cycle Time CSV** | Asking for spreadsheet-ready data | `@metrics export cycle time CSV for Squad Alpha on board 42` |
| **Store Sprint Data to Snowflake** | Asking to persist sprint data | `@metrics store the sprint data from board 42 to snowflake` |

## Configuration

Configure via VS Code Settings (`Ctrl+,`) or in `settings.json`.

### GitHub

GitHub authentication is handled via VS Code's built-in GitHub authentication provider. You'll be prompted to sign in when a GitHub tool is first invoked.

### GitLab

Required for MR stats and MR comment tools.

| Setting | Description |
|---------|-------------|
| `engMetrics.gitlab.host` | GitLab instance URL (defaults to `https://gitlab.com`) |
| `engMetrics.gitlab.token` | GitLab personal access token (scopes: `read_api` for stats, `api` for comments) |

### Jira

Required for sprint cycle time tools.

| Setting | Description |
|---------|-------------|
| `engMetrics.jira.host` | Jira instance URL (e.g. `https://mycompany.atlassian.net`) |
| `engMetrics.jira.email` | Jira account email |
| `engMetrics.jira.apiToken` | Jira API token ([generate here](https://id.atlassian.com/manage-profile/security/api-tokens)) |

### Snowflake

Required for storing sprint data to Snowflake.

| Setting | Description |
|---------|-------------|
| `engMetrics.snowflake.account` | Snowflake account identifier (e.g. `xy12345.us-east-1`) |
| `engMetrics.snowflake.username` | Snowflake username |
| `engMetrics.snowflake.password` | Snowflake password |
| `engMetrics.snowflake.database` | Target database name |
| `engMetrics.snowflake.schema` | Target schema (defaults to `PUBLIC`) |
| `engMetrics.snowflake.warehouse` | Snowflake warehouse name |

Example `settings.json`:

```json
{
  "engMetrics.gitlab.host": "https://gitlab.com",
  "engMetrics.gitlab.token": "your-gitlab-token",
  "engMetrics.jira.host": "https://mycompany.atlassian.net",
  "engMetrics.jira.email": "you@company.com",
  "engMetrics.jira.apiToken": "your-jira-api-token",
  "engMetrics.snowflake.account": "xy12345.us-east-1",
  "engMetrics.snowflake.username": "your-username",
  "engMetrics.snowflake.password": "your-password",
  "engMetrics.snowflake.database": "METRICS_DB",
  "engMetrics.snowflake.warehouse": "COMPUTE_WH"
}
```

## Extending

### Adding a new tool

1. **Define the parameter interface** in `src/tools.ts`:
   ```typescript
   interface IMyToolParameters {
     someInput: string;
   }
   ```

2. **Create the tool class** implementing `vscode.LanguageModelTool<IMyToolParameters>`:
   ```typescript
   export class MyTool implements vscode.LanguageModelTool<IMyToolParameters> {
     async invoke(options, token) {
       // Fetch data, process, return result
       return new vscode.LanguageModelToolResult([
         new vscode.LanguageModelTextPart('result text'),
       ]);
     }

     async prepareInvocation(options, token) {
       return {
         invocationMessage: 'Doing something...',
         confirmationMessages: {
           title: 'Confirm Action',
           message: new vscode.MarkdownString('Proceed?'),
         },
       };
     }
   }
   ```

3. **Register the tool** in `registerMetricsTools()`:
   ```typescript
   vscode.lm.registerTool('eng-metrics_myTool', new MyTool()),
   ```

4. **Declare in `package.json`** under `contributes.languageModelTools`:
   ```json
   {
     "name": "eng-metrics_myTool",
     "tags": ["eng-metrics"],
     "displayName": "My Tool",
     "modelDescription": "Description for the AI model explaining what this tool does and its inputs.",
     "inputSchema": {
       "type": "object",
       "properties": {
         "someInput": { "type": "string", "description": "..." }
       },
       "required": ["someInput"]
     }
   }
   ```

### Adding a new chat command

1. Add the command in `package.json` under `contributes.chatParticipants[0].commands`.
2. Handle it in the `handler` function in `src/metricsParticipant.ts` with a new `else if (request.command === 'yourCommand')` branch.

### Adding a new external client

Follow the pattern in `src/jiraClient.ts` or `src/snowflakeClient.ts`:
- Read configuration from `vscode.workspace.getConfiguration()`
- Validate required settings with descriptive error messages
- Export a factory function that returns the client

## Development

```bash
npm run compile    # Build once with sourcemaps
npm run watch      # Build on file changes
npm run typecheck  # Type-check without emitting
npm run lint       # Lint source files
```

## Debugging

- Press **F5** to launch the Extension Development Host
- Check the **Debug Console** in the main VS Code window for `console.log` output from telemetry and tool invocations
- Tool errors are returned as result text (not thrown), so they appear in the Copilot Chat response

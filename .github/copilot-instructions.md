# Copilot instructions for eng-metrics-tools

## Big picture
- VS Code extension that registers a Copilot Chat participant (`@metrics`) and LLM tools.
- Entry point [src/extension.ts](src/extension.ts) registers `registerMetricsParticipant()` and `registerMetricsTools()`.
- Chat participant logic lives in [src/metricsParticipant.ts](src/metricsParticipant.ts) and drives tool-calling via `sendRequestWithTools()` (multi-round tool loop, max 5).
- Data-fetching lives in language model tools in [src/tools.ts](src/tools.ts); tools return `LanguageModelToolResult` with text summaries (errors are returned as text, not thrown).

## Key integration points
- GitHub PR stats uses VS Code GitHub auth (`vscode.authentication.getSession('github', ['repo'])`) in [src/tools.ts](src/tools.ts).
- GitLab/Jira/Snowflake clients read from VS Code settings via `vscode.workspace.getConfiguration()` in:
  - [src/gitlabClient.ts](src/gitlabClient.ts)
  - [src/jiraClient.ts](src/jiraClient.ts)
  - [src/snowflakeClient.ts](src/snowflakeClient.ts)
- Snowflake writes use `executeStatement()` and create table if missing; schema defaults to `PUBLIC`.

## Project-specific patterns
- Tools implement `vscode.LanguageModelTool<T>` and always define `prepareInvocation()` with a confirmation message.
- Jira sprint cycle time uses `statuscategorychangedate` as the start time, falling back to `created`.
- Tool outputs are markdown strings formatted as a short report (headers + bullet list + recent items).
- Tool errors are returned as `LanguageModelTextPart` (see `handleError()` and tool `catch` blocks).

## Adding features
- New tools: add class in [src/tools.ts](src/tools.ts), register in `registerMetricsTools()`, and declare in `package.json` under `contributes.languageModelTools`.
- New chat commands: add to `contributes.chatParticipants[0].commands` in `package.json`, then handle in `metricsParticipant`’s `handler` branching on `request.command`.

## Dev workflows
- Build once: `npm run compile`; watch: `npm run watch`; typecheck: `npm run typecheck`; lint: `npm run lint` (see README).
- Debug: press **F5** to launch Extension Development Host; `console.log` output shows in the Debug Console.

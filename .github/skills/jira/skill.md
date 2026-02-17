# Skill: Jira REST API v2 (Bearer Auth)

## Purpose
Fetch sprint-related data and run JQL queries using Jira REST API v2 (`/rest/api/2`) with Bearer token authentication. Configuration must be read from `.env`.

## Configuration (.env)
- `JIRA_BASE_URL` — e.g. `https://mycompany.atlassian.net`
- `JIRA_BEARER_TOKEN` — Bearer token for API access
- Optional: `JIRA_DEFAULT_PROJECT_KEY`, `JIRA_DEFAULT_SPRINT_ID`

See [.env.example](../../.env.example) for the template.

## Loading .env
Any script or tool using this skill should load `.env` at startup (e.g., via a dotenv loader) and read `JIRA_BASE_URL` and `JIRA_BEARER_TOKEN` from process env.

## Helper script
Use the Node helper to fetch issues or run JQL using API v2 with bearer auth:

- Issue: `node .github/skills/jira/fetch.js issue DMIB-1234`
- JQL: `node .github/skills/jira/fetch.js jql "project = ABC AND sprint = 123"`
- Sprint: `node .github/skills/jira/fetch.js sprint 123`

## Auth
Use the Authorization header:
```
Authorization: Bearer ${JIRA_BEARER_TOKEN}
```

## Core endpoints (API v2 only)
### JQL search
- **POST** `${JIRA_BASE_URL}/rest/api/2/search`
- Body:
```json
{
  "jql": "project = ABC AND sprint = 123 ORDER BY updated DESC",
  "fields": ["summary", "status", "assignee", "created", "resolutiondate", "statuscategorychangedate"],
  "maxResults": 100
}
```

### Fetch sprint data via JQL
Because sprint listings live in the Agile API, use JQL against `/rest/api/2/search` to pull sprint-related issues:
- Active sprint issues:
  - `sprint in openSprints() AND project = ABC`
- Specific sprint:
  - `sprint = 123 AND project = ABC`
- Done in sprint:
  - `sprint = 123 AND statusCategory = Done`

## Pagination
If `total > maxResults`, use `startAt` in the request body to paginate.

## Example (curl)
```bash
curl -sS -X POST "$JIRA_BASE_URL/rest/api/2/search" \
  -H "Authorization: Bearer $JIRA_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jql": "sprint = 123 AND project = ABC ORDER BY updated DESC",
    "fields": ["summary","status","assignee","created","resolutiondate","statuscategorychangedate"],
    "maxResults": 100
  }'
```

## Output expectations
- Return issue keys, summaries, assignees, and cycle-time-related fields.
- Summaries should group by status category and flag long-running items.

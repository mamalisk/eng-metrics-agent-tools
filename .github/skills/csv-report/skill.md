# Skill: CSV Report Export

## Purpose
Convert metrics data from Jira or GitLab into CSV format suitable for pasting into Excel or Google Sheets. This skill takes JSON output from the Jira or GitLab fetch helpers and produces a CSV with headers.

## Supported formats
| Format | Source | Columns |
|--------|--------|---------|
| `jira-sprint` | Jira fetch helper (sprint or JQL) | Issue Key, Summary, Status, Assignee, Created, Resolution Date, Cycle Time (hours) |
| `gitlab-mrs` | GitLab fetch helper (merged MRs) | MR IID, Title, Author, State, Created, Merged, Cycle Time (hours), URL |

## Helper script

### Pipe from another skill
The most common usage is to pipe JSON output from a fetch helper directly:

```bash
# Jira sprint → CSV (stdout)
node .github/skills/jira/fetch.js sprint 123 | node .github/skills/csv-report/export.js jira-sprint

# Jira JQL → CSV (stdout)
node .github/skills/jira/fetch.js jql "project = ABC AND sprint in openSprints()" | node .github/skills/csv-report/export.js jira-sprint

# GitLab merged MRs → CSV (stdout)
node .github/skills/gitlab/fetch.js mrs mygroup/myproject | node .github/skills/csv-report/export.js gitlab-mrs
```

### Read from a file
```bash
node .github/skills/csv-report/export.js jira-sprint --file sprint-data.json
node .github/skills/csv-report/export.js gitlab-mrs --file mr-data.json
```

### Write to a file
Add `--out` to write CSV to a file instead of stdout:
```bash
node .github/skills/jira/fetch.js sprint 123 | node .github/skills/csv-report/export.js jira-sprint --out sprint-report.csv
node .github/skills/gitlab/fetch.js mrs mygroup/myproject | node .github/skills/csv-report/export.js gitlab-mrs --out mr-report.csv
```

## Cycle time calculation
- **Jira**: `statuscategorychangedate → resolutiondate` (falls back to `created → resolutiondate` if no status change date)
- **GitLab**: `created_at → merged_at`
- Cycle time is reported in **hours** (1 decimal place)
- If the end date is missing (unresolved/unmerged), the cycle time column is left blank

## CSV format
- RFC 4180 compliant (fields with commas, quotes, or newlines are escaped)
- Header row is always included
- Output can be pasted directly into Excel, Google Sheets, or any spreadsheet tool

## Configuration
No additional configuration needed — this skill only transforms data. It depends on the Jira or GitLab skills for fetching.

## Example end-to-end workflow
```bash
# 1. Fetch sprint data from Jira
# 2. Convert to CSV
# 3. Save to file
node .github/skills/jira/fetch.js sprint 456 \
  | node .github/skills/csv-report/export.js jira-sprint --out sprint-456-report.csv

# Or fetch GitLab MRs and display CSV in terminal for copy-paste
node .github/skills/gitlab/fetch.js mrs mygroup/myproject \
  | node .github/skills/csv-report/export.js gitlab-mrs
```

# Skill: GitLab REST API v4 (Personal Access Token Auth)

## Purpose
Fetch merge request data and post comments using the GitLab REST API v4 (`/api/v4`) with Personal Access Token authentication. Configuration must be read from `.env`.

## Configuration (.env)
- `GITLAB_BASE_URL` — e.g. `https://gitlab.com` or `https://gitlab.mycompany.com`
- `GITLAB_TOKEN` — Personal Access Token (scopes: `read_api` for read operations, `api` for write operations like comments)
- Optional: `GITLAB_DEFAULT_PROJECT`

See [.env.example](../../.env.example) for the template.

## Loading .env
Any script or tool using this skill should load `.env` at startup (e.g., via a dotenv loader) and read `GITLAB_BASE_URL` and `GITLAB_TOKEN` from process env.

## Helper script
Use the Node helper to fetch MR data or post comments:

- List merged MRs: `node .github/skills/gitlab/fetch.js mrs mygroup/myproject`
- Get single MR: `node .github/skills/gitlab/fetch.js mr mygroup/myproject 42`
- Add comment: `node .github/skills/gitlab/fetch.js comment mygroup/myproject 42 "Cycle time looks good"`

Project can be a numeric ID (`12345`) or a path (`mygroup/myproject`).

## Auth
Use the PRIVATE-TOKEN header:
```
PRIVATE-TOKEN: ${GITLAB_TOKEN}
```

## Core endpoints (API v4)
### List merge requests
- **GET** `${GITLAB_BASE_URL}/api/v4/projects/${PROJECT_ID}/merge_requests`
- Query params: `state=merged`, `order_by=updated_at`, `sort=desc`, `per_page=30`
- Returns: array of MR objects with `iid`, `title`, `state`, `author`, `created_at`, `merged_at`, `web_url`

### Get single merge request
- **GET** `${GITLAB_BASE_URL}/api/v4/projects/${PROJECT_ID}/merge_requests/${MR_IID}`
- Returns: full MR object

### Add comment (note) to merge request
- **POST** `${GITLAB_BASE_URL}/api/v4/projects/${PROJECT_ID}/merge_requests/${MR_IID}/notes`
- Body:
```json
{
  "body": "Your comment text here"
}
```
- Returns: note object with `id`, `body`, `created_at`

## Project ID encoding
- Numeric IDs can be used as-is: `/api/v4/projects/12345/...`
- Path-based IDs must be URL-encoded: `/api/v4/projects/mygroup%2Fmyproject/...`

## Pagination
GitLab uses header-based pagination. Check `x-total` and `x-next-page` response headers. Use `page` and `per_page` query params to paginate.

## Example (curl)
```bash
# List merged MRs
curl -sS "${GITLAB_BASE_URL}/api/v4/projects/mygroup%2Fmyproject/merge_requests?state=merged&per_page=30" \
  -H "PRIVATE-TOKEN: ${GITLAB_TOKEN}"

# Add a comment to MR !42
curl -sS -X POST "${GITLAB_BASE_URL}/api/v4/projects/mygroup%2Fmyproject/merge_requests/42/notes" \
  -H "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"body": "Cycle time reviewed — looks good."}'
```

## Output expectations
- Return MR IIDs, titles, authors, and cycle-time-related timestamps (created_at, merged_at).
- For comments, confirm the note ID and creation time.

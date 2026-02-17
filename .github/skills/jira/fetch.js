#!/usr/bin/env node
/*
  Jira REST API v2 fetch helper (Bearer auth)
  Usage:
    node fetch.js issue DMIB-1234
    node fetch.js jql "project = ABC AND sprint = 123"
    node fetch.js sprint 123
*/

const fs = require('fs');
const path = require('path');

function loadDotEnv(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) {
    return;
  }
  const content = fs.readFileSync(dotenvPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    const value = raw.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}. Create .env from .env.example.`);
  }
  return value;
}

async function jiraFetch(url, options = {}) {
  const token = requireEnv('JIRA_BEARER_TOKEN');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API error ${response.status}: ${text}`);
  }
  return response.json();
}

function formatIssue(issue) {
  const fields = issue.fields || {};
  return {
    key: issue.key,
    summary: fields.summary,
    status: fields.status?.name,
    assignee: fields.assignee?.displayName ?? 'Unassigned',
    created: fields.created,
    resolutiondate: fields.resolutiondate ?? null,
    statuscategorychangedate: fields.statuscategorychangedate ?? null,
  };
}

async function fetchIssue(baseUrl, issueKey) {
  const url = `${baseUrl}/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=summary,status,assignee,created,resolutiondate,statuscategorychangedate`;
  const issue = await jiraFetch(url);
  console.log(JSON.stringify(formatIssue(issue), null, 2));
}

async function fetchJql(baseUrl, jql) {
  const url = `${baseUrl}/rest/api/2/search`;
  const body = {
    jql,
    fields: ['summary', 'status', 'assignee', 'created', 'resolutiondate', 'statuscategorychangedate'],
    maxResults: 100,
  };
  const result = await jiraFetch(url, { method: 'POST', body: JSON.stringify(body) });
  const issues = (result.issues || []).map(formatIssue);
  console.log(JSON.stringify({ total: result.total, issues }, null, 2));
}

async function fetchSprint(baseUrl, sprintId) {
  const jql = `sprint = ${sprintId} ORDER BY updated DESC`;
  await fetchJql(baseUrl, jql);
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  loadDotEnv(path.join(repoRoot, '.env'));

  const baseUrl = requireEnv('JIRA_BASE_URL').replace(/\/$/, '');
  const [mode, ...rest] = process.argv.slice(2);

  if (!mode) {
    throw new Error('Usage: node fetch.js <issue|jql|sprint> <value>');
  }

  if (mode === 'issue') {
    const issueKey = rest[0];
    if (!issueKey) throw new Error('Usage: node fetch.js issue <ISSUE-KEY>');
    await fetchIssue(baseUrl, issueKey);
    return;
  }

  if (mode === 'jql') {
    const jql = rest.join(' ').trim();
    if (!jql) throw new Error('Usage: node fetch.js jql "<JQL>"');
    await fetchJql(baseUrl, jql);
    return;
  }

  if (mode === 'sprint') {
    const sprintId = rest[0];
    if (!sprintId) throw new Error('Usage: node fetch.js sprint <SPRINT-ID>');
    await fetchSprint(baseUrl, sprintId);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

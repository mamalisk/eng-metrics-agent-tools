#!/usr/bin/env node
/*
  GitLab REST API v4 fetch helper (Personal Access Token auth)
  Usage:
    node fetch.js mrs <project-id-or-path>                  — list recent merged MRs
    node fetch.js mr <project-id-or-path> <mr-iid>          — get a single MR
    node fetch.js comment <project-id-or-path> <mr-iid> "text"  — add a note to an MR
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

function encodeProject(projectIdOrPath) {
  // Numeric IDs pass through; paths like "group/project" must be URL-encoded
  if (/^\d+$/.test(projectIdOrPath)) {
    return projectIdOrPath;
  }
  return encodeURIComponent(projectIdOrPath);
}

async function gitlabFetch(url, options = {}) {
  const token = requireEnv('GITLAB_TOKEN');
  const headers = {
    'PRIVATE-TOKEN': token,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitLab API error ${response.status}: ${text}`);
  }
  return response.json();
}

function formatMR(mr) {
  return {
    iid: mr.iid,
    title: mr.title,
    state: mr.state,
    author: mr.author?.username ?? 'unknown',
    created_at: mr.created_at,
    merged_at: mr.merged_at ?? null,
    web_url: mr.web_url,
  };
}

async function fetchMergedMRs(baseUrl, project) {
  const encoded = encodeProject(project);
  const url = `${baseUrl}/api/v4/projects/${encoded}/merge_requests?state=merged&order_by=updated_at&sort=desc&per_page=30`;
  const mrs = await gitlabFetch(url);
  const formatted = mrs.map(formatMR);
  console.log(JSON.stringify({ total: formatted.length, merge_requests: formatted }, null, 2));
}

async function fetchMR(baseUrl, project, mrIid) {
  const encoded = encodeProject(project);
  const url = `${baseUrl}/api/v4/projects/${encoded}/merge_requests/${mrIid}`;
  const mr = await gitlabFetch(url);
  console.log(JSON.stringify(formatMR(mr), null, 2));
}

async function addComment(baseUrl, project, mrIid, body) {
  const encoded = encodeProject(project);
  const url = `${baseUrl}/api/v4/projects/${encoded}/merge_requests/${mrIid}/notes`;
  const note = await gitlabFetch(url, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  console.log(JSON.stringify({ id: note.id, body: note.body, created_at: note.created_at }, null, 2));
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  loadDotEnv(path.join(repoRoot, '.env'));

  const baseUrl = requireEnv('GITLAB_BASE_URL').replace(/\/$/, '');
  const [mode, ...rest] = process.argv.slice(2);

  if (!mode) {
    throw new Error('Usage: node fetch.js <mrs|mr|comment> <args...>');
  }

  if (mode === 'mrs') {
    const project = rest[0];
    if (!project) throw new Error('Usage: node fetch.js mrs <project-id-or-path>');
    await fetchMergedMRs(baseUrl, project);
    return;
  }

  if (mode === 'mr') {
    const project = rest[0];
    const mrIid = rest[1];
    if (!project || !mrIid) throw new Error('Usage: node fetch.js mr <project-id-or-path> <mr-iid>');
    await fetchMR(baseUrl, project, mrIid);
    return;
  }

  if (mode === 'comment') {
    const project = rest[0];
    const mrIid = rest[1];
    const body = rest.slice(2).join(' ').trim();
    if (!project || !mrIid || !body) throw new Error('Usage: node fetch.js comment <project-id-or-path> <mr-iid> "comment text"');
    await addComment(baseUrl, project, mrIid, body);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

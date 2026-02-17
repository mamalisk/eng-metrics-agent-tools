#!/usr/bin/env node
/*
  CSV Report Export helper
  Reads JSON from Jira or GitLab fetch helpers and outputs CSV.

  Usage:
    Pipe from Jira:
      node .github/skills/jira/fetch.js sprint 123 | node .github/skills/csv-report/export.js jira-sprint
      node .github/skills/jira/fetch.js jql "project = ABC" | node .github/skills/csv-report/export.js jira-sprint

    Pipe from GitLab:
      node .github/skills/gitlab/fetch.js mrs mygroup/myproject | node .github/skills/csv-report/export.js gitlab-mrs

    Read from file:
      node .github/skills/csv-report/export.js jira-sprint --file data.json
      node .github/skills/csv-report/export.js gitlab-mrs --file data.json

    Write to file instead of stdout:
      node .github/skills/csv-report/export.js jira-sprint --file data.json --out report.csv
*/

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvLine(fields) {
  return fields.map(escapeCsv).join(',');
}

function calcCycleTimeHours(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms > 0 ? +(ms / (1000 * 60 * 60)).toFixed(1) : null;
}

function jiraSprintToCsv(data) {
  const issues = data.issues || [];
  const rows = [
    csvLine(['Issue Key', 'Summary', 'Status', 'Assignee', 'Created', 'Resolution Date', 'Cycle Time (hours)']),
  ];

  for (const issue of issues) {
    // Cycle time: statuscategorychangedate → resolutiondate, fallback to created → resolutiondate
    const start = issue.statuscategorychangedate || issue.created;
    const end = issue.resolutiondate;
    const cycleTime = calcCycleTimeHours(start, end);

    rows.push(csvLine([
      issue.key,
      issue.summary,
      issue.status,
      issue.assignee,
      issue.created,
      issue.resolutiondate ?? '',
      cycleTime ?? '',
    ]));
  }

  return rows.join('\n');
}

function gitlabMrsToCsv(data) {
  const mrs = data.merge_requests || [];
  const rows = [
    csvLine(['MR IID', 'Title', 'Author', 'State', 'Created', 'Merged', 'Cycle Time (hours)', 'URL']),
  ];

  for (const mr of mrs) {
    const cycleTime = calcCycleTimeHours(mr.created_at, mr.merged_at);

    rows.push(csvLine([
      mr.iid,
      mr.title,
      mr.author,
      mr.state,
      mr.created_at,
      mr.merged_at ?? '',
      cycleTime ?? '',
      mr.web_url ?? '',
    ]));
  }

  return rows.join('\n');
}

const FORMATS = {
  'jira-sprint': jiraSprintToCsv,
  'gitlab-mrs': gitlabMrsToCsv,
};

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const fs = require('fs');
  const args = process.argv.slice(2);

  const format = args[0];
  if (!format || !FORMATS[format]) {
    const valid = Object.keys(FORMATS).join(', ');
    throw new Error(`Usage: export.js <${valid}> [--file input.json] [--out output.csv]`);
  }

  // Parse flags
  let inputFile = null;
  let outputFile = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      inputFile = args[++i];
    } else if (args[i] === '--out' && args[i + 1]) {
      outputFile = args[++i];
    }
  }

  // Read input
  let rawJson;
  if (inputFile) {
    rawJson = fs.readFileSync(inputFile, 'utf8');
  } else {
    rawJson = await readStdin();
  }

  if (!rawJson.trim()) {
    throw new Error('No input data. Pipe JSON from a fetch helper or use --file.');
  }

  const data = JSON.parse(rawJson);
  const csv = FORMATS[format](data);

  // Output
  if (outputFile) {
    fs.writeFileSync(outputFile, csv, 'utf8');
    console.log(`CSV written to ${outputFile} (${csv.split('\n').length} rows)`);
  } else {
    console.log(csv);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

#!/usr/bin/env node
// Zero-dependency Node HTTP server: serves the post-editing UI and a small
// JSON API for reading/writing the jsonl file.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT) || 5050;
const DATA_FILE = path.resolve(
  process.argv[2] || process.env.DATA_FILE || path.join(__dirname, 'data', 'ch2.mt.jsonl')
);
const PUBLIC_DIR = path.join(__dirname, 'public');

function readRecords() {
  const text = fs.readFileSync(DATA_FILE, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function writeRecords(records) {
  const text = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  // Write to a temp file then rename, so a crash mid-write can't corrupt the dataset.
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, text, 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(url.parse(req.url).pathname);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);
  // Guard against path traversal outside of public/.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  try {
    if (req.method === 'GET' && parsed.pathname === '/api/records') {
      return sendJson(res, 200, { file: path.basename(DATA_FILE), records: readRecords() });
    }

    if (req.method === 'PUT' && parsed.pathname.startsWith('/api/records/')) {
      const unitId = decodeURIComponent(parsed.pathname.slice('/api/records/'.length));
      const body = JSON.parse((await readBody(req)) || '{}');
      if (typeof body.pe_text !== 'string') {
        return sendJson(res, 400, { error: 'pe_text (string) is required' });
      }

      const records = readRecords();
      const idx = records.findIndex((r) => r.unit_id === unitId);
      if (idx === -1) {
        return sendJson(res, 404, { error: `unit_id ${unitId} not found` });
      }

      records[idx].pe_text = body.pe_text;
      records[idx].edited = true;
      writeRecords(records);
      return sendJson(res, 200, { record: records[idx] });
    }

    return serveStatic(req, res);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: String((err && err.message) || err) });
  }
});

function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      listen(port + 1);
    } else {
      throw err;
    }
  });
  server.listen(port, () => {
    console.log(`Post-editing app running at http://localhost:${port}`);
    console.log(`Editing data file: ${DATA_FILE}`);
  });
}

listen(PORT);

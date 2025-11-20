const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const get = require('lodash.get');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = path.resolve(__dirname);
const WEBSITES_DIR = path.join(ROOT, 'websites');
const DB_FILE = path.join(ROOT, 'db.json');

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// logging
const logger = require('./logger');
app.use(logger.requestLogger);

// endpoint to receive client-side logs
app.post('/api/logs', (req, res) => {
  const { level, message, meta } = req.body || {};
  const m = meta ? `${message} | meta: ${JSON.stringify(meta)}` : message;
  if(level === 'error') logger.error(m); else if(level === 'warn') logger.warn(m); else logger.info(m);
  res.json({ ok: true });
});

// ensure folders
if (!fs.existsSync(WEBSITES_DIR)) fs.mkdirSync(WEBSITES_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ sites: [] }, null, 2));

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Serve admin UI
app.get('/admin', (req, res) => {
  res.sendFile(path.join(ROOT, 'admin.html'));
});

// Serve static admin assets if present
app.use('/admin-static', express.static(path.join(ROOT, 'admin-static')));

// Admin API
app.get('/api/sites', (req, res) => {
  const db = readDB();
  // discover folders under WEBSITES_DIR and ensure entries exist in db
  const folders = fs.existsSync(WEBSITES_DIR) ? fs.readdirSync(WEBSITES_DIR).filter(d => fs.statSync(path.join(WEBSITES_DIR, d)).isDirectory()) : [];
  let changed = false;
  for (const f of folders) {
    if (!db.sites.find(s => s.name === f)) {
      db.sites.push({ name: f, apis: [], mappings: [] });
      changed = true;
    }
  }
  if (changed) writeDB(db);
  res.json(db.sites);
});

// Return directory tree for a site (folders and files)
function readTree(dir, baseDir) {
  const items = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(baseDir, abs).split('\\').join('/');
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      items.push({ name, path: rel + '/', type: 'dir', children: readTree(abs, baseDir) });
    } else {
      items.push({ name, path: rel, type: 'file' });
    }
  }
  return items;
}

app.get('/api/sites/:siteName/tree', (req, res) => {
  const siteName = req.params.siteName;
  const siteFolder = path.join(WEBSITES_DIR, siteName);
  if (!fs.existsSync(siteFolder)) return res.status(404).json({ error: 'site not found' });
  try {
    const tree = readTree(siteFolder, siteFolder);
    res.json(tree);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: String(err.message) });
  }
});

app.post('/api/sites', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const db = readDB();
  if (db.sites.find(s => s.name === name)) return res.status(400).json({ error: 'site exists' });
  const site = { name, apis: [], mappings: [] };
  db.sites.push(site);
  // ensure website folder
  const siteFolder = path.join(WEBSITES_DIR, name);
  if (!fs.existsSync(siteFolder)) fs.mkdirSync(siteFolder, { recursive: true });
  writeDB(db);
  res.json(site);
});

app.get('/api/sites/:siteName', (req, res) => {
  const db = readDB();
  const s = db.sites.find(x => x.name === req.params.siteName);
  if (!s) return res.status(404).json({ error: 'site not found' });
  res.json(s);
});

// List HTML pages for a site
app.get('/api/sites/:siteName/pages', (req, res) => {
  const siteName = req.params.siteName;
  const siteFolder = path.join(WEBSITES_DIR, siteName);
  if (!fs.existsSync(siteFolder)) return res.status(404).json({ error: 'site not found' });
  const files = [];
  function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const abs = path.join(dir, f);
      const rel = path.relative(siteFolder, abs).split('\\').join('/');
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) walk(abs);
      else if (['.html', '.htm'].includes(path.extname(f).toLowerCase())) files.push(rel);
    }
  }
  walk(siteFolder);
  res.json(files);
});

// Get raw page content (not processed)
app.get('/api/sites/:siteName/pages/content', (req, res) => {
  const siteName = req.params.siteName;
  const p = req.query.path || 'index.html';
  // sanitize path
  if (p.includes('..')) return res.status(400).json({ error: 'invalid path' });
  const filePath = path.join(WEBSITES_DIR, siteName, p);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
  res.set('Content-Type', 'text/plain');
  res.send(fs.readFileSync(filePath, 'utf8'));
});

// Save page content (overwrite or create)
app.post('/api/sites/:siteName/pages/save', (req, res) => {
  const siteName = req.params.siteName;
  const { path: relPath, content } = req.body;
  if (!relPath || relPath.includes('..')) return res.status(400).json({ error: 'invalid path' });
  const filePath = path.join(WEBSITES_DIR, siteName, relPath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  res.json({ ok: true });
});

app.post('/api/sites/:siteName/apis', (req, res) => {
  const { name, url, method, headers, params, bodyTemplate } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const db = readDB();
  const s = db.sites.find(x => x.name === req.params.siteName);
  if (!s) return res.status(404).json({ error: 'site not found' });
  if (s.apis.find(a => a.name === name)) return res.status(400).json({ error: 'api name exists' });
  const api = { name, url, method: method || 'GET', headers: headers || {}, params: params || {}, bodyTemplate: bodyTemplate || null };
  s.apis.push(api);
  writeDB(db);
  res.json(api);
});

app.post('/api/sites/:siteName/mappings', (req, res) => {
  const { placeholder, apiName, jsonPath, pages } = req.body;
  if (!placeholder || !apiName || !jsonPath) return res.status(400).json({ error: 'placeholder, apiName, jsonPath required' });
  const db = readDB();
  const s = db.sites.find(x => x.name === req.params.siteName);
  if (!s) return res.status(404).json({ error: 'site not found' });
  s.mappings.push({ placeholder, apiName, jsonPath, pages: pages || [] });
  writeDB(db);
  res.json({ placeholder, apiName, jsonPath });
});

// Execute a configured endpoint server-side (test or runtime)
app.post('/api/sites/:siteName/endpoints/:apiName/execute', async (req, res) => {
  const db = readDB();
  const s = db.sites.find(x => x.name === req.params.siteName);
  if (!s) return res.status(404).json({ error: 'site not found' });
  const api = s.apis.find(a => a.name === req.params.apiName);
  if (!api) return res.status(404).json({ error: 'api not found' });
  // allow overriding params/body in request
  const override = req.body || {};
  const url = api.url;
  const method = api.method || 'GET';
  const headers = Object.assign({}, api.headers || {}, override.headers || {});
  let data = null;
  if (api.bodyTemplate) data = override.body || api.bodyTemplate;
  try {
    const resp = await axios({ method, url, headers, params: Object.assign({}, api.params || {}, override.params || {}), data });
    return res.json({ status: resp.status, data: resp.data, headers: resp.headers });
  } catch (err) {
    return res.status(500).json({ error: String(err.message), response: err.response ? { status: err.response.status, data: err.response.data } : undefined });
  }
});

// Aggregated API data for a site (server-side fetch of all configured apis)
app.get('/api/sites/:siteName/data', async (req, res) => {
  const db = readDB();
  const s = db.sites.find(x => x.name === req.params.siteName);
  if (!s) return res.status(404).json({ error: 'site not found' });
  try{
    const data = await fetchAPIsForSite(s);
    res.json(data);
  }catch(err){
    logger.error(err);
    res.status(500).json({ error: String(err.message) });
  }
});

// Helper: fetch all APIs for site (simple, no auth caching)
async function fetchAPIsForSite(site) {
  const results = {};
  for (const api of site.apis) {
    try {
      const resp = await axios({ method: api.method || 'GET', url: api.url, headers: api.headers || {}, params: api.params || {}, data: api.bodyTemplate || undefined });
      results[api.name] = resp.data;
    } catch (err) {
      results[api.name] = { _error: String(err.message) };
    }
  }
  return results;
}

// Serve website files with injection for .html only
app.get('/site/:siteName/*', async (req, res) => {
  const siteName = req.params.siteName;
  const db = readDB();
  const site = db.sites.find(x => x.name === siteName);
  const relPath = req.params[0] || 'index.html';
  const filePath = path.join(WEBSITES_DIR, siteName, relPath);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.html' && ext !== '.htm') return res.sendFile(filePath);

  let content = fs.readFileSync(filePath, 'utf8');
  if (!site) return res.send(content);

  // Fetch APIs
  const apiData = await fetchAPIsForSite(site);

  // First handle simple each blocks: {{#each apiName.jsonPath}}...{{/each}}
  content = content.replace(/{{#each\s+([^}]+)}}([\s\S]*?){{\/each}}/g, (match, p1, inner) => {
    const arr = get(apiData, p1, []);
    if (!Array.isArray(arr)) return '';
    return arr.map(item => {
      // replace {{this.prop}} or {{prop}} in inner
      return inner.replace(/{{\s*(?:this\.)?([\w$\-]+)\s*}}/g, (mm, key) => {
        return get(item, key, '');
      });
    }).join('');
  });

  // Do placeholder substitution: {{placeholder}} -> look up mapping values by mapping list
  for (const m of site.mappings || []) {
    // apply mapping only if mapping.pages empty (global) or includes this relPath
    if (m.pages && m.pages.length > 0) {
      const matches = m.pages.some(pp => pp === relPath);
      if (!matches) continue;
    }
    const value = get(apiData[m.apiName], m.jsonPath, '');
    const re = new RegExp(escapeRegExp('{{' + m.placeholder + '}}'), 'g');
    content = content.replace(re, String(value));
  }

  // Also allow direct placeholders like {{apiName.path.to.value}}
  content = content.replace(/{{\s*([\w0-9_.-]+)\s*}}/g, (mm, key) => {
    // if already replaced by mappings, skip
    if (mm.indexOf('{{') === -1) return mm;
    const val = get(apiData, key, '');
    return (val === undefined || val === null) ? '' : String(val);
  });

  res.set('Content-Type', 'text/html');
  res.send(content);
});

// express error handler (catch-all)
app.use((err, req, res, next) => {
  try{ logger.error(err); }catch(e){ process.stderr.write('logger failed ' + String(e) + '\n'); }
  res.status(500).json({ error: 'internal server error' });
});

// capture uncaught exceptions and unhandled rejections
process.on('unhandledRejection', (reason, p) => {
  logger.error(`UnhandledRejection: ${reason} ${p}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`UncaughtException: ${err && err.stack ? err.stack : err}`);
  // optional: exit to allow a supervisor to restart
  // process.exit(1);
});

// Helper escape
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Serve root: list sites
app.get('/', (req, res) => {
  const db = readDB();
  res.send(`<h2>AppBuilder Prototype</h2><p>Sites:</p><ul>${db.sites.map(s=>`<li><a href="/site/${s.name}/">${s.name}</a></li>`).join('')}</ul><p>Admin: <a href="/admin">Open admin</a></p>`);
});

app.listen(PORT, () => {
  logger.info(`AppBuilder prototype running on http://localhost:${PORT}`);
});

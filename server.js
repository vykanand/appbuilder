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
const DB_FILE = path.join(ROOT, 'api-repo.json');
const MAPPINGS_FILE = path.join(ROOT, 'mappings.json');

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
// Provide the `extended` option to urlencoded to avoid deprecation warnings
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
if (!fs.existsSync(MAPPINGS_FILE)) fs.writeFileSync(MAPPINGS_FILE, JSON.stringify({ sites: {} }, null, 2));

function readDB() {
  try {
    const content = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    logger.error(`Error reading DB file: ${err.message}`);
    // Return default structure if file is corrupted
    return { sites: [] };
  }
}

function writeDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    logger.error(`Error writing DB file: ${err.message}`);
    throw err;
  }
}

function readMappings() {
  try {
    if (!fs.existsSync(MAPPINGS_FILE)) {
      logger.warn('Mappings file does not exist, creating default structure');
      const defaultMappings = { sites: {} };
      writeMappings(defaultMappings);
      return defaultMappings;
    }

    const content = fs.readFileSync(MAPPINGS_FILE, 'utf8');

    // Basic validation - check if it starts with '{'
    if (!content.trim().startsWith('{')) {
      throw new Error('File does not appear to be valid JSON');
    }

    const parsed = JSON.parse(content);

    // Ensure the structure is valid
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Parsed content is not a valid object');
    }

    // Ensure sites property exists
    if (!parsed.sites) {
      parsed.sites = {};
    }

    return parsed;
  } catch (err) {
    logger.error(`Error reading mappings file: ${err.message}`);

    // Try to backup corrupted file
    try {
      if (fs.existsSync(MAPPINGS_FILE)) {
        const backupFile = MAPPINGS_FILE + '.backup.' + Date.now();
        fs.copyFileSync(MAPPINGS_FILE, backupFile);
        logger.info(`Backed up corrupted mappings file to: ${backupFile}`);
      }
    } catch (backupErr) {
      logger.error(`Error backing up corrupted file: ${backupErr.message}`);
    }

    // Return default structure if file is corrupted
    const defaultMappings = { sites: {} };
    try {
      writeMappings(defaultMappings);
      logger.info('Created new default mappings file');
    } catch (writeErr) {
      logger.error(`Error creating default mappings file: ${writeErr.message}`);
    }

    return defaultMappings;
  }
}

function writeMappings(mappings) {
  try {
    const tempFile = MAPPINGS_FILE + '.tmp';
    // Write to temporary file first
    fs.writeFileSync(tempFile, JSON.stringify(mappings, null, 2));
    // Then atomically rename it
    fs.renameSync(tempFile, MAPPINGS_FILE);
  } catch (err) {
    logger.error(`Error writing mappings file: ${err.message}`);
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(MAPPINGS_FILE + '.tmp')) {
        fs.unlinkSync(MAPPINGS_FILE + '.tmp');
      }
    } catch (cleanupErr) {
      logger.error(`Error cleaning up temp file: ${cleanupErr.message}`);
    }
    throw err;
  }
}

// Serve admin UI
app.get('/admin', (req, res) => {
  res.sendFile(path.join(ROOT, 'admin.html'));
});

// Serve favicon for main app
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(ROOT, 'favicon.ico'));
});

// Serve favicon for individual sites (dynamic from their root folder, fallback to main)
app.get('/site/:siteName/favicon.ico', (req, res) => {
  const siteName = req.params.siteName;
  const siteFavicon = path.join(WEBSITES_DIR, siteName, 'favicon.ico');
  if (fs.existsSync(siteFavicon)) {
    res.sendFile(siteFavicon);
  } else {
    res.sendFile(path.join(ROOT, 'favicon.ico'));
  }
});

// Serve any HTML file in root directory dynamically by filename (e.g. /rest-client -> rest-client.html)
app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  // Skip if this looks like an API route or other special route
  if (page.startsWith('api') || page === 'admin' || page === 'favicon.ico' || page === 'site' || page === 'website') {
    return next();
  }
  // Only allow valid filename characters for .html files in root, block directory traversal
  if (!/^[\w\-\.]+$/.test(page)) return res.status(400).send('Invalid page name');

  // Handle both /pagename and /pagename.html requests
  let fileName = page;
  if (fileName.endsWith('.html')) {
    fileName = fileName.slice(0, -5); // remove .html extension
  }
  const filePath = path.join(ROOT, `${fileName}.html`);
  fs.access(filePath, fs.constants.F_OK, err => {
    if (err) return next(); // fallback to other routes if not found
    res.sendFile(filePath);
  });
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
  const site = { name, apis: [] };
  db.sites.push(site);
  
  // Initialize mappings for the new site
  const mappings = readMappings();
  mappings.sites = mappings.sites || {};
  mappings.sites[name] = { actions: [], mappings: [], pageMappings: [] };
  writeMappings(mappings);
  
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
  logger.info(`Listing pages for site: ${siteName}`);
  try {
    const siteFolder = path.join(WEBSITES_DIR, siteName);
    if (!fs.existsSync(siteFolder)) {
      logger.warn(`Site folder not found: ${siteFolder}`);
      return res.status(404).json({ error: 'site not found' });
    }
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
    logger.info(`Found ${files.length} HTML pages for site ${siteName}`);
    res.json(files);
  } catch (err) {
    logger.error(`Error listing pages for site ${siteName}: ${err.message}`);
    res.status(500).json({ error: 'internal server error' });
  }
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

// Get page content by page name
app.get('/api/sites/:siteName/pages/:pageName', (req, res) => {
  const siteName = req.params.siteName;
  const pageName = req.params.pageName;
  logger.info(`Getting page content for site: ${siteName}, page: ${pageName}`);
  try {
    // sanitize path
    if (pageName.includes('..')) {
      logger.warn(`Invalid path detected: ${pageName}`);
      return res.status(400).json({ error: 'invalid path' });
    }
    const filePath = path.join(WEBSITES_DIR, siteName, pageName);
    if (!fs.existsSync(filePath)) {
      logger.warn(`Page file not found: ${filePath}`);
      return res.status(404).json({ error: 'not found' });
    }
    logger.info(`Serving page content from: ${filePath}`);
    res.set('Content-Type', 'text/html');
    res.send(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    logger.error(`Error getting page content: ${err.message}`);
    res.status(500).json({ error: 'internal server error' });
  }
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

// Update an existing API definition (allow updating mapping configuration and bodyTemplate)
app.put('/api/sites/:siteName/apis/:apiName', (req, res) => {
  const siteName = req.params.siteName;
  const apiName = req.params.apiName;
  const db = readDB();
  const s = db.sites.find(x => x.name === siteName);
  if (!s) return res.status(404).json({ error: 'site not found' });
  const api = s.apis.find(a => a.name === apiName);
  if (!api) return res.status(404).json({ error: 'api not found' });
  const { url, method, headers, params, bodyTemplate, mappingConfig } = req.body;
  if (url !== undefined) api.url = url;
  if (method !== undefined) api.method = method;
  if (headers !== undefined) api.headers = headers;
  if (params !== undefined) api.params = params;
  if (bodyTemplate !== undefined) api.bodyTemplate = bodyTemplate;
  if (mappingConfig !== undefined) api.mappingConfig = mappingConfig;
  writeDB(db);
  res.json(api);
});

// Delete an API definition for a site
app.delete('/api/sites/:siteName/apis/:apiName', (req, res) => {
  const siteName = req.params.siteName;
  const apiName = req.params.apiName;
  const db = readDB();
  const s = db.sites.find(x => x.name === siteName);
  if (!s) return res.status(404).json({ error: 'site not found' });
  const idx = s.apis.findIndex(a => a.name === apiName);
  if (idx === -1) return res.status(404).json({ error: 'api not found' });
  s.apis.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

// Persist UI-driven actions (button/form -> API mappings)
app.post('/api/sites/:siteName/actions', (req, res) => {
  const { selector, apiName, method, fields, page } = req.body || {};
  if (!selector || !apiName) return res.status(400).json({ error: 'selector and apiName required' });
  const mappings = readMappings();
  mappings.sites = mappings.sites || {};
  mappings.sites[req.params.siteName] = mappings.sites[req.params.siteName] || { actions: [], mappings: [], pageMappings: [] };
  const siteMappings = mappings.sites[req.params.siteName];
  siteMappings.actions = siteMappings.actions || [];
  const action = { id: 'action_' + Date.now().toString(36), selector, apiName, method: method || 'POST', fields: fields || [], page: page || null };
  siteMappings.actions.push(action);
  writeMappings(mappings);
  res.json(action);
});

app.post('/api/sites/:siteName/mappings', (req, res) => {
  const { placeholder, apiName, jsonPath, pages } = req.body;
  if (!placeholder || !apiName || !jsonPath) return res.status(400).json({ error: 'placeholder, apiName, jsonPath required' });
  const mappings = readMappings();
  mappings.sites = mappings.sites || {};
  mappings.sites[req.params.siteName] = mappings.sites[req.params.siteName] || { actions: [], mappings: [], pageMappings: [] };
  const siteMappings = mappings.sites[req.params.siteName];
  siteMappings.mappings = siteMappings.mappings || [];
  siteMappings.mappings.push({ placeholder, apiName, jsonPath, pages: pages || [] });
  writeMappings(mappings);
  res.json({ placeholder, apiName, jsonPath });
});

// Get pages that use a specific API (from actions)
app.get('/api/sites/:siteName/api/:apiName/pages', (req, res) => {
  const siteName = req.params.siteName;
  const apiName = req.params.apiName;
  const db = readDB();
  const s = db.sites.find(x => x.name === siteName);
  if (!s) return res.status(404).json({ error: 'site not found' });
  
  const mappings = readMappings();
  mappings.sites = mappings.sites || {};
  const siteMappings = mappings.sites[siteName] || { actions: [], mappings: [], pageMappings: [] };
  
  // Get unique pages from actions that use this API
  const pagesFromActions = [...new Set((siteMappings.actions || [])
    .filter(a => a.apiName === apiName && a.page)
    .map(a => a.page))];
  
  // Also get pages from mappings
  const pagesFromMappings = [...new Set((siteMappings.mappings || [])
    .filter(m => m.apiName === apiName && m.pages)
    .flatMap(m => m.pages))];

  // Also get pages from pageMappings
  const pagesFromPageMappings = [...new Set((siteMappings.pageMappings || [])
    .filter(pm => pm.apiName === apiName && pm.page)
    .map(pm => pm.page))];
  
  // Combine and deduplicate
  const allPages = [...new Set([...pagesFromActions, ...pagesFromMappings, ...pagesFromPageMappings])];
  
  res.json(allPages);
});

// Save/update page-API mapping (for drag-and-drop snippets)
app.post('/api/sites/:siteName/page-mappings', (req, res) => {
  const { page, apiName, method, fieldMappings, submitSelector } = req.body;
  if (!page || !apiName) return res.status(400).json({ error: 'page and apiName required' });
  
  const mappings = readMappings();
  mappings.sites = mappings.sites || {};
  mappings.sites[req.params.siteName] = mappings.sites[req.params.siteName] || { actions: [], mappings: [], pageMappings: [] };
  const siteMappings = mappings.sites[req.params.siteName];
  siteMappings.pageMappings = siteMappings.pageMappings || [];
  
  // Find existing mapping for this page+api combination
  let existingMapping = siteMappings.pageMappings.find(pm => pm.page === page && pm.apiName === apiName);
  
  if (existingMapping) {
    // Update existing mapping
    if (method !== undefined) existingMapping.method = method;
    if (fieldMappings !== undefined) existingMapping.fieldMappings = fieldMappings;
    if (submitSelector !== undefined) existingMapping.submitSelector = submitSelector;
  } else {
    // Create new mapping
    const mapping = {
      id: 'pm_' + Date.now().toString(36),
      page,
      apiName,
      method: method || 'POST',
      fieldMappings: fieldMappings || {},
      submitSelector: submitSelector || null
    };
    siteMappings.pageMappings.push(mapping);
  }
  
  writeMappings(mappings);
  res.json({ success: true });
});

// Get page mappings for a specific page
app.get('/api/sites/:siteName/pages/:pageName/mappings', (req, res) => {
  const siteName = req.params.siteName;
  const pageName = req.params.pageName;
  logger.info(`Getting page mappings for site: ${siteName}, page: ${pageName}`);
  try {
    const mappings = readMappings();
    mappings.sites = mappings.sites || {};
    const siteMappings = mappings.sites[siteName];
    if (!siteMappings) {
      logger.warn(`Site not found in mappings: ${siteName}`);
      return res.status(404).json({ error: 'site not found' });
    }
    
    const pageMappings = (siteMappings.pageMappings || []).filter(pm => pm.page === pageName);
    logger.info(`Found ${pageMappings.length} mappings for page ${pageName}`);
    res.json(pageMappings);
  } catch (err) {
    logger.error(`Error getting page mappings: ${err.message}`);
    res.status(500).json({ error: 'internal server error' });
  }
});

// Get page mapping for a specific API on a page
app.get('/api/sites/:siteName/pages/:pageName/api/:apiName/mapping', (req, res) => {
  const siteName = req.params.siteName;
  const pageName = req.params.pageName;
  const apiName = req.params.apiName;
  const mappings = readMappings();
  mappings.sites = mappings.sites || {};
  const siteMappings = mappings.sites[siteName];
  if (!siteMappings) return res.status(404).json({ error: 'site not found' });
  
  const mapping = (siteMappings.pageMappings || []).find(pm => pm.page === pageName && pm.apiName === apiName);
  if (!mapping) return res.status(404).json({ error: 'mapping not found' });
  
  res.json(mapping);
});

// Execute a configured endpoint server-side (test or runtime)
app.post('/api/sites/:siteName/endpoints/:apiName/execute', async (req, res) => {
  const siteName = req.params.siteName;
  const apiName = req.params.apiName;
  logger.info(`Executing API endpoint for site: ${siteName}, api: ${apiName}`);
  try {
    const db = readDB();
    const s = db.sites.find(x => x.name === siteName);
    if (!s) {
      logger.warn(`Site not found in DB: ${siteName}`);
      return res.status(404).json({ error: 'site not found' });
    }
    const api = s.apis.find(a => a.name === apiName);
    if (!api) {
      logger.warn(`API not found: ${apiName} in site ${siteName}`);
      return res.status(404).json({ error: 'api not found' });
    }
    // allow overriding params/body in request
    const override = req.body || {};
    const url = api.url;
    const method = api.method || 'GET';
    const headers = Object.assign({}, api.headers || {}, override.headers || {});
    let data = null;
    if (api.bodyTemplate) data = override.body || api.bodyTemplate;
    logger.info(`Making ${method} request to ${url}`);
    const resp = await axios({ method, url, headers, params: Object.assign({}, api.params || {}, override.params || {}), data });
    logger.info(`API call successful, status: ${resp.status}`);
    return res.json({ status: resp.status, data: resp.data, headers: resp.headers });
  } catch (err) {
    logger.error(`Error executing API ${apiName}: ${err.message}`);
    return res.status(500).json({ error: String(err.message), response: err.response ? { status: err.response.status, data: err.response.data } : undefined });
  }
});

// Aggregated API data for a site (server-side fetch of all configured apis)
app.get('/api/sites/:siteName/data', async (req, res) => {
  const siteName = req.params.siteName;
  logger.info(`Getting API data for site: ${siteName}`);
  try {
    const db = readDB();
    const s = db.sites.find(x => x.name === siteName);
    if (!s) {
      logger.warn(`Site not found in DB: ${siteName}`);
      return res.status(404).json({ error: 'site not found' });
    }
    const data = await fetchAPIsForSite(s);
    logger.info(`Fetched API data for site ${siteName}`);
    res.json(data);
  } catch (err) {
    logger.error(`Error fetching API data for site ${siteName}: ${err.message}`);
    res.status(500).json({ error: String(err.message) });
  }
});

// Helper: fetch all APIs for site (simple, no auth caching)
async function fetchAPIsForSite(site) {
  const results = {};
  results.__meta__ = {};
  for (const api of site.apis) {
    try {
      const resp = await axios({ method: api.method || 'GET', url: api.url, headers: api.headers || {}, params: api.params || {}, data: api.bodyTemplate || undefined });
      results[api.name] = resp.data;
      results.__meta__[api.name] = { method: (api.method || 'GET').toUpperCase(), status: resp.status, url: api.url };
    } catch (err) {
      results[api.name] = { _error: String(err.message) };
      results.__meta__[api.name] = { method: (api.method || 'GET').toUpperCase(), status: 'error', url: api.url };
    }
  }
  return results;
}

// Serve all files for a site dynamically from root folder (no processing)
app.get('/website/:siteName/*', (req, res) => {
  const siteName = req.params.siteName;
  const relPath = req.params[0];
  // sanitize path
  if (relPath.includes('..')) return res.status(400).send('Invalid path');
  const filePath = path.join(WEBSITES_DIR, siteName, relPath);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

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

  // Read mappings for this site
  const mappings = readMappings();
  mappings.sites = mappings.sites || {};
  const siteMappings = mappings.sites[siteName] || { actions: [], mappings: [], pageMappings: [] };

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
  for (const m of siteMappings.mappings || []) {
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

  // Inject action wiring for buttons/forms if site.actions exist
  try{
    const actions = (siteMappings.actions || []).filter(a => !a.page || a.page === relPath);
    if(actions && actions.length>0){
      const safe = JSON.stringify(actions).replace(/</g,'\\u003c');
      const script = `\n<script>/* AppBuilder action bindings */(function(actions, siteName){try{actions.forEach(function(a){try{var els = document.querySelectorAll(a.selector||''); if(!els) return; els.forEach(function(el){ if(el.__ab_action_bound) return; el.__ab_action_bound = true; el.addEventListener('click', async function(ev){ try{ ev.preventDefault(); var body = {}; (a.fields||[]).forEach(function(f){ try{ var inp = document.querySelector('[name="'+f+'"]') || document.querySelector('[data-field="'+f+'"]') || document.getElementById(f); body[f] = inp ? (inp.value || inp.textContent || '') : ''; }catch(e){} }); await fetch('/api/sites/'+encodeURIComponent(siteName)+'/endpoints/'+encodeURIComponent(a.apiName)+'/execute', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ body: body }) }); }catch(e){ console && console.error && console.error(e); } }); }); }catch(e){} });}catch(e){console && console.error && console.error(e);} })(` + safe + `, ${JSON.stringify(siteName)});</script>\n`;
      // append before closing body if present, else at end
      if(content.lastIndexOf('</body>')!==-1){ content = content.replace(/<\/body>\s*$/i, script + '</body>'); }
      else { content = content + script; }
    }
  }catch(e){ logger.error(e); }

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
  logger.info(`AppBuilder running on http://localhost:${PORT}`);
});

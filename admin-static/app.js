const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

// If AppUtils.Logger is available (utils.js loads before this), wire console methods to it
if(window.AppUtils && AppUtils.Logger){
  const L = AppUtils.Logger;
  console.log = (...a)=> L.log(...a);
  console.info = (...a)=> L.info(...a);
  console.warn = (...a)=> L.warn(...a);
  console.error = (...a)=> L.error(...a);
}

let sites = [];
let selectedSite = null;
let latestAggregatedData = {};

function getValueFromLatest(path){
  if(!path) return undefined;
  const parts = path.split('.');
  let cur = latestAggregatedData;
  for(const p of parts){
    if(cur === undefined || cur === null) return undefined;
    cur = cur[p];
  }
  return cur;
}

// Estimate caret index in a textarea from mouse coordinates.
// Works best when textarea uses a monospace font (our editor does).
function getCaretIndexFromCoords(textarea, clientX, clientY){
  try{
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const fontSize = style.fontSize || '14px';
    const fontFamily = style.fontFamily || 'monospace';
    // approximate character width using canvas
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize} ${fontFamily}`;
    const charWidth = ctx.measureText('M').width || parseFloat(fontSize) * 0.6;
    // estimate line height
    const lineHeight = parseFloat(style.lineHeight) || (parseFloat(fontSize) * 1.2);
    // compute relative coordinates inside content area
    const x = clientX - rect.left - paddingLeft + textarea.scrollLeft;
    const y = clientY - rect.top - paddingTop + textarea.scrollTop;
    const approxLine = Math.max(0, Math.floor(y / lineHeight));
    const lines = textarea.value.split('\n');
    const targetLine = Math.min(approxLine, lines.length - 1);
    const approxCol = Math.max(0, Math.floor(x / charWidth));
    // sum lengths of previous lines + clamp to line length
    let idx = 0;
    for(let i=0;i<targetLine;i++) idx += lines[i].length + 1; // +1 for newline
    idx += Math.min(approxCol, lines[targetLine].length);
    return Math.max(0, Math.min(idx, textarea.value.length));
  }catch(e){ return textarea.selectionStart || 0; }
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showMessage(text, title = 'Notice'){
  // Prefer top-bar notifications for non-blocking UX when available
  try{
    if(window.AppUtils && AppUtils.Notify){
      const t = (title||'').toLowerCase();
      if(t.includes('error') || t.includes('invalid')) return AppUtils.Notify.error(escapeHtml(text));
      if(t.includes('saved') || t.includes('bound') || t.includes('success')) return AppUtils.Notify.success(escapeHtml(text));
      return AppUtils.Notify.info(escapeHtml(text));
    }
  }catch(e){ /* ignore and fallback */ }

  // fallback to modal if available, else alert
  if(window.AppUtils && AppUtils.Modal){
    AppUtils.Modal.show({ title, body: escapeHtml(text) });
  } else {
    alert(text);
  }
}

// NOTE: Preview injection removed — live preview should show the original page without admin styling.

async function api(path, options={}){
  const res = await fetch(path, options);
  const ct = (res.headers.get('content-type')||'').toLowerCase();
  const result = { status: res.status, headers: res.headers };
  if(ct.includes('application/json')){
    result.body = await res.json();
  } else {
    result.body = await res.text();
  }
  // return a small wrapper to keep previous usage where api(...) returned body directly
  return result.body;
}

async function loadSites(){
  try{ sites = await api('/api/sites') || []; }catch(e){ console.error(e); sites = []; }
  await renderSiteList();
  // auto-select first site if none selected to populate editor
  if(!selectedSite && sites && sites.length>0){
    await selectSite(sites[0].name);
  }
}

async function renderSiteList(){
  const ul = qs('#siteList'); if(!ul) return;
  ul.innerHTML = '';
  sites.forEach(s => {
    const li = document.createElement('li');
    li.textContent = s.name;
    li.style.display = 'flex'; li.style.justifyContent = 'space-between'; li.style.alignItems = 'center';
    // clicking the list item opens the site
    li.addEventListener('click', ()=> selectSite(s.name));
    if(selectedSite && selectedSite.name === s.name) li.classList.add('active');
    ul.appendChild(li);
  });
}

async function loadPageIntoEditor(path, siteName){
  try{
    const content = await api(`/api/sites/${siteName}/pages/content?path=${encodeURIComponent(path)}`);
    const sel = qs('#pageSelect'); if(sel) sel.value = path;
    const editor = qs('#pageEditor'); if(editor){ editor.value = content; }
    const preview = qs('#previewFrame'); if(preview){ preview.src = `/site/${siteName}/${path}`; }
  }catch(e){ showMessage('Could not load page content', 'Error'); console.error(e); }
}

async function selectSite(name){
  selectedSite = await api(`/api/sites/${name}`) || null;
  await renderSiteList();
  await renderSiteDetails();
}

async function renderSiteDetails(){
  if(!selectedSite) return;
  qs('#siteActions').textContent = `Selected: ${selectedSite.name}`;
  const apiList = qs('#apiList'); apiList.innerHTML='';
  (selectedSite.apis||[]).forEach(a=>{
    const div = document.createElement('div'); div.className='item';
    const left = document.createElement('div'); left.innerHTML = `<strong>${a.name}</strong><div class="meta">${a.method} • ${a.url}</div>`;
    const right = document.createElement('div'); right.innerHTML = `<button class="btn small" data-api="${a.name}">Test</button>`;
    div.appendChild(left); div.appendChild(right);
    apiList.appendChild(div);
  });

  // mappings are now auto-created from palette drops and visual editor bindings

  const preview = qs('#previewFrame'); if(preview){ preview.src = `/site/${selectedSite.name}/`; }
  const pl = qs('#previewLink'); if(pl) pl.href = `/site/${selectedSite.name}/`;

  try{
    const pages = await api(`/api/sites/${selectedSite.name}/pages`);
    const sel = qs('#pageSelect'); if(sel){ sel.innerHTML=''; pages.forEach(p=>{ const o = document.createElement('option'); o.value=p; o.textContent=p; sel.appendChild(o); }); }
    // auto-load first page if editor is empty
    try{
      const editor = qs('#pageEditor');
      if(pages && pages.length>0 && editor && (!editor.value || editor.value.trim().length===0)){
        await loadPageIntoEditor(pages[0], selectedSite.name);
      }
    }catch(e){ /* ignore */ }
  }catch(e){ console.warn('could not load pages', e); }

  // render full folder/file tree inside siteFileTree
  try{
    const tree = await api(`/api/sites/${selectedSite.name}/tree`);
    const container = qs('#siteFileTree'); if(container){
      container.innerHTML = '';
      function renderNode(node, parentEl){
        const nodeEl = document.createElement('div');
        nodeEl.className = node.type === 'dir' ? 'fm-dir' : 'fm-file';
        nodeEl.style.padding = '4px 6px';
        nodeEl.style.cursor = 'pointer';
        nodeEl.title = node.path;
        if(node.type === 'dir'){
          const label = document.createElement('div'); label.textContent = node.name; label.style.fontWeight='600';
          const childrenWrap = document.createElement('div'); childrenWrap.style.marginLeft='12px'; childrenWrap.style.display = 'none';
          label.onclick = (ev)=>{ ev.stopPropagation(); childrenWrap.style.display = childrenWrap.style.display === 'none' ? 'block' : 'none'; };
          nodeEl.appendChild(label);
          nodeEl.appendChild(childrenWrap);
          (node.children||[]).forEach(ch=> renderNode(ch, childrenWrap));
        } else {
          nodeEl.textContent = node.name;
          nodeEl.onclick = async (ev)=>{ ev.stopPropagation(); const sel = qs('#pageSelect'); if(sel) sel.value = node.path; await loadPageIntoEditor(node.path, selectedSite.name); };
        }
        parentEl.appendChild(nodeEl);
      }
      (tree||[]).forEach(n=> renderNode(n, container));
    }
  }catch(err){ console.warn('could not load site tree', err); }

  try{
    const data = await api(`/api/sites/${selectedSite.name}/data`);
    latestAggregatedData = data || {};
    renderDataPalette(data || {});
  }catch(e){ console.warn('could not load data palette', e); }
}

// Visual Editor (GrapesJS) integration
async function openVisualEditor(){
  if(!selectedSite){ showMessage('Select a site first','Error'); return; }
  const path = qs('#pageSelect').value || 'index.html';
  let content = '';
  try{ content = await api(`/api/sites/${selectedSite.name}/pages/content?path=${encodeURIComponent(path)}`) || ''; }catch(e){ content = '<div><h2>New page</h2></div>'; }

  const modal = qs('#gjs-modal'); if(!modal) return; modal.style.display = 'block';
  if(window.editorInstance){ window.editorInstance.destroy(); window.editorInstance = null; }
  const editor = grapesjs.init({ container: '#gjs', fromElement: false, height: '100%', storageManager: { autoload: false }, components: content, blockManager: { appendTo: '#gjs' } });
  window.editorInstance = editor;

  const bm = editor.BlockManager;
  bm.add('input-text', { label: 'Text field', category: 'Forms', content: '<input type="text" class="form-input" placeholder="Text" />' });
  bm.add('textarea', { label: 'Textarea', category: 'Forms', content: '<textarea class="form-textarea"></textarea>' });
  bm.add('select', { label: 'Dropdown', category: 'Forms', content: '<select class="form-select"><option>Option 1</option></select>' });
  bm.add('button', { label: 'Button', category: 'Basic', content: '<button class="btn">Submit</button>' });

  editor.on('component:selected', (model) => {
    const comp = model;
    // simple binding trait UI creation
    const tm = editor.TraitManager;
    tm.addType('api-bind', {
      events: { 'change': 'onChange' },
      getInputEl: function(){ const el = document.createElement('div'); el.innerHTML = `<div style="display:flex;gap:8px"><select id="_api_select"><option value="">(no bind)</option></select><input id="_api_path" placeholder="path.to.value" style="flex:1"/></div><div style="margin-top:6px"><button id="_bind_btn" class="btn small">Bind</button></div>`; return el; },
      onEvent: function(e){}, onChange: function(){}
    });
    const sel = document.getElementById('_api_select'); if(sel){ sel.innerHTML = '<option value="">(no bind)</option>'; (selectedSite.apis||[]).forEach(a=>{ const o=document.createElement('option'); o.value=a.name; o.textContent=a.name; sel.appendChild(o); }); }
    setTimeout(()=>{ const btn = document.getElementById('_bind_btn'); if(btn) btn.onclick = ()=>{ const apiName = document.getElementById('_api_select').value; const path = document.getElementById('_api_path').value.trim(); if(!apiName || !path){ showMessage('Select API and path','Input required'); return; } comp.addAttributes({ 'data-bind-api': apiName, 'data-bind-path': path }); showMessage('Bound component to ' + apiName + ' -> ' + path + '\nOn save the mapping will be created for this page.', 'Bound'); }; }, 100);
  });

  qs('#saveVisualBtn').onclick = async ()=>{
    const html = editor.getHtml(); const css = editor.getCss();
    const out = `<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`;
    await fetch(`/api/sites/${selectedSite.name}/pages/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ path, content: out })});
    const mappings = [];
    function walkModels(models){ models.each && models.each(m=>{ const attrs = m.attributes && m.attributes.attributes ? m.attributes.attributes : (m.attributes || {}); if(attrs['data-bind-api'] && attrs['data-bind-path']) mappings.push({ placeholder: `${attrs['data-bind-api']}_${attrs['data-bind-path'].replace(/\W+/g,'_')}`, apiName: attrs['data-bind-api'], jsonPath: attrs['data-bind-path'] }); if(m.components && m.components.length) walkModels(m.components); }); }
    walkModels(editor.getWrapper().components());
    for(const mm of mappings){ await fetch(`/api/sites/${selectedSite.name}/mappings`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ placeholder: mm.placeholder, apiName: mm.apiName, jsonPath: mm.jsonPath, pages: [path] })}); }
    showMessage('Saved visual page and created ' + mappings.length + ' mappings for this page.', 'Saved');
    await selectSite(selectedSite.name);
    // refresh preview to show updated visual save
    try{ const pf = qs('#previewFrame'); if(pf) pf.src = `/site/${selectedSite.name}/${path}?t=${Date.now()}`; }catch(e){}
    modal.style.display = 'none';
  };
  qs('#closeVisualBtn').onclick = ()=>{ modal.style.display = 'none'; if(window.editorInstance){ window.editorInstance.destroy(); window.editorInstance=null; } };
}

async function testApi(apiDef){
  try{
    if(!selectedSite){ showMessage('Select a site first','Error'); return; }
    AppUtils.Loader.show('Testing API...');
    const resp = await fetch(`/api/sites/${selectedSite.name}/endpoints/${encodeURIComponent(apiDef.name)}/execute`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({}) });
    AppUtils.Loader.hide();
    let body;
    try{ body = await resp.json(); }catch(e){ body = await resp.text(); }
      const html = `<div style="max-height:60vh;overflow:auto"><pre class="api-body-pre">${escapeHtml(typeof body === 'string' ? body : JSON.stringify(body, null, 2))}</pre></div>`;
    AppUtils.Modal.show({ title: `Endpoint: ${apiDef.name} — status ${resp.status}`, body: html });
    console.log('endpoint execute result', body);
  }catch(err){ AppUtils.Loader.hide(); console.error(err); AppUtils.Modal.show({ title: 'Error', body: escapeHtml(err.message || String(err)) }); }
}

function renderDataPalette(data){
  const container = qs('#dataPalette'); if(!container) return; container.innerHTML='';
  // Render an expandable tree grouped by API root keys.
  function renderNode(key, nodeData, parentEl, fullPath){
    const row = document.createElement('div'); row.className = 'tree-node';
    const label = document.createElement('div'); label.className = 'node-label';
    // mark type for styling: arrays, objects, or value
    try{
      if(Array.isArray(nodeData)) label.classList.add('type-array');
      else if(nodeData && typeof nodeData === 'object') label.classList.add('type-object');
      else label.classList.add('type-value');
    }catch(e){}
    const toggle = document.createElement('span'); toggle.className = 'node-toggle';
    toggle.textContent = nodeData && (Array.isArray(nodeData) ? '▸' : (nodeData && typeof nodeData === 'object' ? '▸' : ''));
    label.appendChild(toggle);
    const text = document.createElement('span'); text.className = 'node-text';
    // helper to format sample values
    function displaySample(v){ try{ if(v === null) return 'null'; if(v === undefined) return ''; if(typeof v === 'object') return JSON.stringify(v); return String(v); }catch(e){ return String(v); } }
    let sampleText = '';
    if(nodeData !== null && nodeData !== undefined && !Array.isArray(nodeData) && typeof nodeData !== 'object'){
      sampleText = displaySample(nodeData);
    } else if(Array.isArray(nodeData)){
      if(nodeData.length>0){ sampleText = displaySample(nodeData[0]); }
    } else if(nodeData && typeof nodeData === 'object'){
      // show small sample of object (first few keys)
      const keys = Object.keys(nodeData).slice(0,3);
      if(keys.length) sampleText = '{' + keys.map(k=>`${k}: ${displaySample(nodeData[k])}`).join(', ') + (Object.keys(nodeData).length>3 ? ', …' : '') + '}';
    }
    const keySpan = document.createElement('span'); keySpan.textContent = key + (Array.isArray(nodeData) ? ' (array)' : (nodeData && typeof nodeData === 'object' ? ' (object)' : ''));
    label.appendChild(keySpan);
    if(sampleText){ const s = document.createElement('span'); s.className='node-sample'; s.textContent = ` — ${sampleText}`; label.appendChild(s); }

    // drag behavior
    label.draggable = true;
    label.addEventListener('dragstart', (e)=>{
      const payload = { apiPath: fullPath, type: Array.isArray(nodeData) ? 'array' : (nodeData && typeof nodeData === 'object' ? 'object' : 'value') };
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      // also set text/plain for fallback
      if(payload.type === 'array') e.dataTransfer.setData('text/plain', `{{#each ${fullPath}}}`);
      else e.dataTransfer.setData('text/plain', `{{${fullPath}}}`);
    });

    row.appendChild(label);
    parentEl.appendChild(row);

    if(nodeData && typeof nodeData === 'object'){
      const childrenWrap = document.createElement('div'); childrenWrap.className = 'node-children';
      childrenWrap.style.display = 'none';
      row.appendChild(childrenWrap);
      toggle.style.cursor = 'pointer';
      toggle.onclick = (ev)=>{ ev.stopPropagation(); childrenWrap.style.display = childrenWrap.style.display === 'none' ? 'block' : 'none'; toggle.textContent = childrenWrap.style.display === 'none' ? '▸' : '▾'; };

      if(Array.isArray(nodeData)){
        // if array of objects, render keys from first element as available fields
        if(nodeData.length > 0 && typeof nodeData[0] === 'object'){
          for(const k of Object.keys(nodeData[0])){
            renderNode(k, nodeData[0][k], childrenWrap, fullPath + '.' + k);
          }
        }
      } else {
        for(const k of Object.keys(nodeData)){
          renderNode(k, nodeData[k], childrenWrap, fullPath ? `${fullPath}.${k}` : k);
        }
      }
    }
  }

  container.classList.add('data-tree');
  container.innerHTML = '';
  for(const apiName of Object.keys(data||{})){
    const rootWrap = document.createElement('div'); rootWrap.className = 'tree-root';
    renderNode(apiName, data[apiName], rootWrap, apiName);
    container.appendChild(rootWrap);
  }
}

// Create site — open modal from button, modal handles creation
const createBtn = qs('#createSiteBtn');
const createModal = qs('#createSiteModal');
const modalInput = qs('#modalSiteNameInput');
const modalCreate = qs('#createSiteModalCreate');
const modalCancel = qs('#createSiteModalCancel');
const modalClose = qs('#createSiteModalClose');
if(createBtn){ createBtn.addEventListener('click', ()=>{ if(createModal) { createModal.style.display = 'flex'; setTimeout(()=>{ try{ modalInput && modalInput.focus(); }catch(e){} },50); } }); }
if(modalCancel) modalCancel.addEventListener('click', ()=>{ if(createModal) createModal.style.display = 'none'; });
if(modalClose) modalClose.addEventListener('click', ()=>{ if(createModal) createModal.style.display = 'none'; });
if(modalCreate) modalCreate.addEventListener('click', async ()=>{
  try{
    const name = modalInput && modalInput.value && modalInput.value.trim();
    if(!name){ showMessage('Enter site name','Input required'); return; }
    await fetch('/api/sites', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    if(modalInput) modalInput.value = '';
    if(createModal) createModal.style.display = 'none';
    await loadSites();
    try{ await selectSite(name); }catch(e){}
    showMessage('Created site: ' + name, 'Saved');
  }catch(err){ console.error(err); showMessage('Could not create site','Error'); }
});

// Removed redundant newSiteBtn handler — Create Site button opens the modal

// Create new HTML page for selected site with demo content
const createPageBtn = qs('#createPageBtn'); if(createPageBtn) createPageBtn.addEventListener('click', async ()=>{
  if(!selectedSite){ showMessage('Select a site first','Error'); return; }
  let name = (qs('#newPageNameInput') && qs('#newPageNameInput').value.trim()) || '';
  if(!name) name = `new-page-${Date.now()}.html`;
  // ensure .html extension
  if(!name.toLowerCase().endsWith('.html')) name = name + '.html';
  const demo = `<!doctype html>\n<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Demo Page</title><style>body{font-family:Inter,system-ui,Arial;background:#f8fafc;color:#0f1724;padding:24px}h1{color:#0b61ff}</style></head><body><h1>Demo Page</h1><p>This is a starter page. Drag variables from the palette into this content to bind API values.</p><div style="margin-top:18px;"><!-- Example placeholder: {{apiName.path}} --></div></body></html>`;
  try{
    await fetch(`/api/sites/${selectedSite.name}/pages/save`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ path: name, content: demo }) });
    showMessage('Created page: ' + name, 'Saved');
    qs('#newPageNameInput').value = '';
    // refresh site details and open the new page in the editor
    await selectSite(selectedSite.name);
    await loadPageIntoEditor(name, selectedSite.name);
  }catch(e){ console.error(e); showMessage('Could not create page','Error'); }
});

// Add API
const addApiBtn = qs('#addApiBtn'); if(addApiBtn) addApiBtn.addEventListener('click', async ()=>{
  if(!selectedSite){ showMessage('Select a site first','Error'); return; }
  const name = qs('#apiNameInput').value.trim(); const url = qs('#apiUrlInput').value.trim(); const method = (qs('#apiMethodSelect') && qs('#apiMethodSelect').value) ? qs('#apiMethodSelect').value : 'GET';
  let headers = {}; try{ headers = JSON.parse(qs('#apiHeadersInput').value || '{}'); }catch(e){ showMessage('Invalid headers JSON','Input error'); return; }
  let params = {}; try{ params = JSON.parse(qs('#apiParamsInput').value || '{}'); }catch(e){ showMessage('Invalid params JSON','Input error'); return; }
  const bodyTemplate = qs('#apiBodyInput').value || null; if(!name || !url){ showMessage('Provide API name and URL','Input required'); return; }
  await fetch(`/api/sites/${selectedSite.name}/apis`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,url,method,headers,params,bodyTemplate})});
  qs('#apiNameInput').value=''; qs('#apiUrlInput').value=''; qs('#apiHeadersInput').value=''; qs('#apiParamsInput').value=''; qs('#apiBodyInput').value=''; await selectSite(selectedSite.name);
});

// manual mapping UI removed — mappings are created automatically from palette drops and visual editor bindings

// Test endpoint execution for APIs (delegated)
const apiListEl = qs('#apiList'); if(apiListEl) apiListEl.addEventListener('click', async (e)=>{ const btn = e.target.closest('button'); if(!btn || !btn.dataset.api) return; const apiName = btn.dataset.api; if(!selectedSite) { showMessage('Select a site first','Error'); return; } try{ AppUtils.Loader.show('Testing API...'); const resp = await fetch(`/api/sites/${selectedSite.name}/endpoints/${encodeURIComponent(apiName)}/execute`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}); AppUtils.Loader.hide(); let body; try{ body = await resp.json(); }catch(e){ body = await resp.text(); } AppUtils.Modal.show({ title:`Endpoint: ${apiName} — status ${resp.status}`, body: `<pre class="api-body-pre">${escapeHtml(typeof body === 'string' ? body : JSON.stringify(body, null, 2))}</pre>` }); console.log('endpoint execute result', body); }catch(err){ AppUtils.Loader.hide(); console.error(err); AppUtils.Modal.show({ title:'Error', body: escapeHtml(err.message || String(err)) }); } });

// Pages editor handlers
const loadPageBtn = qs('#loadPageBtn'); if(loadPageBtn) loadPageBtn.addEventListener('click', async ()=>{ if(!selectedSite) { showMessage('Select a site first','Error'); return; } const path = qs('#pageSelect').value; if(!path){ showMessage('Pick a page','Input required'); return; } try{ const content = await api(`/api/sites/${selectedSite.name}/pages/content?path=${encodeURIComponent(path)}`); qs('#pageEditor').value = content; }catch(e){ showMessage('Could not load page', 'Error'); console.error(e); } });

const savePageBtn = qs('#savePageBtn'); if(savePageBtn) savePageBtn.addEventListener('click', async ()=>{ if(!selectedSite) { showMessage('Select a site first','Error'); return; } const path = qs('#pageSelect').value; if(!path){ showMessage('Pick a page','Input required'); return; } const content = qs('#pageEditor').value; await fetch(`/api/sites/${selectedSite.name}/pages/save`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,content})}); showMessage('Saved','Saved'); const pf = qs('#previewFrame'); if(pf){
    // reload preview with cache-buster to ensure latest content is shown
    try{ const base = `/site/${selectedSite.name}/${path}`; pf.src = `${base}?t=${Date.now()}`; }catch(e){ pf.src = pf.src; }
  }
});

const previewBtn = qs('#previewRenderedBtn'); if(previewBtn) previewBtn.addEventListener('click', ()=>{ if(!selectedSite){ showMessage('Select a site first','Error'); return; } const path = qs('#pageSelect').value || 'index.html'; window.open(`/site/${selectedSite.name}/${path}`, '_blank'); });

// Drag & drop into textarea — auto-create mappings for simple {{api.path}} placeholders
const editorEl = qs('#pageEditor');
if(editorEl){
  // compute drop index on dragover so the caret feels responsive
  let _lastDropIndex = null;
  editorEl.addEventListener('dragover', e=>{
    e.preventDefault();
    try{ _lastDropIndex = getCaretIndexFromCoords(editorEl, e.clientX, e.clientY); }catch(err){ _lastDropIndex = editorEl.selectionStart || 0; }
  });
  editorEl.addEventListener('drop', async (e)=>{
    e.preventDefault();
    // Prefer JSON payload set by palette tree
    let text = e.dataTransfer.getData('application/json');
    let payload = null;
    if(text){ try{ payload = JSON.parse(text); }catch(err){ payload = null; } }
    if(!payload){ text = e.dataTransfer.getData('text/plain'); }
    // use last computed drop index from dragover; fallback to current selection
    const start = (typeof _lastDropIndex === 'number' && _lastDropIndex >= 0) ? _lastDropIndex : (editorEl.selectionStart || 0);
    const end = editorEl.selectionEnd || start;
    const val = editorEl.value;
    // If payload indicates an array or object drop, insert a loop stub with markers and show an inline Loop Builder UI
    if(payload && (payload.type === 'array' || payload.type === 'object')){
      const apiPath = payload.apiPath;
      let sample = getValueFromLatest(apiPath);
      if(Array.isArray(sample)) sample = sample.length>0 ? sample[0] : {};
      if(!sample || typeof sample !== 'object') sample = {};
      const keys = Object.keys(sample);

      // determine loop path (prefer parent array if exists)
      const guessedLoopPath = (()=>{
        const parts = apiPath.split('.');
        for(let i=parts.length;i>0;i--){
          const candidate = parts.slice(0,i).join('.');
          const v = getValueFromLatest(candidate);
          if(Array.isArray(v)) return candidate;
        }
        return apiPath;
      })();

      const id = 'loop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
      const startMarker = `<!-- LOOP_START:${id}:${guessedLoopPath} -->`;
      const endMarker = `<!-- LOOP_END:${id} -->`;
      const inner = `  <div class=\"loop-item\">\n    <!-- fields go here -->\n  </div>`;
      const snippet = `{{#each ${guessedLoopPath}}}\n${startMarker}\n${inner}\n${endMarker}\n{{/each}}`;

      // insert snippet into editor
      const newVal = val.slice(0,start) + snippet + val.slice(end);
      editorEl.value = newVal;

      // ensure there's a container for loop builders
      let buildersWrap = qs('#loopBuilders');
      if(!buildersWrap){ buildersWrap = document.createElement('div'); buildersWrap.id = 'loopBuilders'; const pageCard = qs('#cardPages'); pageCard.appendChild(buildersWrap); }

      // create builder UI
      const builder = document.createElement('div'); builder.className = 'loop-builder'; builder.dataset.loopId = id;
      builder.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>Loop:</strong> ${guessedLoopPath}</div><div><button class=\"btn small done-loop\">Done</button></div></div><div style=\"margin-top:8px;display:flex;gap:8px;align-items:center\"><select class=\"loop-field-select\"></select><button class=\"btn small add-field\">Add Field</button></div><div class=\"loop-preview muted\" style=\"margin-top:8px;font-size:0.9rem\">Inserted loop id: ${id}</div>`;
      buildersWrap.appendChild(builder);

      const select = builder.querySelector('.loop-field-select');
      function displaySample(v){ try{ if(v === null || v === undefined) return String(v); if(typeof v === 'object') return JSON.stringify(v); return String(v); }catch(e){ return String(v); } }
      keys.forEach(k=>{ const o = document.createElement('option'); o.value = k; const sampleVal = (sample && sample.hasOwnProperty(k)) ? displaySample(sample[k]) : ''; o.textContent = sampleVal ? `${k} — ${sampleVal}` : k; select.appendChild(o); });
      // show key/value pairs preview
      const preview = builder.querySelector('.loop-preview');
      if(preview){ preview.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Sample values</div>' + (keys.length ? keys.map(k=>`<div><code>${k}</code>: <span style="color:var(--muted)">${displaySample(sample[k])}</span></div>`).join('') : '<div class="muted">No sample values</div>'); }

      builder.querySelector('.add-field').onclick = ()=>{
        const field = select.value;
        if(!field) return;
        // insert {{this.field}} into the loop body (before endMarker)
        const current = editorEl.value;
        const sIdx = current.indexOf(startMarker);
        const eIdx = current.indexOf(endMarker);
        if(sIdx === -1 || eIdx === -1 || eIdx < sIdx){ showMessage('Could not find loop in editor', 'Error'); return; }
        const before = current.slice(0, eIdx);
        const after = current.slice(eIdx);
        const insertHtml = `    <div><strong>${field}:</strong> {{this.${field}}}</div>\n`;
        const updated = before + insertHtml + after;
        editorEl.value = updated;
        // move caret to end of inserted field
        const newPos = before.length + insertHtml.length;
        editorEl.selectionStart = editorEl.selectionEnd = newPos;
        builder.querySelector('.loop-preview').textContent = `Added field: ${field}`;
      };

      builder.querySelector('.done-loop').onclick = ()=>{ builder.remove(); };

      showMessage('Inserted loop for ' + guessedLoopPath + '. Use the Loop Builder below to add fields.', 'Loop inserted');
      return;
    }

    // If payload indicates a field or value, insert context-aware placeholder
    if(payload && payload.type){
      const fullPath = payload.apiPath; // full dotted path
      // determine if we are inside a nearest unclosed each block
      const before = val.slice(0, start);
      const lastOpen = before.lastIndexOf('{{#each');
      const lastClose = before.lastIndexOf('{{/each}}');
      const insideLoop = lastOpen > lastClose;
      let insertText = '';
      if(insideLoop){
        // insert this.field usage
        // for a field fullPath like apiName.items.name, we take the last segment as field
        const parts = fullPath.split('.');
        const field = parts[parts.length-1];
        insertText = `{{this.${field}}}`;
      } else {
        insertText = `{{${fullPath}}}`;
      }
      const newVal = val.slice(0,start) + insertText + val.slice(end);
      editorEl.value = newVal;
      const pos = start + insertText.length;
      editorEl.selectionStart = editorEl.selectionEnd = pos;
      return;
    }

    // Fallback: insert plain text
    const fallback = text || '';
    editorEl.value = val.slice(0,start) + fallback + val.slice(end);
    const pos = start + fallback.length;
    editorEl.selectionStart = editorEl.selectionEnd = pos;
  });
}

// Guided tour removed — Intro.js usage and UI were removed per request.

// Quick search
const searchInput = qs('#searchInput'); if(searchInput) searchInput.addEventListener('input', (e)=>{ const q = e.target.value.trim().toLowerCase(); if(!q){ renderSiteList(); return; } const filtered = sites.filter(s=> s.name.toLowerCase().includes(q)); const ul = qs('#siteList'); ul.innerHTML=''; filtered.forEach(s=>{ const li = document.createElement('li'); li.textContent=s.name; li.addEventListener('click', ()=> selectSite(s.name)); ul.appendChild(li); }); });

// initial load
loadSites();

// Open visual editor button
const openVisualBtn = qs('#openVisualEditor'); if(openVisualBtn) openVisualBtn.addEventListener('click', ()=> openVisualEditor());

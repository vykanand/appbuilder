const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

// Top-level state
let sites = [];
let selectedSite = null;
let latestAggregatedData = {};
const apiSampleCache = {};

// If AppUtils.Logger is available (utils.js loads before this), wire console methods to it
if(window.AppUtils && AppUtils.Logger){
  const L = AppUtils.Logger;
  console.log = (...a)=> L.log(...a);
  console.info = (...a)=> L.info(...a);
}

// Helper: generate API form HTML for forms inserted into pages or the visual editor
function generateApiFormHtml(apiName, method, fields = [], payload = {}, mapping = null, siteName = ''){
  const formId = 'abform_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
  const sourceFields = Array.isArray(fields) ? fields : (payload && typeof payload === 'object' ? Object.keys(payload) : []);
  const mappings = mapping && Array.isArray(mapping.fieldMappings) ? mapping.fieldMappings : null;

  const buildField = (f, map) => {
    const safeName = String(f).replace(/"/g, '&quot;');
    const safeLoc = (map && map.location) ? map.location : 'body';
    let inputType = 'text';
    if(payload && payload[f] !== undefined){ const v = payload[f]; if(typeof v === 'number') inputType = 'number'; else if(typeof v === 'boolean') inputType = 'checkbox'; else if(String(v).includes('@')) inputType = 'email'; }
    if(inputType === 'checkbox'){
      return `<div style="margin-bottom:8px"><label><input type=\"checkbox\" name=\"${safeName}\" data-field=\"${safeName}\" data-location=\"${safeLoc}\"> ${safeName}</label></div>`;
    }
    return `<div style="margin-bottom:12px"><label style=\"display:block;font-weight:600;margin-bottom:6px\">${safeName}</label><input type=\"${inputType}\" name=\"${safeName}\" data-field=\"${safeName}\" data-location=\"${safeLoc}\" style=\"width:100%;padding:10px;border:1px solid #ddd;border-radius:8px\" /></div>`;
  };

  let inputsHtml = '';
  if(mappings){ inputsHtml = mappings.map(m=> buildField(m.requestField, m)).join('\n'); }
  else { inputsHtml = (sourceFields.length ? sourceFields.map(f=> buildField(f, null)).join('\n') : '<p>No fields available</p>'); }

  const contentType = mapping && mapping.contentType ? mapping.contentType : 'application/json';
  const cfg = { rawBodyTemplate: mapping && mapping.rawBodyTemplate ? mapping.rawBodyTemplate : '' };
  const siteEsc = JSON.stringify(siteName || '');

  const script = `<script>(function(){var form=document.getElementById('${formId}'); if(!form) return; form.addEventListener('submit', async function(e){ e.preventDefault(); var queryParams = {}; var bodyData = {}; var inputs = form.querySelectorAll('input, textarea, select'); inputs.forEach(function(inp){ var field = inp.getAttribute('data-field') || inp.name; if(!field) return; var loc = inp.getAttribute('data-location') || 'body'; var val = (inp.type === 'checkbox') ? inp.checked : inp.value; if(loc === 'query') queryParams[field] = val; else bodyData[field] = val; }); try{ var qs = Object.keys(queryParams).length ? ('?' + Object.keys(queryParams).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(queryParams[k]); }).join('&')) : ''; var url = '/api/sites/' + encodeURIComponent(${siteEsc}) + '/endpoints/' + encodeURIComponent(${JSON.stringify(apiName)}) + '/execute' + qs; var headers = {}; var bodyPayload = null; var ct = ${JSON.stringify(contentType)}; if(ct === 'application/json' && ${JSON.stringify(Boolean(cfg.rawBodyTemplate))}){ var raw = document.getElementById('${formId}_raw'); if(raw) { bodyPayload = raw.value; headers['Content-Type']='application/json'; } else { bodyPayload = JSON.stringify(bodyData); headers['Content-Type']='application/json'; } } else if(ct === 'application/x-www-form-urlencoded'){ var params = new URLSearchParams(); Object.keys(bodyData).forEach(function(k){ params.append(k, bodyData[k]); }); bodyPayload = params.toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; } else if(ct === 'form-elements'){ bodyPayload = JSON.stringify(bodyData); headers['Content-Type']='application/json'; } else if(ct === 'query'){ bodyPayload = null; } else { bodyPayload = JSON.stringify(bodyData); headers['Content-Type']='application/json'; } var opts = { method: '${method}', headers: headers }; if(bodyPayload !== null) opts.body = bodyPayload; var resp = await fetch(url, opts); var text = null; try{ text = await resp.json(); }catch(e){ text = await resp.text(); } alert('Result: ' + JSON.stringify(text)); form.reset(); }catch(err){ console.error(err); alert('Error: ' + (err && err.message ? err.message : String(err))); } }); })();<\/script>`;

  const html = `<form id="${formId}" class="api-form" data-api="${apiName}" data-method="${method}" style="padding:16px;border:1px solid rgba(0,0,0,0.08);border-radius:12px;background:rgba(255,255,255,0.98);margin:16px 0">\n    <h3 style="margin:0 0 16px 0">${method} ${apiName}</h3>\n    ${inputsHtml}\n    <div style="display:flex;gap:8px"><button type="submit" class="btn">Submit</button><button type="reset" class="btn ghost">Reset</button></div>\n  </form>\n  ${script}`;
  return html;
}
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
    const left = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = a.name;
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = a.url;
    const methodBadge = document.createElement('span'); methodBadge.className = 'api-method-badge';
    const methodText = (a.method || 'GET').toUpperCase(); methodBadge.textContent = methodText;
    if(['POST','PUT','PATCH','DELETE'].includes(methodText)) methodBadge.classList.add('method-create'); else methodBadge.classList.add('method-fetch');
    // assemble left column: title, method badge, then url meta
    left.appendChild(title);
    left.appendChild(methodBadge);
    left.appendChild(meta);
    const right = document.createElement('div');
    right.innerHTML = `<button class="btn small" data-api="${a.name}">Test</button> <button class="btn small outline" data-edit-api="${a.name}">Edit</button>`;
    div.appendChild(left); div.appendChild(right);
    apiList.appendChild(div);
  });

  // mappings are now auto-created from palette drops and visual editor bindings

  const preview = qs('#previewFrame'); if(preview){ preview.src = `/site/${selectedSite.name}/`; }
  const pl = qs('#previewLink'); if(pl) pl.href = `/site/${selectedSite.name}/`;
  // (preview drop handling removed) drag->editor now creates forms for creation methods

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
// Live validation system
function createLiveValidator(apiDef, formElement){
  const validators = {};
  let bodySchema = {};
  try{
    if(apiDef.bodyTemplate){
      bodySchema = typeof apiDef.bodyTemplate === 'string' ? JSON.parse(apiDef.bodyTemplate) : apiDef.bodyTemplate;
    }
  }catch(e){}
  
  Object.keys(bodySchema).forEach(field => {
    const sampleValue = bodySchema[field];
    validators[field] = {
      type: typeof sampleValue,
      required: sampleValue !== null && sampleValue !== undefined,
      validate: (value) => {
        if(validators[field].required && !value) return { valid: false, error: 'Required field' };
        if(validators[field].type === 'number' && value && isNaN(Number(value))) return { valid: false, error: 'Must be a number' };
        if(validators[field].type === 'boolean' && value && !['true','false','0','1'].includes(String(value).toLowerCase())) return { valid: false, error: 'Must be true/false' };
        if(String(value).includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { valid: false, error: 'Invalid email format' };
        return { valid: true };
      }
    };
  });
  
  // Attach live validation to form inputs
  if(formElement){
    formElement.querySelectorAll('input, textarea, select').forEach(input => {
      const fieldName = input.getAttribute('name') || input.getAttribute('data-field');
      if(fieldName && validators[fieldName]){
        input.addEventListener('input', () => {
          const result = validators[fieldName].validate(input.value);
          const errorEl = input.parentElement.querySelector('.validation-error');
          if(!result.valid){
            if(!errorEl){
              const err = document.createElement('div');
              err.className = 'validation-error';
              err.textContent = result.error;
              input.parentElement.appendChild(err);
            } else {
              errorEl.textContent = result.error;
            }
            input.style.borderColor = '#ef4444';
          } else {
            if(errorEl) errorEl.remove();
            input.style.borderColor = '';
          }
        });
      }
    });
  }
  
  return validators;
}

// Component library: pre-built patterns
const ComponentLibrary = {
  crudTable: (apiName, fields) => {
    const compId = 'crud_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
    const headers = fields.map(f => `<th>${f}</th>`).join('');
    const cells = fields.map(f => `<td>{{this.${f}}}</td>`).join('');
    return `<div id="${compId}" class="crud-table-component" style="margin:20px 0;padding:16px;border:1px solid rgba(0,0,0,0.08);border-radius:12px;background:rgba(255,255,255,0.98)">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h3 style="margin:0">${apiName} Management</h3>
    <button onclick="document.getElementById('${compId}_addForm').style.display='block'" class="btn small">+ Add New</button>
  </div>
  <div id="${compId}_addForm" style="display:none;padding:12px;background:rgba(0,0,0,0.02);border-radius:8px;margin-bottom:12px">
    <form id="${compId}_form">${fields.map(f => `<div style="margin-bottom:8px"><label>${f}</label><input name="${f}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px"/></div>`).join('')}
      <button type="submit" class="btn small">Save</button>
      <button type="button" onclick="this.closest('form').reset();document.getElementById('${compId}_addForm').style.display='none'" class="btn small ghost">Cancel</button>
    </form>
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:rgba(0,0,0,0.04)">${headers}<th>Actions</th></tr></thead>
    <tbody>{{#each ${apiName}}}<tr style="border-bottom:1px solid rgba(0,0,0,0.06)">${cells}<td><button class="btn-edit" data-id="{{this.id}}">Edit</button> <button class="btn-delete" data-id="{{this.id}}">Delete</button></td></tr>{{/each}}</tbody>
  </table>
</div>`;
  },
  searchForm: (apiName) => {
    const formId = 'search_' + Date.now().toString(36);
    return `<form id="${formId}" class="search-form" style="display:flex;gap:8px;padding:12px;background:rgba(0,0,0,0.02);border-radius:8px;margin:16px 0">
  <input type="text" name="q" placeholder="Search ${apiName}..." style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px" />
  <button type="submit" class="btn">Search</button>
  <button type="reset" class="btn ghost">Clear</button>
</form>
<div id="${formId}_results"></div>`;
  },
  filterPanel: (fields) => {
    const panelId = 'filter_' + Date.now().toString(36);
    return `<div id="${panelId}" class="filter-panel" style="padding:16px;background:rgba(0,0,0,0.02);border-radius:12px;margin:16px 0">
  <h4 style="margin:0 0 12px 0">Filters</h4>
  ${fields.map(f => `<div style="margin-bottom:12px"><label style="display:block;margin-bottom:4px;font-weight:600">${f}</label><select name="filter_${f}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px"><option value="">All</option></select></div>`).join('')}
  <button onclick="applyFilters('${panelId}')" class="btn">Apply Filters</button>
</div>`;
  },
  pagination: (apiName) => {
    const pageId = 'page_' + Date.now().toString(36);
    return `<div id="${pageId}" class="pagination" style="display:flex;justify-content:center;align-items:center;gap:12px;padding:16px;margin:20px 0">
  <button onclick="prevPage('${pageId}')" class="btn small ghost">← Previous</button>
  <span id="${pageId}_info" style="font-weight:600">Page 1</span>
  <button onclick="nextPage('${pageId}')" class="btn small ghost">Next →</button>
</div>
<script>
let ${pageId}_current = 1;
function prevPage(id){ if(${pageId}_current > 1){ ${pageId}_current--; document.getElementById(id+'_info').textContent='Page '+${pageId}_current; loadPage${pageId}(${pageId}_current); }}
function nextPage(id){ ${pageId}_current++; document.getElementById(id+'_info').textContent='Page '+${pageId}_current; loadPage${pageId}(${pageId}_current); }
function loadPage${pageId}(page){ console.log('Load page', page); }
</script>`;
  }
};

// Field mapper UI
function showFieldMapper(apiName, apiDef, responseData){
  let requestFields = [];
  let responseFields = [];
  
  // Parse request schema
  if(apiDef && apiDef.bodyTemplate){
    try{
      const bodyObj = typeof apiDef.bodyTemplate === 'string' ? JSON.parse(apiDef.bodyTemplate) : apiDef.bodyTemplate;
      if(bodyObj && typeof bodyObj === 'object'){
        requestFields = Object.keys(bodyObj).map(k => ({ name: k, type: typeof bodyObj[k], sample: bodyObj[k], htmlType: inferHtmlType(bodyObj[k]) }));
      }
    }catch(e){}
  }
  
  // Parse response schema
  if(responseData && typeof responseData === 'object'){
    if(Array.isArray(responseData) && responseData.length > 0){
      responseFields = Object.keys(responseData[0]).map(k => ({ name: k, type: typeof responseData[0][k], sample: responseData[0][k] }));
    } else {
      responseFields = Object.keys(responseData).map(k => ({ name: k, type: typeof responseData[k], sample: responseData[k] }));
    }
  }
  
  function inferHtmlType(val){
    if(typeof val === 'number') return 'number';
    if(typeof val === 'boolean') return 'checkbox';
    if(String(val).includes('@')) return 'email';
    if(String(val).match(/^\d{4}-\d{2}-\d{2}/)) return 'date';
    return 'text';
  }
  
  const html = `
    <div class="field-mapper-panel" style="max-height:70vh;overflow:auto">
      <h3>Field Mapper: ${apiName}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px">
        <div class="mapper-section">
          <h4 style="color:var(--accent-2);margin-bottom:12px">Request Fields → Form Inputs</h4>
          ${requestFields.length ? `<div class="mapper-list">${requestFields.map(f => `
            <div class="mapper-item" style="padding:12px;background:rgba(79,70,229,0.06);border-left:4px solid var(--accent);border-radius:8px;margin-bottom:8px">
              <div style="font-weight:700;margin-bottom:4px">${f.name}</div>
              <div style="display:flex;gap:8px;align-items:center;color:var(--muted);font-size:0.9rem">
                <span>Type: <code>${f.type}</code></span>
                <span>→</span>
                <span>HTML: <code>&lt;input type="${f.htmlType}"&gt;</code></span>
              </div>
              <div style="margin-top:6px;padding:6px;background:rgba(0,0,0,0.04);border-radius:4px;font-size:0.85rem;font-family:monospace">Sample: ${escapeHtml(JSON.stringify(f.sample))}</div>
            </div>
          `).join('')}</div>` : '<div class="muted">No request fields defined</div>'}
        </div>
        <div class="mapper-section">
          <h4 style="color:var(--accent-2);margin-bottom:12px">Response Fields → Display Elements</h4>
          ${responseFields.length ? `<div class="mapper-list">${responseFields.map(f => `
            <div class="mapper-item" style="padding:12px;background:rgba(6,182,212,0.06);border-left:4px solid var(--accent-2);border-radius:8px;margin-bottom:8px">
              <div style="font-weight:700;margin-bottom:4px">${f.name}</div>
              <div style="color:var(--muted);font-size:0.9rem">Type: <code>${f.type}</code></div>
              <div style="margin-top:6px;padding:6px;background:rgba(0,0,0,0.04);border-radius:4px;font-size:0.85rem;font-family:monospace">Sample: ${escapeHtml(JSON.stringify(f.sample))}</div>
              <div style="margin-top:8px"><button class="btn small" onclick="insertField('${apiName}.${f.name}')">Insert {{${apiName}.${f.name}}}</button></div>
            </div>
          `).join('')}</div>` : '<div class="muted">No response data available</div>'}
        </div>
      </div>
      <div style="margin-top:20px;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px">
        <h4>Quick Actions</h4>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn small" onclick="generateFullForm('${apiName}')">Generate Complete Form</button>
          <button class="btn small outline" onclick="generateTableView('${apiName}')">Generate Table View</button>
        </div>
      </div>
    </div>
    <script>
    function insertField(path){ 
      const editor = document.getElementById('pageEditor'); 
      if(editor){ 
        const pos = editor.selectionStart || 0; 
        const val = editor.value; 
        editor.value = val.slice(0,pos) + '{{' + path + '}}' + val.slice(pos); 
        editor.focus(); 
      } 
    }
    function generateFullForm(api){ alert('Full form for ' + api + ' will be inserted into editor'); }
    function generateTableView(api){ alert('Table view for ' + api + ' will be inserted into editor'); }
    </script>
  `;
  
  AppUtils.Modal.show({ title: 'Field Mapper', body: html });
}

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
  
  // HTTP Method-specific blocks
  const apis = (selectedSite && selectedSite.apis) || [];
  
  // GET blocks - Data display components
  apis.filter(a => (a.method||'GET').toUpperCase() === 'GET').forEach(apiDef => {
    const fields = [];
    try{
      const sample = latestAggregatedData[apiDef.name];
      if(sample){
        if(Array.isArray(sample) && sample[0]) fields.push(...Object.keys(sample[0]));
        else if(typeof sample === 'object') fields.push(...Object.keys(sample));
      }
    }catch(e){}
    
    bm.add(`get-${apiDef.name}`, {
      label: `GET ${apiDef.name}`,
      category: 'GET Data Display',
      content: ComponentLibrary.crudTable(apiDef.name, fields.length ? fields : ['id','name','value'])
    });
  });
  
  // POST/PUT/PATCH blocks - Form components with safe field handling
  apis.filter(a => ['POST','PUT','PATCH'].includes((a.method||'GET').toUpperCase())).forEach(apiDef => {
    const method = (apiDef.method||'POST').toUpperCase();
    let fields = [];
    try{
      if(apiDef.bodyTemplate){
        const bodyObj = typeof apiDef.bodyTemplate === 'string' ? JSON.parse(apiDef.bodyTemplate) : apiDef.bodyTemplate;
        fields = Object.keys(bodyObj);
      }
    }catch(e){}
    
    // Use centralized generator to create form + submit script that respects mapping.contentType
    const mapping = (apiDef && apiDef.mappingConfig) ? apiDef.mappingConfig : null;
    const sample = (apiDef && apiDef.sample) ? apiDef.sample : null;
    const formHtml = generateApiFormHtml(apiDef.name, method, fields, sample, mapping, selectedSite ? selectedSite.name : '');
    bm.add(`${method.toLowerCase()}-${apiDef.name}`, {
      label: `${method} ${apiDef.name}`,
      category: `${method} Forms`,
      content: formHtml
    });
  });
  
  // DELETE blocks - Delete buttons
  apis.filter(a => (a.method||'GET').toUpperCase() === 'DELETE').forEach(apiDef => {
    const btnId = 'del_' + apiDef.name + '_' + Date.now().toString(36);
    bm.add(`delete-${apiDef.name}`, {
      label: `DELETE ${apiDef.name}`,
      category: 'DELETE Actions',
      content: `<button id="${btnId}" class="btn-delete" style="padding:10px 20px;background:#ef4444;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:600">Delete ${apiDef.name}</button>`
    });
  });
  
  // Component library blocks
  bm.add('search-form', { label: 'Search Form', category: 'Components', content: ComponentLibrary.searchForm('items') });
  bm.add('filter-panel', { label: 'Filter Panel', category: 'Components', content: ComponentLibrary.filterPanel(['status','category','date']) });
  bm.add('pagination', { label: 'Pagination', category: 'Components', content: ComponentLibrary.pagination('items') });
  
  // Basic form elements
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
  const meta = (data && data.__meta__) || {};

  function renderNode(key, nodeData, parentEl, fullPath, isRoot=false){
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
    const isTopLevelApi = isRoot || (parentEl && parentEl.classList && parentEl.classList.contains('tree-root'));
    const keySpan = document.createElement('span');
    // show method inline for top-level API nodes for clarity while populating the palette
    if(isTopLevelApi){
      const m = (meta[key] && meta[key].method) ? meta[key].method.toUpperCase() : '';
      if(m){
        const mi = document.createElement('span'); mi.className = 'method-inline'; mi.textContent = m; mi.style.marginRight = '8px'; mi.style.fontWeight = '700'; mi.style.padding = '4px 6px'; mi.style.borderRadius = '6px';
        // color lightly based on create vs fetch methods
        if(['POST','PUT','PATCH','DELETE'].includes(m)) { mi.style.background = 'linear-gradient(90deg,#fee2e2,#fecaca)'; mi.style.color = '#4a0b0b'; }
        else { mi.style.background = 'linear-gradient(90deg,#dcfce7,#bbf7d0)'; mi.style.color = '#07340f'; }
        label.appendChild(mi);
      }
    }
    keySpan.textContent = key + (Array.isArray(nodeData) ? ' (array)' : (nodeData && typeof nodeData === 'object' ? ' (object)' : ''));
    label.appendChild(keySpan);
    
    // Show API details panel for top-level nodes
    if(isTopLevelApi && meta[key]){
      const apiMeta = meta[key];
      const apiDef = selectedSite && selectedSite.apis ? selectedSite.apis.find(a => a.name === key) : null;
      const detailsBtn = document.createElement('button');
      detailsBtn.className = 'btn-icon-mini';
      detailsBtn.innerHTML = 'ⓘ';
      detailsBtn.title = 'Show API details';
      detailsBtn.style.marginLeft = 'auto';
      detailsBtn.onclick = async (ev) => {
        ev.stopPropagation();
        // fetch sample lazily when user asks for details
        const sample = await fetchApiSample(key) || nodeData;
        showApiDetails(key, apiMeta, apiDef, sample);
      };
      label.appendChild(detailsBtn);
    }
    // If this is a top-level API node, show a method/status badge
    if(parentEl && parentEl.classList && parentEl.classList.contains('tree-root')){
      const m = meta[key] || {};
      const badge = document.createElement('span'); badge.className = 'node-value-badge node-method-badge';
      const method = (m.method || '').toUpperCase();
      const status = m.status || '';
      badge.textContent = method ? `${method}${status ? ' • ' + status : ''}` : (status ? status : '');
      // add class for fetch vs create methods
      if(['POST','PUT','PATCH','DELETE'].includes(method)) badge.classList.add('method-create'); else badge.classList.add('method-fetch');
      label.appendChild(badge);
    }
    if(sampleText){ const s = document.createElement('span'); s.className='node-sample'; s.textContent = ` — ${sampleText}`; label.appendChild(s); }

    // drag behavior
    label.draggable = true;
    label.addEventListener('dragstart', (e)=>{
      // build a richer payload: if top-level API, include apiName and method and sample fields
      const isTop = parentEl && parentEl.classList && parentEl.classList.contains('tree-root');
      let payload = { apiPath: fullPath, type: Array.isArray(nodeData) ? 'array' : (nodeData && typeof nodeData === 'object' ? 'object' : 'value') };
      if(isTop){
        const m = meta[key] || {};
        // include sample data for fields if available
        let sample = nodeData;
        if(Array.isArray(nodeData)) sample = nodeData.length>0 ? nodeData[0] : {};
        const fields = (sample && typeof sample === 'object') ? Object.keys(sample) : [];
        // if the api has a saved mappingConfig, prefer those mapped request field names
        let mappingConfig = null;
        try{ if(selectedSite && selectedSite.apis){ const ad = selectedSite.apis.find(a=>a.name===key); if(ad && ad.mappingConfig) mappingConfig = ad.mappingConfig; } }catch(e){}
        if(mappingConfig && Array.isArray(mappingConfig.fieldMappings) && mappingConfig.fieldMappings.length){
          const mappedFields = mappingConfig.fieldMappings.map(fm=>fm.requestField);
          // include sample only if we have it cached; otherwise let drop handler fetch lazily
          const includeSample = apiSampleCache[key] ? apiSampleCache[key] : null;
          payload = Object.assign(payload, { apiName: key, method: (m.method || 'GET').toUpperCase(), url: (m.url||''), fields: mappedFields, mappingConfig, sample: includeSample });
        } else {
          const includeSample = apiSampleCache[key] ? apiSampleCache[key] : null;
          payload = Object.assign(payload, { apiName: key, method: (m.method || 'GET').toUpperCase(), url: (m.url||''), fields, sample: includeSample });
        }
      }
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      // also set text/plain for fallback / template insertion
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
            renderNode(k, nodeData[0][k], childrenWrap, fullPath + '.' + k, false);
          }
        }
      } else {
        for(const k of Object.keys(nodeData)){
          renderNode(k, nodeData[k], childrenWrap, fullPath ? `${fullPath}.${k}` : k, false);
        }
      }
    }
  }

  container.classList.add('data-tree');
  container.innerHTML = '';
  for(const apiName of Object.keys(data||{})){
    if(apiName === '__meta__') continue;
    const rootWrap = document.createElement('div'); rootWrap.className = 'tree-root';
    renderNode(apiName, data[apiName], rootWrap, apiName, true);
    container.appendChild(rootWrap);
  }
}

// Open mapping modal to let user pick response fields -> request fields and content type
function openApiMappingModal(apiName, apiDef, sample){
  if(!selectedSite){ showMessage('Select a site first','Error'); return; }
  // Normalize sample to an object (take first element if array)
  let s = sample;
  if(Array.isArray(s) && s.length>0) s = s[0];
  if(!s || typeof s !== 'object') s = (apiDef && apiDef.bodyTemplate && typeof apiDef.bodyTemplate === 'object') ? apiDef.bodyTemplate : {};

  const existing = (apiDef && apiDef.mappingConfig) ? apiDef.mappingConfig : null;
  const contentType = existing && existing.contentType ? existing.contentType : 'application/json';
  const fieldMap = existing && existing.fieldMappings ? existing.fieldMappings : [];
  const rawBodyTemplate = existing && existing.rawBodyTemplate ? existing.rawBodyTemplate : '';

  const keys = s && typeof s === 'object' ? Object.keys(s) : [];
  let rows = keys.map(k=>{
    const existingMap = fieldMap.find(fm=>fm.responsePath === k || fm.requestField === k) || {};
    const reqName = existingMap.requestField || k;
    const location = existingMap.location || 'body';
    const checked = (fieldMap.length===0) ? true : (existingMap ? true : false);
    return `<div class="map-row" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><label style="flex:0 0 auto"><input type=\"checkbox\" class=\"map-include\" data-path=\"${escapeHtml(k)}\" ${checked? 'checked' : ''}/> <code>${escapeHtml(k)}</code></label><input class=\"map-name\" data-path=\"${escapeHtml(k)}\" value=\"${escapeHtml(reqName)}\" style=\"flex:1;padding:6px;border:1px solid #ddd;border-radius:6px\"/><select class=\"map-location\" data-path=\"${escapeHtml(k)}\" style=\"width:160px;margin-left:8px;padding:6px;border:1px solid #ddd;border-radius:6px\"><option value=\"body\" ${location==='body' ? 'selected' : ''}>Body</option><option value=\"query\" ${location==='query' ? 'selected' : ''}>Query param</option></select></div>`;
  }).join('');
  if(rows.length===0) rows = '<div><em>No fields detected in sample.</em></div>';

  const html = `
    <div style="max-height:60vh;overflow:auto">
      <p>Map response fields to request parameter names and choose how the request body should be encoded when generating forms/snippets.</p>
      <div style="margin-bottom:8px"><label>Content type: <select id=\"ab_map_content_type\"><option value=\"application/json\" ${contentType==='application/json' ? 'selected' : ''}>Raw JSON body (application/json)</option><option value=\"application/x-www-form-urlencoded\" ${contentType==='application/x-www-form-urlencoded' ? 'selected' : ''}>Form URL-encoded (application/x-www-form-urlencoded)</option><option value=\"form-elements\" ${contentType==='form-elements' ? 'selected' : ''}>Individual form inputs (JSON body)</option><option value=\"query\" ${contentType==='query' ? 'selected' : ''}>Query parameters (?key=val)</option></select></label></div>
      <div id=\"ab_map_raw\" style=\"display:${contentType==='application/json' ? 'block' : 'none'};margin-bottom:10px\">
        <label style=\"display:block;margin-bottom:6px;font-weight:600\">Raw JSON body template</label>
        <textarea id=\"ab_map_raw_body\" style=\"width:100%;min-height:140px;padding:8px;border-radius:6px;border:1px solid #ddd\">${escapeHtml(rawBodyTemplate || (fieldMap && fieldMap.length ? JSON.stringify(fieldMap.reduce((acc, fm)=>{ acc[fm.requestField]=`{{${fm.responsePath}}}`; return acc; },{}), null, 2) : (s && typeof s === 'object' ? JSON.stringify((Array.isArray(s) ? s[0] : s) || {}, null, 2) : '')))}</textarea>
      </div>
      <div id=\"ab_map_rows\" style=\"display:${contentType==='application/json' ? 'none' : 'block'}\">${rows}</div>
      <div style=\"margin-top:12px;text-align:right\"><button id=\"ab_map_save\" class=\"btn\">Save</button> <button id=\"ab_map_cancel\" class=\"btn\">Cancel</button></div>
    </div>
  `;

  AppUtils.Modal.show({ title: `Map API: ${apiName}`, body: html });
  setTimeout(()=>{
    const saveBtn = qs('#ab_map_save'); const cancelBtn = qs('#ab_map_cancel');
    if(cancelBtn) cancelBtn.onclick = ()=>{ AppUtils.Modal.hide && AppUtils.Modal.hide(); };
    if(saveBtn) saveBtn.onclick = async ()=>{
      try{
        const ct = qs('#ab_map_content_type').value;
        let mappings = [];
        let rawTemplate = '';
        if(ct === 'application/json'){
          const ta = qs('#ab_map_raw_body'); rawTemplate = ta ? ta.value : '';
          mappings = fieldMap && fieldMap.length ? fieldMap : [];
        } else {
          const rows = Array.from(document.querySelectorAll('.map-row'));
          rows.forEach(r=>{
            const cb = r.querySelector('.map-include');
            const inp = r.querySelector('.map-name');
            const loc = r.querySelector('.map-location');
            if(cb && cb.checked){ const rp = cb.getAttribute('data-path'); const rf = inp && inp.value ? inp.value.trim() : rp; let location = loc && loc.value ? loc.value : 'body'; if(ct === 'query') location = 'query'; if(rf) mappings.push({ responsePath: rp, requestField: rf, location }); }
          });
        }
        const mappingConfig = { contentType: ct, fieldMappings: mappings };
        if(rawTemplate) mappingConfig.rawBodyTemplate = rawTemplate;
        AppUtils.Loader.show('Saving mapping...');
        const resp = await fetch(`/api/sites/${selectedSite.name}/apis/${encodeURIComponent(apiName)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ mappingConfig }) });
        AppUtils.Loader.hide();
        if(!resp.ok) { const txt = await resp.text(); throw new Error(txt || 'Save failed'); }
        const updated = await resp.json();
        if(selectedSite && selectedSite.apis){ const idx = selectedSite.apis.findIndex(a=>a.name===apiName); if(idx>=0) selectedSite.apis[idx] = updated; }
        try{ renderDataPalette(latestAggregatedData); }catch(e){}
        AppUtils.Modal.hide && AppUtils.Modal.hide();
        showMessage('Mapping saved', 'Saved');
      }catch(err){ AppUtils.Loader.hide(); console.error(err); showMessage('Could not save mapping: ' + (err && err.message ? err.message : ''),'Error'); }
    };
    // wire content-type change to toggle raw/template UI
    (function(){
      const sel = qs('#ab_map_content_type'); if(!sel) return;
      sel.addEventListener('change', ()=>{
        const v = sel.value;
        const raw = qs('#ab_map_raw'); const rowsWrap = qs('#ab_map_rows');
        if(raw) raw.style.display = (v === 'application/json') ? 'block' : 'none';
        if(rowsWrap) rowsWrap.style.display = (v === 'application/json') ? 'none' : 'block';
        const locs = document.querySelectorAll('.map-location');
        locs.forEach(function(l){ if(v === 'query'){ l.value = 'query'; l.disabled = true; } else { l.disabled = false; } });
      });
      // trigger initial toggle to ensure correct state
      const ev = new Event('change'); sel.dispatchEvent(ev);
    })();
  },80);
}

// Show detailed API information modal
function showApiDetails(apiName, apiMeta, apiDef, responseData){
  const method = (apiMeta.method || 'GET').toUpperCase();
  const url = apiMeta.url || (apiDef && apiDef.url) || '';
  const status = apiMeta.status || '';
  
  // Analyze response structure
  let responseFields = [];
  if(responseData && typeof responseData === 'object'){
    if(Array.isArray(responseData) && responseData.length > 0){
      responseFields = Object.keys(responseData[0]).map(k => ({ name: k, type: typeof responseData[0][k], sample: responseData[0][k] }));
    } else {
      responseFields = Object.keys(responseData).map(k => ({ name: k, type: typeof responseData[k], sample: responseData[k] }));
    }
  }
  
  // Get request body template if available
  let requestFields = [];
  if(apiDef && apiDef.bodyTemplate){
    try{
      const bodyObj = typeof apiDef.bodyTemplate === 'string' ? JSON.parse(apiDef.bodyTemplate) : apiDef.bodyTemplate;
      if(bodyObj && typeof bodyObj === 'object'){
        requestFields = Object.keys(bodyObj).map(k => ({ name: k, type: typeof bodyObj[k], sample: bodyObj[k] }));
      }
    }catch(e){}
  }
  
  // Get query params if available
  let queryParams = [];
  if(apiDef && apiDef.params){
    queryParams = Object.keys(apiDef.params).map(k => ({ name: k, value: apiDef.params[k] }));
  }
  
  const methodDesc = {
    'GET': 'Fetches data from the server. Use for reading/displaying information.',
    'POST': 'Creates new resources. Use for submitting forms and creating data.',
    'PUT': 'Updates existing resources (full replacement). Use for editing complete records.',
    'PATCH': 'Partially updates resources. Use for modifying specific fields.',
    'DELETE': 'Removes resources. Use for delete operations with confirmation.',
    'OPTIONS': 'Queries available methods. Use for CORS preflight.',
    'HEAD': 'Fetches headers only. Use for checking resource existence.'
  };
  
  let html = `
    <div class="api-details-panel">
      <div class="detail-section">
        <h4>Overview</h4>
        <div class="detail-row"><strong>Method:</strong> <span class="api-method-badge method-${['POST','PUT','PATCH','DELETE'].includes(method) ? 'create' : 'fetch'}">${method}</span></div>
        <div class="detail-row"><strong>URL:</strong> <code>${escapeHtml(url)}</code></div>
        <div class="detail-row"><strong>Status:</strong> ${status}</div>
        <div class="detail-row"><em>${methodDesc[method] || 'HTTP method'}</em></div>
      </div>
  `;
  
  if(queryParams.length > 0){
    html += `
      <div class="detail-section">
        <h4>Query Parameters</h4>
        <table class="detail-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            ${queryParams.map(p => `<tr><td><code>${escapeHtml(p.name)}</code></td><td>${escapeHtml(String(p.value))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  if(requestFields.length > 0){
    html += `
      <div class="detail-section">
        <h4>Request Body Fields</h4>
        <table class="detail-table">
          <thead><tr><th>Field</th><th>Type</th><th>Sample</th></tr></thead>
          <tbody>
            ${requestFields.map(f => `<tr><td><code>${escapeHtml(f.name)}</code></td><td>${f.type}</td><td>${escapeHtml(JSON.stringify(f.sample))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  if(responseFields.length > 0){
    html += `
      <div class="detail-section">
        <h4>Response Fields</h4>
        <table class="detail-table">
          <thead><tr><th>Field</th><th>Type</th><th>Sample</th></tr></thead>
          <tbody>
            ${responseFields.map(f => `<tr><td><code>${escapeHtml(f.name)}</code></td><td>${f.type}</td><td>${escapeHtml(JSON.stringify(f.sample))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  html += `
      <div class="detail-section">
        <h4>Drag & Drop Hints</h4>
        <ul class="hint-list">
          ${method === 'GET' ? '<li>Drag to editor to create a <strong>display component</strong> (table/list/cards)</li>' : ''}
          ${['POST','PUT','PATCH'].includes(method) ? '<li>Drag to editor to create a <strong>form</strong> with inputs for all fields</li>' : ''}
          ${method === 'DELETE' ? '<li>Drag to editor to create a <strong>delete button</strong> with confirmation</li>' : ''}
          <li>Drag child fields to insert <code>{{placeholders}}</code></li>
        </ul>
      </div>
    </div>
  `;
  
  AppUtils.Modal.show({ title: `API: ${apiName}`, body: html });
}

// Show detailed API information modal
function showApiDetails(apiName, apiMeta, apiDef, responseData){
  const method = (apiMeta.method || 'GET').toUpperCase();
  const url = apiMeta.url || (apiDef && apiDef.url) || '';
  const status = apiMeta.status || '';
  
  // Analyze response structure
  let responseFields = [];
  if(responseData && typeof responseData === 'object'){
    if(Array.isArray(responseData) && responseData.length > 0){
      responseFields = Object.keys(responseData[0]).map(k => ({ name: k, type: typeof responseData[0][k], sample: responseData[0][k] }));
    } else {
      responseFields = Object.keys(responseData).map(k => ({ name: k, type: typeof responseData[k], sample: responseData[k] }));
    }
  }
  
  // Get request body template if available
  let requestFields = [];
  if(apiDef && apiDef.bodyTemplate){
    try{
      const bodyObj = typeof apiDef.bodyTemplate === 'string' ? JSON.parse(apiDef.bodyTemplate) : apiDef.bodyTemplate;
      if(bodyObj && typeof bodyObj === 'object'){
        requestFields = Object.keys(bodyObj).map(k => ({ name: k, type: typeof bodyObj[k], sample: bodyObj[k] }));
      }
    }catch(e){}
  }
  
  // Get query params if available
  let queryParams = [];
  if(apiDef && apiDef.params){
    queryParams = Object.keys(apiDef.params).map(k => ({ name: k, value: apiDef.params[k] }));
  }
  
  const methodDesc = {
    'GET': 'Fetches data from the server. Use for reading/displaying information.',
    'POST': 'Creates new resources. Use for submitting forms and creating data.',
    'PUT': 'Updates existing resources (full replacement). Use for editing complete records.',
    'PATCH': 'Partially updates resources. Use for modifying specific fields.',
    'DELETE': 'Removes resources. Use for delete operations with confirmation.',
    'OPTIONS': 'Queries available methods. Use for CORS preflight.',
    'HEAD': 'Fetches headers only. Use for checking resource existence.'
  };
  
  let html = `
    <div class="api-details-panel">
      <div class="detail-section">
        <h4>Overview</h4>
        <div class="detail-row"><strong>Method:</strong> <span class="method-badge method-${['POST','PUT','PATCH','DELETE'].includes(method) ? 'create' : 'fetch'}">${method}</span></div>
        <div class="detail-row"><strong>URL:</strong> <code>${escapeHtml(url)}</code></div>
        <div class="detail-row"><strong>Status:</strong> ${status}</div>
        <div class="detail-row"><em>${methodDesc[method] || 'HTTP method'}</em></div>
      </div>
  `;
  
  if(queryParams.length > 0){
    html += `
      <div class="detail-section">
        <h4>Query Parameters</h4>
        <table class="detail-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            ${queryParams.map(p => `<tr><td><code>${escapeHtml(p.name)}</code></td><td>${escapeHtml(String(p.value))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  if(requestFields.length > 0){
    html += `
      <div class="detail-section">
        <h4>Request Body Fields</h4>
        <table class="detail-table">
          <thead><tr><th>Field</th><th>Type</th><th>Sample</th></tr></thead>
          <tbody>
            ${requestFields.map(f => `<tr><td><code>${escapeHtml(f.name)}</code></td><td>${f.type}</td><td>${escapeHtml(JSON.stringify(f.sample))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  if(responseFields.length > 0){
    html += `
      <div class="detail-section">
        <h4>Response Fields</h4>
        <table class="detail-table">
          <thead><tr><th>Field</th><th>Type</th><th>Sample</th></tr></thead>
          <tbody>
            ${responseFields.map(f => `<tr><td><code>${escapeHtml(f.name)}</code></td><td>${f.type}</td><td>${escapeHtml(JSON.stringify(f.sample))}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  html += `
      <div class="detail-section">
        <h4>Drag & Drop Hints</h4>
        <ul class="hint-list">
          ${method === 'GET' ? '<li>Drag to editor to create a <strong>display component</strong> (table/list/cards)</li>' : ''}
          ${['POST','PUT','PATCH'].includes(method) ? '<li>Drag to editor to create a <strong>form</strong> with inputs for all fields</li>' : ''}
          ${method === 'DELETE' ? '<li>Drag to editor to create a <strong>delete button</strong> with confirmation</li>' : ''}
          <li>Drag child fields to insert <code>{{placeholders}}</code></li>
        </ul>
      </div>
    </div>
  `;
  
  AppUtils.Modal.show({ title: `API: ${apiName}`, body: html });
}

// (preview drop handling removed — drag->editor now creates forms for creation methods)

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

// Handle Edit buttons on API list (open mapping/config modal)
if(apiListEl) apiListEl.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const editApi = btn.dataset.editApi;
  if(!editApi) return;
  if(!selectedSite){ showMessage('Select a site first','Error'); return; }
  try{
    // fetch sample data and api definition
    const apiDef = (selectedSite.apis||[]).find(a=>a.name===editApi);
    let sample = null;
    try{ sample = await fetchApiSample(editApi); if(!sample) sample = latestAggregatedData && latestAggregatedData[editApi] ? latestAggregatedData[editApi] : null; }catch(e){ sample = latestAggregatedData && latestAggregatedData[editApi] ? latestAggregatedData[editApi] : null; }
    openApiMappingModal(editApi, apiDef, sample);
  }catch(err){ console.error(err); showMessage('Could not open editor','Error'); }
});

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
    // If payload represents a top-level API with an API name, insert appropriate component based on method
    if(payload && payload.apiName){
      const method = (payload.method||'GET').toUpperCase();
      const apiName = payload.apiName;
      // if payload lacks sample, fetch lazily now
      if(!payload.sample){
        try{ const s = await fetchApiSample(apiName); if(s) payload.sample = s; }catch(e){}
        // also refresh mappingConfig from selectedSite if present
        try{ if(selectedSite && selectedSite.apis){ const ad = selectedSite.apis.find(a=>a.name===apiName); if(ad && ad.mappingConfig) payload.mappingConfig = ad.mappingConfig; } }catch(e){}
      }
      const fields = payload.fields && payload.fields.length ? payload.fields : (payload.sample && typeof payload.sample === 'object' ? Object.keys(payload.sample) : []);
      let componentHtml = '';
      
      if(method === 'GET'){
        // Generate display component (table/list) for GET
        const compId = 'abcomp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
        const tableRows = fields.length ? fields.map(f => `<th>${f}</th>`).join('') : '<th>Data</th>';
        const tableCells = fields.length ? fields.map(f => `<td>{{${apiName}.${f}}}</td>`).join('') : '<td>{{' + apiName + '}}</td>';
        componentHtml = `<!-- ${method} Display Component -->
<div id=\"${compId}\" class=\"ab-display-component\" data-ab-api=\"${apiName}\" style=\"margin:16px 0;padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:8px\">
  <h3 style=\"margin:0 0 12px 0\">${apiName} Data</h3>
  <table style=\"width:100%;border-collapse:collapse\">
    <thead><tr style=\"background:rgba(0,0,0,0.02)\">${tableRows}</tr></thead>
    <tbody>
      {{#each ${apiName}}}
      <tr style=\"border-bottom:1px solid rgba(0,0,0,0.06)\">${tableCells}</tr>
      {{/each}}
    </tbody>
  </table>
</div>`;
        showMessage('Inserted display table for ' + apiName + '. Data will populate from API on page load.', 'Component inserted');
      } else if(['POST','PUT','PATCH'].includes(method)){
        // Generate simple form for POST/PUT/PATCH
        const formId = 'abform_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
        // detect mapping config if present
        let mapping = payload.mappingConfig || null;
        if(!mapping){ try{ if(selectedSite && selectedSite.apis){ const ad = selectedSite.apis.find(a=>a.name===apiName); if(ad && ad.mappingConfig) mapping = ad.mappingConfig; } }catch(e){}
        
        let inputsHtml = '';
        if(mapping && Array.isArray(mapping.fieldMappings) && mapping.fieldMappings.length){
          inputsHtml = mapping.fieldMappings.map(mf => {
            const f = mf.requestField;
            // try to infer type from sample using responsePath
            let inputType = 'text';
            if(payload.sample && payload.sample[mf.responsePath] !== undefined){
              const val = payload.sample[mf.responsePath];
              if(typeof val === 'number') inputType = 'number';
              else if(typeof val === 'boolean') inputType = 'checkbox';
              else if(String(val).includes('@')) inputType = 'email';
            }
            if(inputType === 'checkbox'){
              return `<label><input type=\"${inputType}\" name=\"${escapeHtml(f)}\" data-field=\"${escapeHtml(f)}\" data-location=\"${escapeHtml(mf.location || 'body')}\"> ${escapeHtml(f)}</label><br>`;
            }
            return `<label>${escapeHtml(f)}: <input type=\"${inputType}\" name=\"${escapeHtml(f)}\" data-field=\"${escapeHtml(f)}\" data-location=\"${escapeHtml(mf.location || 'body')}\"></label><br>`;
          }).join('\n');
        } else {
          inputsHtml = (fields.length ? fields.map(f=> {
            let inputType = 'text';
            if(payload.sample && payload.sample[f] !== undefined){
              const val = payload.sample[f];
              if(typeof val === 'number') inputType = 'number';
              else if(typeof val === 'boolean') inputType = 'checkbox';
              else if(String(val).includes('@')) inputType = 'email';
            }
            if(inputType === 'checkbox'){
              return `<label><input type=\"${inputType}\" name=\"${escapeHtml(f)}\" data-field=\"${escapeHtml(f)}\" data-location=\"body\"> ${escapeHtml(f)}</label><br>`;
            }
            return `<label>${escapeHtml(f)}: <input type=\"${inputType}\" name=\"${escapeHtml(f)}\" data-field=\"${escapeHtml(f)}\" data-location=\"body\"></label><br>`;
          }).join('\n') : '<p>No fields available</p>');
        }

        // build submit script that honors mapping.contentType
        const contentTypeToUse = mapping && mapping.contentType ? mapping.contentType : 'application/json';
        const script = `<script>
document.getElementById('${formId}').addEventListener('submit', async function(e){
  e.preventDefault();
  var queryParams = {};
  var bodyData = {};
  this.querySelectorAll('input, textarea, select').forEach(function(inp){
    var field = inp.getAttribute('data-field') || inp.name;
    if(!field) return;
    var loc = inp.getAttribute('data-location') || 'body';
    var val = (inp.type === 'checkbox') ? inp.checked : inp.value;
    if(loc === 'query') queryParams[field] = val; else bodyData[field] = val;
  });
  try{
    var headers = {};
    var bodyPayload = null;
    // build query string if needed
    var qs = Object.keys(queryParams).length ? ('?' + Object.keys(queryParams).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(queryParams[k]); }).join('&')) : '';
    if('${contentTypeToUse}' === 'application/x-www-form-urlencoded'){
      var params = new URLSearchParams();
      Object.keys(bodyData).forEach(function(k){ params.append(k, bodyData[k]); });
      bodyPayload = params.toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if('${contentTypeToUse}' === 'form-elements'){
      // send plain key/value JSON for individual form elements
      bodyPayload = JSON.stringify(bodyData); headers['Content-Type'] = 'application/json';
    } else {
      // default: check for raw editor override, else wrapped JSON
      var rawEl = document.getElementById('${formId}_raw');
      if(rawEl){ bodyPayload = rawEl.value; headers['Content-Type'] = 'application/json'; }
      else { bodyPayload = JSON.stringify(bodyData); headers['Content-Type'] = 'application/json'; }
    }
    var resp = await fetch('/api/sites/${selectedSite ? selectedSite.name : ""}/endpoints/${apiName}/execute' + qs, {
      method: 'POST',
      headers: headers,
      body: bodyPayload
    });
    var result = await resp.json();
    alert('Success: ' + JSON.stringify(result));
    this.reset();
  }catch(err){
    alert('Error: ' + err.message);
  }
});
<\/script>`;

        componentHtml = `<form id=\"${formId}\" style=\"padding:12px;border:1px solid #ddd;border-radius:8px;margin:8px 0\">\n  <h3>${method} ${apiName}</h3>\n  ${inputsHtml}\n  <button type=\"submit\">Submit</button>\n</form>\n${script}`;
        showMessage('Inserted ' + method + ' form for ' + apiName, 'Form inserted');
      } else if(method === 'DELETE'){
        // Generate delete button with confirmation
        const btnId = 'abdel_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
        const script = `<script>(function(){var b=document.getElementById('${btnId}'); if(!b) return; b.addEventListener('click', async function(){ if(!confirm('Are you sure you want to delete this item?')) return; try{ var resp = await fetch('/api/sites/${selectedSite ? selectedSite.name : ""}/endpoints/'+encodeURIComponent('${apiName}')+'/execute', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) }); alert('Deleted'); location.reload(); }catch(e){ console.error(e); alert('Delete failed: '+(e&&e.message?e.message:String(e))); } });})()<\/script>`;
        componentHtml = `<button id=\"${btnId}\" class=\"btn-delete\" data-ab-api=\"${apiName}\" data-ab-method=\"DELETE\" style=\"padding:8px 16px;background:#ef4444;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:600\">Delete ${apiName}</button>\n${script}`;
        showMessage('Inserted DELETE button for ' + apiName + ' with confirmation.', 'Button inserted');
      } else {
        // Fallback for other methods
        const btnId = 'abbtn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
        const script = `<script>(function(){var b=document.getElementById('${btnId}'); if(!b) return; b.addEventListener('click', async function(){ try{ var resp = await fetch('/api/sites/${selectedSite ? selectedSite.name : ""}/endpoints/'+encodeURIComponent('${apiName}')+'/execute', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) }); var result = await resp.json(); alert('${method} ${apiName}: ' + JSON.stringify(result)); }catch(e){ alert('Failed: '+(e&&e.message?e.message:String(e))); } });})()<\/script>`;
        componentHtml = `<button id=\"${btnId}\" data-ab-api=\"${apiName}\" data-ab-method=\"${method}\" style=\"padding:8px 16px;background:#3b82f6;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:600\">${method} ${apiName}</button>\n${script}`;
        showMessage('Inserted ' + method + ' button for ' + apiName + '.', 'Button inserted');
      }

      const newVal = val.slice(0,start) + componentHtml + val.slice(end);
      editorEl.value = newVal;
      const pos = start + componentHtml.length;
      editorEl.selectionStart = editorEl.selectionEnd = pos;
      return;
    }

    // If payload indicates a field or value, fallback to inserting placeholder
    if(payload && payload.type){
      const fullPath = payload.apiPath; // full dotted path
      const before = val.slice(0, start);
      const lastOpen = before.lastIndexOf('{{#each');
      const lastClose = before.lastIndexOf('{{/each}}');
      const insideLoop = lastOpen > lastClose;
      let insertText = '';
      if(insideLoop){
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
    }
    });
}

// Guided tour removed — Intro.js usage and UI were removed per request.

// Quick search
const searchInput = qs('#searchInput'); if(searchInput) searchInput.addEventListener('input', (e)=>{ const q = e.target.value.trim().toLowerCase(); if(!q){ renderSiteList(); return; } const filtered = sites.filter(s=> s.name.toLowerCase().includes(q)); const ul = qs('#siteList'); ul.innerHTML=''; filtered.forEach(s=>{ const li = document.createElement('li'); li.textContent=s.name; li.addEventListener('click', ()=> selectSite(s.name)); ul.appendChild(li); }); });

// initial load
loadSites();

// Open visual editor button
const openVisualBtn = qs('#openVisualEditor'); if(openVisualBtn) openVisualBtn.addEventListener('click', ()=> openVisualEditor());

// Open field mapper button
const openFieldMapperBtn = qs('#openFieldMapper'); 
if(openFieldMapperBtn) openFieldMapperBtn.addEventListener('click', ()=> {
  if(!selectedSite){ showMessage('Select a site first','Error'); return; }
  const apis = selectedSite.apis || [];
  if(apis.length === 0){ showMessage('No APIs configured. Add an API first.','Notice'); return; }
  
  // Show selector if multiple APIs
  if(apis.length === 1){
    const apiDef = apis[0];
    const responseData = latestAggregatedData[apiDef.name];
    const apiMeta = latestAggregatedData.__meta__ && latestAggregatedData.__meta__[apiDef.name] ? latestAggregatedData.__meta__[apiDef.name] : {};
    showFieldMapper(apiDef.name, apiDef, responseData);
  } else {
    const options = apis.map(a => `<option value="${a.name}">${a.name} (${(a.method||'GET').toUpperCase()})</option>`).join('');
    const html = `<div style=\"padding:12px\"><label style=\"display:block;margin-bottom:8px;font-weight:600\">Select API to map:</label><select id=\"fieldMapperApiSelect\" style=\"width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.03)\">${options}</select><button id=\"fieldMapperOpenBtn\" class=\"btn\" style=\"margin-top:12px;width:100%\">Open Field Mapper</button></div>`;
    AppUtils.Modal.show({ title: 'Select API', body: html });
    setTimeout(() => {
      const btn = document.getElementById('fieldMapperOpenBtn');
      if(btn) btn.onclick = () => {
        const sel = document.getElementById('fieldMapperApiSelect');
        const apiName = sel ? sel.value : apis[0].name;
        const apiDef = apis.find(a => a.name === apiName);
        const responseData = latestAggregatedData[apiName];
        showFieldMapper(apiName, apiDef, responseData);
      };
    }, 100);
  }
});

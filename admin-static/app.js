// Process API test result and save to API list
async function processApiTestResult(apiDef, responseData) {
  if (!selectedSite || !apiDef) return;
  // Update the API definition with the response data as sample
  const updatedApiDef = { ...apiDef, sample: responseData };
  try {
    const resp = await fetch(`/api/sites/${selectedSite.name}/apis/${encodeURIComponent(apiDef.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedApiDef)
    });
    if (!resp.ok) throw new Error('Failed to update API');
    showMessage('API updated with test result', 'Saved');
    await selectSite(selectedSite.name); // refresh
  } catch (err) {
    console.error(err);
    showMessage('Failed to save API', 'Error');
  }
}

// REST Client Modal Integration
function openRestClientModal(apiName, apiDef) {
  let modal = document.getElementById('restClientModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'restClientModal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '10000';
    modal.style.background = 'rgba(2,6,23,0.45)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = `<div style="background:#23272f;padding:0;border-radius:12px;max-width:950px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.18);">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:18px 32px 0 32px;">
        <div style="font-weight:700;font-size:1.15rem;color:#fff">REST Client — ${escapeHtml(apiName)}</div>
        <button id="restClientModalClose" class="btn ghost" style="margin-left:16px;">Close</button>
      </div>
      <iframe id="restClientFrame" src="/rest-client" style="width:900px;height:700px;border:none;border-radius:0 0 12px 12px;background:#23272f;"></iframe>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('restClientModalClose').onclick = () => { modal.style.display = 'none'; };
  } else {
    modal.style.display = 'flex';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // Global error handler to suppress known iframe-related errors
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.error = function(...args) {
    const message = args.join(' ');
    // Suppress known third-party script errors from iframe content
    if (message.includes('avada-order-limit') ||
        message.includes('Cannot read properties of undefined (reading \'theme\')') ||
        message.includes('checkouts/internal/preloads.js') ||
        message.includes('web-pixels-manager-sandbox') ||
        message.includes('An iframe which has both allow-scripts and allow-same-origin')) {
      return; // Suppress these known errors from iframe content
    }
    // Pass through other errors
    originalConsoleError.apply(console, args);
  };

  console.warn = function(...args) {
    const message = args.join(' ');
    // Suppress known iframe sandbox warnings
    if (message.includes('An iframe which has both allow-scripts and allow-same-origin')) {
      return; // Suppress sandbox warnings
    }
    // Pass through other warnings
    originalConsoleWarn.apply(console, args);
  };

  const apiListEl = qs('#apiList');
  if(apiListEl) {
    apiListEl.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button'); if(!btn) return;
      const editApi = btn.dataset.editApi;
      if(editApi){
        if(!selectedSite){ showMessage('Select a site first','Error'); return; }
        try{
          const apiDef = (selectedSite.apis||[]).find(a=>a.name===editApi);
          openRestClientModal(editApi, apiDef);
        }catch(err){ console.error(err); showMessage('Could not open REST client','Error'); }
        return;
      }
      // Also handle add API button if present
      const addApi = btn.dataset.addApi;
      if(addApi){
        openRestClientModal('New API', {});
        return;
      }
    });
  }

  // Store last request/response from REST client for drag-and-drop
        window.lastRestClientData = {};
        window.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'rest-client-result') {
            window.lastRestClientData = event.data;
          }
        });

        // REST client data handling moved to dragdrop.js
      });
      const qs = (s, el=document) => el.querySelector(s);
      const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

      // Top-level state
      let sites = [];
      let selectedSite = null;
      let latestAggregatedData = {};
      const apiSampleCache = {};

      // Utility: escape text included in HTML to avoid markup injection
      function escapeHtml(s){
        if(s === null || s === undefined) return '';
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      // Insert code at cursor position in page editor
      function insertCodeAtCursor(code) {
        const editor = qs('#pageEditor');
        if (!editor) return;

        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;
        const before = text.substring(0, start);
        const after = text.substring(end);

        editor.value = before + code + after;
        editor.selectionStart = editor.selectionEnd = start + code.length;
        editor.focus();

        showMessage('Code inserted into editor', 'Success');
      }

      // Make function globally available
      window.insertCodeAtCursor = insertCodeAtCursor;

      // If AppUtils.Logger is available (utils.js loads before this), wire console methods to it
      if(window.AppUtils && AppUtils.Logger){
        const L = AppUtils.Logger;
        console.info = (...a)=> L.info(...a);
      }

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
            return `<div style="margin-bottom:8px"><label><input type=\"checkbox\" name=\"${safeName}\" data-field=\"${safeName}\" data-location=\"${safeLoc}\" ${payload[f] ? 'checked' : ''}> ${safeName}</label></div>`;
          }
          return `<div style="margin-bottom:12px"><label style=\"display:block;font-weight:600;margin-bottom:6px\">${safeName}</label><input type=\"${inputType}\" name=\"${safeName}\" data-field=\"${safeName}\" data-location=\"${safeLoc}\" style=\"width:100%;padding:10px;border:1px solid #ddd;border-radius:8px\" value=\"${escapeHtml(String(payload[f] || ''))}\" /></div>`;
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
        window.selectedSite = selectedSite;
        await renderSiteList();
        await renderSiteDetails();
      }

      async function analyzePageApiRelationships(siteName, apis, pages) {
        const relationships = {};
        if (!Array.isArray(pages)) {
          console.warn('Pages is not an array, skipping analysis:', pages);
          return relationships;
        }
        apis.forEach(api => {
          relationships[api.name] = [];
        });
        for (const page of pages) {
          try {
            const content = await api(`/api/sites/${siteName}/pages/content?path=${encodeURIComponent(page)}`);
            apis.forEach(api => {
              const apiName = api.name;
              const url = api.url;
              const patterns = [
                new RegExp(`fetch\\(['"\`]${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`, 'i'),
                new RegExp(apiName, 'i'),
                new RegExp(`/${apiName}`, 'i')
              ];
              if (patterns.some(p => p.test(content))) {
                relationships[apiName].push(page);
              }
            });
          } catch (e) {
            console.warn('Could not load page for analysis', page, e);
          }
        }
        return relationships;
      }

      async function renderSiteDetails(){
        if(!selectedSite) return;
        qs('#siteActions').textContent = `Selected: ${selectedSite.name}`;
        const apiList = qs('#apiList'); apiList.innerHTML='';
        let relationships = {};
        try {
          const pages = await api(`/api/sites/${selectedSite.name}/pages`);
          relationships = analyzePageApiRelationships(selectedSite.name, selectedSite.apis || [], pages);
        } catch (e) {
          console.warn('Could not analyze page-API relationships', e);
        }
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
          let buttonsHtml = `<button class="btn small outline" data-edit-api="${a.name}">Edit</button> <button class="btn small success" data-api="${a.name}">Test</button>`;
          if(['POST','PUT','PATCH'].includes(methodText)) {
            buttonsHtml += ` <button class="btn small success" data-form-builder="${a.name}" data-method="${methodText}">Form Builder</button>`;
          }
          // Delete button for removing API definitions
          buttonsHtml += ` <button class="btn small danger" data-delete-api="${a.name}">Delete</button>`;
          right.innerHTML = buttonsHtml;

          // Add page usage info
          if (relationships[a.name] && relationships[a.name].length > 0) {
            const pagesDiv = document.createElement('div');
            pagesDiv.className = 'api-pages';
            pagesDiv.innerHTML = `<small style="color:#666;margin-top:4px;display:block">Used in: ${relationships[a.name].join(', ')}</small>`;
            right.appendChild(pagesDiv);
          }

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
        }catch(e){ console.warn('could not load data palette', e); }
      }

      // Visual editor integration removed to simplify debugging and avoid syntax issues.
  if (typeof bm !== 'undefined' && typeof editor !== 'undefined' && typeof ComponentLibrary !== 'undefined') {
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



// Open mapping modal to let user pick response fields -> request fields and content type
function openApiMappingModal(apiName, apiDef, sample){
  if(!selectedSite){ showMessage('Select a site first','Error'); return; }
  // Normalize sample to an object (take first element if array)
  let s = sample;
  if(Array.isArray(s) && s.length>0) s = s[0];
  if(!s || typeof s !== 'object') s = (apiDef && apiDef.bodyTemplate && typeof apiDef.bodyTemplate === 'object') ? apiDef.bodyTemplate : {};

  const method = (apiDef.method || 'GET').toUpperCase();
  const isSafe = ['GET','HEAD','OPTIONS','TRACE'].includes(method);

  const existing = (apiDef && apiDef.mappingConfig) ? apiDef.mappingConfig : null;
  const existingFieldMap = existing && existing.fieldMappings ? existing.fieldMappings : [];
  const rawBodyTemplate = existing && existing.rawBodyTemplate ? existing.rawBodyTemplate : (s && typeof s === 'object' ? JSON.stringify((Array.isArray(s) ? s[0] : s) || {}, null, 2) : '');
  const contentType = existing && existing.contentType ? existing.contentType : 'application/json';

  // Parse query params from apiDef.params if available
  const queryParams = (apiDef && apiDef.params) ? Object.entries(apiDef.params).map(([k,v]) => ({ key: k, value: v })) : [];

  // Build dynamic HTML based on content type
  function buildModalHTML(ct){
    let bodySection = '';
    if(ct === 'application/json'){
      const hasMappings = existingFieldMap.length > 0;
      const showRaw = !hasMappings && rawBodyTemplate;
      bodySection = `
        <div id="ab_map_json_container" style="margin-bottom:10px">
          <div style="display:flex;gap:12px;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px">
            <label style="cursor:pointer"><input type="radio" name="json_mode" value="raw" ${showRaw ? 'checked' : ''} onchange="document.getElementById('json_raw_view').style.display='block';document.getElementById('json_structured_view').style.display='none'"> Raw Template</label>
            <label style="cursor:pointer"><input type="radio" name="json_mode" value="structured" ${!showRaw ? 'checked' : ''} onchange="document.getElementById('json_raw_view').style.display='none';document.getElementById('json_structured_view').style.display='block'"> Structured Mapping</label>
          </div>
          
          <div id="json_raw_view" style="display:${showRaw ? 'block' : 'none'}">
            <label style="display:block;margin-bottom:6px;font-weight:600">Raw JSON body template</label>
            <textarea id="ab_map_raw_body" style="width:100%;min-height:200px;padding:8px;border-radius:6px;border:1px solid #ddd;font-family:monospace">${escapeHtml(rawBodyTemplate)}</textarea>
          </div>
          
          <div id="json_structured_view" style="display:${!showRaw ? 'block' : 'none'}">
            <label style="display:block;margin-bottom:6px;font-weight:600">JSON Fields (dot-notation supported, e.g. user.name)</label>
            <div id="json_fields_container">
              ${existingFieldMap.filter(m => m.location === 'body').map(m => `<div class="field-row" style="display:flex;gap:8px;margin-bottom:8px"><input type="text" placeholder="JSON Path (e.g. user.name)" value="${escapeHtml(m.requestField)}" class="field-name" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><input type="text" placeholder="Default Value" value="${escapeHtml(m.value || '')}" class="field-value" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><button class="remove-field btn small ghost">Remove</button></div>`).join('')}
            </div>
            <button id="add_json_field" class="btn small" style="margin-top:8px">+ Add Field</button>
          </div>
        </div>
      `;
    } else if(ct === 'application/x-www-form-urlencoded'){
      bodySection = `
        <div id="ab_map_form" style="margin-bottom:10px">
          <label style="display:block;margin-bottom:6px;font-weight:600">Form Fields (key-value pairs)</label>
          <div id="form_fields_container">
            ${existingFieldMap.filter(m => m.location === 'body').map(m => `<div class="field-row" style="display:flex;gap:8px;margin-bottom:8px"><input type="text" placeholder="Field name" value="${escapeHtml(m.requestField)}" class="field-name" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><input type="text" placeholder="Value or {{placeholder}}" value="${escapeHtml(m.value || '')}" class="field-value" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><button class="remove-field btn small ghost">Remove</button></div>`).join('')}
          </div>
          <button id="add_form_field" class="btn small" style="margin-top:8px">+ Add Field</button>
        </div>
      `;
    } else if(ct === 'multipart/form-data'){
      bodySection = `
        <div id="ab_map_multipart" style="margin-bottom:10px">
          <label style="display:block;margin-bottom:6px;font-weight:600">Multipart Fields</label>
          <div id="multipart_fields_container">
            ${existingFieldMap.filter(m => m.location === 'body').map(m => `<div class="field-row" style="display:flex;gap:8px;margin-bottom:8px"><input type="text" placeholder="Field name" value="${escapeHtml(m.requestField)}" class="field-name" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><select class="field-type" style="padding:8px;border-radius:6px;border:1px solid #ddd"><option value="text" ${m.type === 'text' ? 'selected' : ''}>Text</option><option value="file" ${m.type === 'file' ? 'selected' : ''}>File</option></select><input type="text" placeholder="Value or {{placeholder}}" value="${escapeHtml(m.value || '')}" class="field-value" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><button class="remove-field btn small ghost">Remove</button></div>`).join('')}
          </div>
          <button id="add_multipart_field" class="btn small" style="margin-top:8px">+ Add Field</button>
        </div>
      `;
    }

    return `
      <div style="max-height:70vh;overflow:auto">
        <div style="margin-bottom:12px;padding:12px;background:rgba(79,70,229,0.05);border-left:4px solid var(--accent);border-radius:8px">
          <strong>HTTP Method: ${method}</strong>
          <div style="margin-top:4px;color:var(--muted);font-size:0.9rem">${isSafe ? '✓ Safe method (read-only, no request body needed)' : '⚠ Unsafe method (can modify data, requires request body configuration)'}</div>
        </div>

        <div id="query_params_section" style="margin-bottom:12px">
          <label style="display:block;margin-bottom:6px;font-weight:600">Query Parameters</label>
          <div id="query_params_container">
            ${queryParams.map(p => `<div class="param-row" style="display:flex;gap:8px;margin-bottom:8px"><input type="text" placeholder="Key" value="${escapeHtml(p.key)}" class="param-key" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><input type="text" placeholder="Value" value="${escapeHtml(p.value)}" class="param-value" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><button class="remove-param btn small ghost">Remove</button></div>`).join('')}
          </div>
          <button id="add_query_param" class="btn small" style="margin-top:8px">+ Add Query Param</button>
        </div>

        ${!isSafe ? `
        <div class="divider" style="margin:16px 0;height:1px;background:rgba(0,0,0,0.08)"></div>
        <div style="margin-bottom:12px">
          <label style="display:block;margin-bottom:6px;font-weight:600">Content Type</label>
          <select id="ab_map_content_type" style="width:100%;padding:10px;border-radius:6px;border:1px solid #ddd">
            <option value="application/json" ${ct === 'application/json' ? 'selected' : ''}>application/json</option>
            <option value="application/x-www-form-urlencoded" ${ct === 'application/x-www-form-urlencoded' ? 'selected' : ''}>application/x-www-form-urlencoded</option>
            <option value="multipart/form-data" ${ct === 'multipart/form-data' ? 'selected' : ''}>multipart/form-data</option>
          </select>
        </div>
        <div id="ab_map_body_container">${bodySection}</div>
        ` : '<div style="padding:12px;background:rgba(6,182,212,0.05);border-radius:8px;color:var(--muted)">No request body configuration needed for safe methods like GET, HEAD, OPTIONS, or TRACE.</div>'}

        <div style="margin-top:12px;text-align:right"><button id="ab_map_save" class="btn">Save</button> <button id="ab_map_cancel" class="btn">Cancel</button></div>

      </div>

    `;
  }

  AppUtils.Modal.show({ title: `Map API: ${apiName} (${method})`, body: buildModalHTML(contentType) });

  setTimeout(()=>{
    const contentTypeSelect = qs('#ab_map_content_type');
    const saveBtn = qs('#ab_map_save');
    const cancelBtn = qs('#ab_map_cancel');

    // Handle content type change
    if(contentTypeSelect) contentTypeSelect.addEventListener('change', (e) => {
      const newCT = e.target.value;
      AppUtils.Modal.updateBody(buildModalHTML(newCT));
      attachEventHandlers(newCT);
    });

    function attachEventHandlers(ct){
      // Add query param
      const addParamBtn = qs('#add_query_param');
      if(addParamBtn) addParamBtn.onclick = () => {
        const container = qs('#query_params_container');
        const row = document.createElement('div');
        row.className = 'param-row';
        row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
        row.innerHTML = '<input type="text" placeholder="Key" class="param-key" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><input type="text" placeholder="Value" class="param-value" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><button class="remove-param btn small ghost">Remove</button>';
        container.appendChild(row);
        row.querySelector('.remove-param').onclick = () => row.remove();
      };

      // Remove param buttons
      document.querySelectorAll('.remove-param').forEach(btn => {
        btn.onclick = () => btn.closest('.param-row').remove();
      });

      // Add JSON field
      const addJsonFieldBtn = qs('#add_json_field');
      if(addJsonFieldBtn) addJsonFieldBtn.onclick = () => {
         const container = qs('#json_fields_container');
         const row = document.createElement('div');
         row.className = 'field-row';
         row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
         row.innerHTML = '<input type="text" placeholder="JSON Path (e.g. user.name)" class="field-name" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><input type="text" placeholder="Default Value" class="field-value" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><button class="remove-field btn small ghost">Remove</button>';
         container.appendChild(row);
         row.querySelector('.remove-field').onclick = () => row.remove();
      };

      if(ct === 'application/x-www-form-urlencoded'){
        const addFieldBtn = qs('#add_form_field');
        if(addFieldBtn) addFieldBtn.onclick = () => {
          const container = qs('#form_fields_container');
          const row = document.createElement('div');
          row.className = 'field-row';
          row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
          row.innerHTML = '<input type="text" placeholder="Field name" class="field-name" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><input type="text" placeholder="Value or {{placeholder}}" class="field-value" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><button class="remove-field btn small ghost">Remove</button>';
          container.appendChild(row);
          row.querySelector('.remove-field').onclick = () => row.remove();
        };
      } else if(ct === 'multipart/form-data'){
        const addFieldBtn = qs('#add_multipart_field');
        if(addFieldBtn) addFieldBtn.onclick = () => {
          const container = qs('#multipart_fields_container');
          const row = document.createElement('div');
          row.className = 'field-row';
          row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
          row.innerHTML = '<input type="text" placeholder="Field name" class="field-name" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><select class="field-type" style="padding:8px;border-radius:6px;border:1px solid #ddd"><option value="text">Text</option><option value="file">File</option></select><input type="text" placeholder="Value or {{placeholder}}" class="field-value" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd"><button class="remove-field btn small ghost">Remove</button>';
          container.appendChild(row);
          row.querySelector('.remove-field').onclick = () => row.remove();
        };
      }
      
      document.querySelectorAll('.remove-field').forEach(btn => {
          btn.onclick = () => btn.closest('.field-row').remove();
      });
    }

    attachEventHandlers(contentType);

    if(cancelBtn) cancelBtn.onclick = ()=>{ AppUtils.Modal.hide && AppUtils.Modal.hide(); };
    if(saveBtn) saveBtn.onclick = async ()=>{
      try{
        const ct = qs('#ab_map_content_type') ? qs('#ab_map_content_type').value : 'application/json';
        let mappingConfig = { contentType: ct, fieldMappings: [] };

        // Collect query params
        const queryRows = document.querySelectorAll('.param-row');
        const params = {};
        queryRows.forEach(row => {
          const key = row.querySelector('.param-key').value.trim();
          const value = row.querySelector('.param-value').value.trim();
          if(key) params[key] = value;
        });

        // Collect field mappings based on content type (only for unsafe methods)
        if(!isSafe){
            if(ct === 'application/json'){
              const mode = qs('input[name="json_mode"]:checked') ? qs('input[name="json_mode"]:checked').value : 'raw';
              if(mode === 'raw'){
                  const ta = qs('#ab_map_raw_body');
                  const rawTemplate = ta ? ta.value : '';
                  if(rawTemplate) mappingConfig.rawBodyTemplate = rawTemplate;
              } else {
                  // Structured JSON with dot-notation support
                  const fieldRows = document.querySelectorAll('#json_fields_container .field-row');
                  fieldRows.forEach(row => {
                    const name = row.querySelector('.field-name').value.trim();
                    const value = row.querySelector('.field-value').value.trim();
                    if(name){
                      mappingConfig.fieldMappings.push({ requestField: name, location: 'body', value: value });
                    }
                  });
              }
            } else if(ct === 'application/x-www-form-urlencoded'){
              const fieldRows = document.querySelectorAll('#form_fields_container .field-row');
              fieldRows.forEach(row => {
                const name = row.querySelector('.field-name').value.trim();
                const value = row.querySelector('.field-value').value.trim();
                if(name){
                  mappingConfig.fieldMappings.push({ requestField: name, location: 'body', value: value });
                }
              });
            } else if(ct === 'multipart/form-data'){
              const fieldRows = document.querySelectorAll('#multipart_fields_container .field-row');
              fieldRows.forEach(row => {
                const name = row.querySelector('.field-name').value.trim();
                const type = row.querySelector('.field-type').value;
                const value = row.querySelector('.field-value').value.trim();
                if(name){
                  mappingConfig.fieldMappings.push({ requestField: name, location: 'body', type: type, value: value });
                }
              });
            }
        }

        AppUtils.Loader.show('Saving mapping...');
        const resp = await fetch(`/api/sites/${selectedSite.name}/apis/${encodeURIComponent(apiName)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ mappingConfig, params }) });
        AppUtils.Loader.hide();
        if(!resp.ok) { const txt = await resp.text(); throw new Error(txt || 'Save failed'); }
        const updated = await resp.json();
        if(selectedSite && selectedSite.apis){ const idx = selectedSite.apis.findIndex(a=>a.name===apiName); if(idx>=0) selectedSite.apis[idx] = updated; }
        AppUtils.Modal.hide && AppUtils.Modal.hide();
        showMessage('Mapping saved', 'Saved');
      }catch(err){ AppUtils.Loader.hide(); console.error(err); showMessage('Could not save mapping: ' + (err && err.message ? err.message : ''),'Error'); }
    };
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

// Unified REST client modal function
function openRestClientModal(title, apiDef, initialBody = null) {
  let body = initialBody;
const style = `body { font-family: 'Inter', Arial, sans-serif; background: #23272f; margin: 0; padding: 0; }
.container { max-width: 900px; margin: 0 auto; background: #2c313a; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.18); padding: 32px; color: #e2e8f0; }
h1 { margin-top: 0; font-weight: 600; color: #fff; }
.row { display: flex; gap: 12px; }
.row > * { flex: 1; }
label { font-weight: 600; margin-top: 16px; display: block; color: #a0aec0; }
input, select, textarea { width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px solid #4a5568; font-size: 1rem; background: #23272f; color: #e2e8f0; }
textarea { min-height: 80px; font-family: monospace; }
button { padding: 10px 24px; border-radius: 6px; border: none; background: #6366f1; color: #fff; font-weight: 600; cursor: pointer; margin-top: 18px; }
button:hover { background: #4338ca; }
.tabs { display: flex; gap: 0; margin-top: 18px; border-bottom: 1px solid #4a5568; }
.tab { padding: 12px 24px; cursor: pointer; background: #23272f; color: #a0aec0; border: none; border-radius: 8px 8px 0 0; font-weight: 600; margin-right: 2px; }
.tab.active { background: #2c313a; color: #fff; border-bottom: 2px solid #6366f1; }
.tab-content { display: none; margin-top: 0; }
.tab-content.active { display: block; }
.note { margin: 18px 0; color: #a0aec0; font-size: 1rem; }
.response-section { margin-top: 32px; }
.response-header { font-weight: 600; color: #fff; margin-bottom: 8px; }
pre { background: #23272f; padding: 12px; border-radius: 8px; max-height: 350px; overflow: auto; color: #e2e8f0; border: 1px solid #4a5568; }
.status-success { color: #22c55e; font-weight: 600; }
.status-error { color: #ef4444; font-weight: 600; }
.method-select { width: 120px; }
.url-input { flex: 1; }
.send-btn { margin-left: 12px; }
.header-row, .param-row { display: flex; gap: 8px; margin-bottom: 6px; }
.header-row input, .param-row input { flex: 1; }
.remove-btn { background: #ef4444; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.9rem; cursor: pointer; }
.remove-btn:hover { background: #b91c1c; }
.add-btn { background: #6366f1; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.9rem; cursor: pointer; margin-top: 8px; }
.add-btn:hover { background: #4338ca; }
.multipart-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
}
.multipart-row input[type="text"] {
  width: 160px;
  min-width: 120px;
}
.multipart-row input[type="file"] {
  width: 180px;
  min-width: 120px;
}
.multipart-row select {
  width: 110px;
  min-width: 80px;
}
.multipart-row .remove-btn {
  margin-left: 8px;
}`;
const containerHtml = `<div class="container">
  <h1>REST Client</h1>
  <div class="note">Professional REST client. Supports all HTTP methods, advanced options, and a Postman-like UI.</div>
  <form id="restForm" autocomplete="off">
    <div class="row">
      <select id="method" class="method-select">
        <option>GET</option>
        <option>POST</option>
        <option>PUT</option>
        <option>PATCH</option>
        <option>DELETE</option>
        <option>OPTIONS</option>
        <option>HEAD</option>
      </select>
      <input id="url" class="url-input" type="text" placeholder="https://api.example.com/resource" required />
      <button type="submit" class="send-btn">Send</button>
    </div>
    <div class="tabs">
      <button type="button" class="tab active" data-tab="params">Params</button>
      <button type="button" class="tab" data-tab="headers">Headers</button>
      <button type="button" class="tab" data-tab="auth">Auth</button>
      <button type="button" class="tab" data-tab="body">Body</button>
    </div>
    <div id="tab-params" class="tab-content active">
      <div id="params-list"></div>
      <button type="button" class="add-btn" id="add-param">+ Add Param</button>
    </div>
    <div id="tab-headers" class="tab-content">
      <div id="headers-list"></div>
      <button type="button" class="add-btn" id="add-header">+ Add Header</button>
    </div>
    <div id="tab-auth" class="tab-content">
      <label for="auth-type">Auth Type</label>
      <select id="auth-type">
        <option value="none">None</option>
        <option value="basic">Basic Auth</option>
        <option value="bearer">Bearer Token</option>
      </select>
      <div id="auth-fields" style="margin-top:12px"></div>
    </div>
    <div id="tab-body" class="tab-content">
      <label for="body-type">Body Type</label>
      <select id="body-type">
        <option value="raw">Raw</option>
        <option value="json">JSON</option>
        <option value="form">Form Data</option>
        <option value="multipart">Multipart Form</option>
      </select>
      <div id="body-multipart-fields" style="display:none; margin-top:12px;"></div>
      <textarea id="body" placeholder="Request body"></textarea>
    </div>
  </form>
  <div class="response-section" id="result" style="display:none">
    <div class="response-header">
      <span id="status" class="status-success"></span>
      <span id="status-text"></span>
    </div>
    <pre id="response"></pre>
    <button id="saveApiTestResultBtn" class="btn" style="display:none;margin-top:8px;">Save</button>
  </div>
</div>`;
const restClientHtml = `<div style="max-height:80vh;overflow:auto;"><style>${style}</style>${containerHtml}</div>`;
  AppUtils.Modal.show({ title, body: restClientHtml });
  setTimeout(() => {
    // Populate fields
    if (apiDef) {
      document.getElementById('url').value = apiDef.url || '';
      document.getElementById('method').value = apiDef.method || 'GET';
      if (apiDef.headers) {
        Object.entries(apiDef.headers).forEach(([k,v]) => {
          addRow('headers-list', 'header');
          const rows = document.querySelectorAll('#headers-list .header-row');
          const last = rows[rows.length - 1];
          last.querySelector('.header-key').value = k;
          last.querySelector('.header-value').value = v;
        });
      }
      if (apiDef.params) {
        Object.entries(apiDef.params).forEach(([k,v]) => {
          addRow('params-list', 'param');
          const rows = document.querySelectorAll('#params-list .param-row');
          const last = rows[rows.length - 1];
          last.querySelector('.param-key').value = k;
          last.querySelector('.param-value').value = v;
        });
      }
      if (apiDef.bodyTemplate) {
        document.getElementById('body').value = typeof apiDef.bodyTemplate === 'string' ? apiDef.bodyTemplate : JSON.stringify(apiDef.bodyTemplate, null, 2);
        document.getElementById('body-type').value = 'json';
      }
    }
    // If initial body, show result
    if (body) {
      document.getElementById('result').style.display = 'block';
      document.getElementById('status').textContent = 'Initial';
      document.getElementById('status').className = 'status-success';
      document.getElementById('status-text').textContent = ' Response';
      document.getElementById('response').textContent = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
      document.getElementById('saveApiTestResultBtn').style.display = 'inline-block';
    }
    // Tab logic
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = function() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      };
    });
    // Dynamic Params/Headers
    function addRow(listId, type) {
      const div = document.createElement('div');
      div.className = type + '-row';
      div.innerHTML = `<input type="text" placeholder="Key" class="${type}-key" /> <input type="text" placeholder="Value" class="${type}-value" /> <button type="button" class="remove-btn">Remove</button>`;
      div.querySelector('.remove-btn').onclick = () => div.remove();
      document.getElementById(listId).appendChild(div);
    }
    document.getElementById('add-param').onclick = () => addRow('params-list', 'param');
    document.getElementById('add-header').onclick = () => addRow('headers-list', 'header');
    // Auth fields
    function renderAuthFields() {
      const type = document.getElementById('auth-type').value;
      const container = document.getElementById('auth-fields');
      container.innerHTML = '';
      if (type === 'basic') {
        container.innerHTML = '<input type="text" id="auth-user" placeholder="Username" /><input type="password" id="auth-pass" placeholder="Password" />';
      } else if (type === 'bearer') {
        container.innerHTML = '<input type="text" id="auth-token" placeholder="Bearer Token" />';
      }
    }
    document.getElementById('auth-type').onchange = renderAuthFields;
    renderAuthFields();
    // Body type logic
    document.getElementById('body-type').onchange = function() {
      const type = this.value;
      const body = document.getElementById('body');
      const multipartFields = document.getElementById('body-multipart-fields');
      if (type === 'json') {
        body.style.display = '';
        body.placeholder = '{\n  \n}';
        multipartFields.style.display = 'none';
      } else if (type === 'form') {
        body.style.display = '';
        body.placeholder = 'key1=value1&key2=value2';
        multipartFields.style.display = 'none';
      } else if (type === 'multipart') {
        body.style.display = 'none';
        multipartFields.style.display = '';
      } else {
        body.style.display = '';
        body.placeholder = 'Request body';
        multipartFields.style.display = 'none';
      }
    };
    // Multipart field logic
    function addMultipartField() {
      const div = document.createElement('div');
      div.className = 'multipart-row';
      div.innerHTML = `<input type="text" placeholder="Field name" class="multipart-key" /> <input type="text" placeholder="Value" class="multipart-value" /> <input type="file" class="multipart-file" style="display:none" /> <select class="multipart-type"><option value="text">Text</option><option value="file">File</option></select> <button type="button" class="remove-btn">Remove</button>`;
      const typeSelect = div.querySelector('.multipart-type');
      const fileInput = div.querySelector('.multipart-file');
      const valueInput = div.querySelector('.multipart-value');
      typeSelect.onchange = function() {
        if (typeSelect.value === 'file') {
          fileInput.style.display = '';
          valueInput.style.display = 'none';
        } else {
          fileInput.style.display = 'none';
          valueInput.style.display = '';
        }
      };
      div.querySelector('.remove-btn').onclick = () => div.remove();
      document.getElementById('body-multipart-fields').appendChild(div);
    }
    // Add button for multipart fields
    if (!document.getElementById('add-multipart')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'add-btn';
      btn.id = 'add-multipart';
      btn.textContent = '+ Add Multipart Field';
      btn.onclick = addMultipartField;
      document.getElementById('body-multipart-fields').appendChild(btn);
    }
    // Form submit
    document.getElementById('restForm').onsubmit = async function(e) {
      e.preventDefault();
      let method = document.getElementById('method').value;
      let url = document.getElementById('url').value.trim();
      // Params
      let params = {};
      document.querySelectorAll('#params-list .param-row').forEach(row => {
        const k = row.querySelector('.param-key').value;
        const v = row.querySelector('.param-value').value;
        if (k) params[k] = v;
      });
      if (Object.keys(params).length) {
        const qp = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
        url += (url.includes('?') ? '&' : '?') + qp;
      }
      // Headers
      let headers = {};
      document.querySelectorAll('#headers-list .header-row').forEach(row => {
        const k = row.querySelector('.header-key').value;
        const v = row.querySelector('.header-value').value;
        if (k) headers[k] = v;
      });
      // Auth
      const authType = document.getElementById('auth-type').value;
      if (authType === 'basic') {
        const user = document.getElementById('auth-user').value;
        const pass = document.getElementById('auth-pass').value;
        if (user && pass) {
          headers['Authorization'] = 'Basic ' + btoa(user + ':' + pass);
        }
      } else if (authType === 'bearer') {
        const token = document.getElementById('auth-token').value;
        if (token) headers['Authorization'] = 'Bearer ' + token;
      }
      // Body
      let bodyData = document.getElementById('body').value;
      const bodyType = document.getElementById('body-type').value;
      let options = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') {
        if (bodyType === 'json') {
          headers['Content-Type'] = 'application/json';
          options.body = bodyData;
        } else if (bodyType === 'form') {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          options.body = bodyData;
        } else if (bodyType === 'multipart') {
          const formData = new FormData();
          document.querySelectorAll('#body-multipart-fields .multipart-row').forEach(row => {
            const key = row.querySelector('.multipart-key').value;
            const type = row.querySelector('.multipart-type').value;
            if (type === 'file') {
              const fileInput = row.querySelector('.multipart-file');
              if (fileInput.files.length > 0) {
                formData.append(key, fileInput.files[0]);
              }
            } else {
              const value = row.querySelector('.multipart-value').value;
              formData.append(key, value);
            }
          });
          options.body = formData;
          // Do not set Content-Type header for multipart, browser will set it
          delete headers['Content-Type'];
        } else {
          options.body = bodyData;
        }
      }
      try {
        const resp = await fetch(url, options);
        let text;
        let status = resp.status;
        let statusText = resp.statusText;
        try { text = await resp.json(); } catch { text = await resp.text(); }
        document.getElementById('result').style.display = 'block';
        document.getElementById('status').textContent = status;
        document.getElementById('status').className = status >= 200 && status < 300 ? 'status-success' : 'status-error';
        document.getElementById('status-text').textContent = ' ' + statusText;
        document.getElementById('response').textContent = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
        body = text;
        document.getElementById('saveApiTestResultBtn').style.display = 'inline-block';
      } catch (err) {
        document.getElementById('result').style.display = 'block';
        document.getElementById('status').textContent = 'Error';
        document.getElementById('status').className = 'status-error';
        document.getElementById('status-text').textContent = '';
        document.getElementById('response').textContent = 'Error: ' + (err.message || String(err));
      }
    };
    // Save button handler
    const saveBtn = document.getElementById('saveApiTestResultBtn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        // Collect API definition from form
        const url = document.getElementById('url').value;
        const method = document.getElementById('method').value;
        let headers = {};
        document.querySelectorAll('#headers-list .header-row').forEach(row => {
          const k = row.querySelector('.header-key').value;
          const v = row.querySelector('.header-value').value;
          if (k) headers[k] = v;
        });
        let params = {};
        document.querySelectorAll('#params-list .param-row').forEach(row => {
          const k = row.querySelector('.param-key').value;
          const v = row.querySelector('.param-value').value;
          if (k) params[k] = v;
        });
        const bodyType = document.getElementById('body-type').value;
        let bodyTemplate = document.getElementById('body').value;
        if (bodyType === 'json' && bodyTemplate) {
          try { bodyTemplate = JSON.parse(bodyTemplate); } catch (e) {}
        }
        const apiName = apiDef.name || url.split('/').pop() || 'new-api-' + Date.now();
        const newApiDef = { name: apiName, url, method, headers, params, bodyTemplate };
        const isNew = !apiDef.name;
        const endpoint = isNew ? `/api/sites/${selectedSite.name}/apis` : `/api/sites/${selectedSite.name}/apis/${encodeURIComponent(apiDef.name)}`;
        const methodHttp = isNew ? 'POST' : 'PUT';
        fetch(endpoint, { method: methodHttp, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newApiDef) })
          .then(resp => resp.json())
          .then(updated => {
            if (isNew) {
              selectedSite.apis.push(updated);
            } else {
              const idx = selectedSite.apis.findIndex(a => a.name === apiDef.name);
              if (idx >= 0) selectedSite.apis[idx] = updated;
            }
            renderSiteDetails();
            AppUtils.Modal.hide();
            showMessage('API saved', 'Saved');
          })
          .catch(err => {
            console.error(err);
            showMessage('Failed to save API', 'Error');
          });
      };
    }
  }, 100);
}

// Consolidated API list event listener
const apiListEl = qs('#apiList');
if(apiListEl) {
  apiListEl.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    // Test API button
    if(btn.dataset.api){
      const apiName = btn.dataset.api;
      if(!selectedSite) { showMessage('Select a site first','Error'); return; }
      try{ AppUtils.Loader.show('Testing API...'); const resp = await fetch(`/api/sites/${selectedSite.name}/endpoints/${encodeURIComponent(apiName)}/execute`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}); AppUtils.Loader.hide(); let body; try{ body = await resp.json(); }catch(e){ body = await resp.text(); } 
        const html = `<div style="max-height:40vh;overflow:auto"><pre class="api-body-pre">${escapeHtml(typeof body === 'string' ? body : JSON.stringify(body, null, 2))}</pre></div>
          <div style="margin-top:8px;text-align:right"><button id="saveApiTestResultBtn" class="btn">Save</button></div>`;
        AppUtils.Modal.show({
          title: `Endpoint: ${apiName} — status ${resp.status}`,
          body: html
        });
        console.log('endpoint execute result', body);
        setTimeout(() => {
          const saveBtn = document.getElementById('saveApiTestResultBtn');
          if (saveBtn) {
            saveBtn.onclick = () => {
              const apiDef = (selectedSite.apis || []).find(a => a.name === apiName);
              processApiTestResult(apiDef, body);
              AppUtils.Modal.hide && AppUtils.Modal.hide();
            };
          }
        }, 100);
      }catch(err){ AppUtils.Loader.hide(); console.error(err); AppUtils.Modal.show({ title:'Error', body: escapeHtml(err.message || String(err)) }); }
      return;
    }
    // Edit API button
    const editApi = btn.dataset.editApi;
    if(editApi){
      if(!selectedSite){ showMessage('Select a site first','Error'); return; }
      try{
        const apiDef = (selectedSite.apis||[]).find(a=>a.name===editApi);
        openRestClientModal(editApi, apiDef);
      }catch(err){ console.error(err); showMessage('Could not open REST client','Error'); }
      return;
    }
    // Add API button
    const addApi = btn.dataset.addApi;
    if(addApi){
      openRestClientModal('New API', {});
      return;
    }
    // Form Builder button
    const formBuilder = btn.dataset.formBuilder;
    if(formBuilder){
      if(!selectedSite){ showMessage('Select a site first','Error'); return; }
      const method = btn.dataset.method || 'POST';
      // Store API data in sessionStorage for the form builder
      const apiDef = (selectedSite.apis||[]).find(a=>a.name===formBuilder);
      if(apiDef){
        sessionStorage.setItem('formBuilderAPI', JSON.stringify({
          api: apiDef,
          method: method,
          siteName: selectedSite.name
        }));
        const formBuilderUrl = `/admin-static/form-builder.html`;
        window.open(formBuilderUrl, '_blank');
        showMessage(`Opened form builder for ${formBuilder}`, 'Form Builder opened');
      } else {
        showMessage('API not found', 'Error');
      }
      return;
    }
    // Delete API button
    const deleteApi = btn.dataset.deleteApi;
    if(deleteApi){
      if(!selectedSite){ showMessage('Select a site first','Error'); return; }
      // confirm deletion with the user
      const ok = confirm(`Delete API "${deleteApi}"? This cannot be undone.`);
      if(!ok) return;
      try{
        AppUtils.Loader && AppUtils.Loader.show && AppUtils.Loader.show('Deleting API...');
        const resp = await fetch(`/api/sites/${selectedSite.name}/apis/${encodeURIComponent(deleteApi)}`, { method: 'DELETE' });
        AppUtils.Loader && AppUtils.Loader.hide && AppUtils.Loader.hide();
        if(!resp.ok){ const txt = await resp.text(); throw new Error(txt || 'Delete failed'); }
        // remove from local site state and re-render
        if(selectedSite && selectedSite.apis){ selectedSite.apis = (selectedSite.apis||[]).filter(a=>a.name !== deleteApi); }
        await renderSiteDetails();
        showMessage('API deleted', 'Deleted');
      }catch(err){ AppUtils.Loader && AppUtils.Loader.hide && AppUtils.Loader.hide(); console.error(err); showMessage('Could not delete API: ' + (err && err.message ? err.message : ''),'Error'); }
      return;
    }
  });
}

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
  // Drop handling moved to dragdrop.js for centralization
}

// Guided tour removed — Intro.js usage and UI were removed per request.

// Quick search
const searchInput = qs('#searchInput'); if(searchInput) searchInput.addEventListener('input', (e)=>{ const q = e.target.value.trim().toLowerCase(); if(!q){ renderSiteList(); return; } const filtered = sites.filter(s=> s.name.toLowerCase().includes(q)); const ul = qs('#siteList'); ul.innerHTML=''; filtered.forEach(s=>{ const li = document.createElement('li'); li.textContent=s.name; li.addEventListener('click', ()=> selectSite(s.name)); ul.appendChild(li); }); });

// initial load
loadSites();

  // Open custom builder button
  const openCustomBuilderBtn = qs('#openCustomBuilder');
  if(openCustomBuilderBtn) openCustomBuilderBtn.addEventListener('click', () => {
    if(!selectedSite) { showMessage('Select a site first', 'Error'); return; }
    sessionStorage.setItem('selectedSite', JSON.stringify(selectedSite));
    window.open('/custom-builder.html', '_blank');
  });// Open form builder button
const openFormBuilderBtn = qs('#openFormBuilder'); if(openFormBuilderBtn) openFormBuilderBtn.addEventListener('click', ()=> {
  if(!selectedSite){ showMessage('Select a site first','Error'); return; }
  const currentPage = qs('#pageSelect').value;
  if(!currentPage){ showMessage('Open a page first','Error'); return; }
  
  const apis = selectedSite.apis || [];
  if(apis.length === 0){ showMessage('No APIs configured. Add an API first.','Notice'); return; }
  
  // Show selector if multiple APIs
  if(apis.length === 1){
    const apiDef = apis[0];
    openFormBuilderForAPI(apiDef, currentPage);
  } else {
    const options = apis.map(a => `<option value="${a.name}">${a.name} (${(a.method||'GET').toUpperCase()})</option>`).join('');
    const html = `<div style=\"padding:12px\"><label style=\"display:block;margin-bottom:8px;font-weight:600\">Select API for Form Builder:</label><select id=\"formBuilderApiSelect\" style=\"width:100%;padding:10px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.03)\">${options}</select><button id=\"formBuilderOpenBtn\" class=\"btn\" style=\"margin-top:12px;width:100%\">Open Form Builder</button></div>`;
    AppUtils.Modal.show({ title: 'Select API', body: html });
    setTimeout(() => {
      const btn = document.getElementById('formBuilderOpenBtn');
      if(btn) btn.onclick = () => {
        const sel = document.getElementById('formBuilderApiSelect');
        const apiName = sel ? sel.value : apis[0].name;
        const apiDef = apis.find(a => a.name === apiName);
        openFormBuilderForAPI(apiDef, currentPage);
      };
    }, 100);
  }
});

function openFormBuilderForAPI(apiDef, pageName) {
  // Store API data in sessionStorage for the form builder
  sessionStorage.setItem('formBuilderAPI', JSON.stringify({
    api: apiDef,
    method: apiDef.method || 'POST',
    siteName: selectedSite.name,
    page: pageName
  }));
  const formBuilderUrl = `/admin-static/form-builder.html`;
  window.open(formBuilderUrl, '_blank');
  showMessage(`Opened form builder for ${apiDef.name} on page ${pageName}`, 'Form Builder opened');
}

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

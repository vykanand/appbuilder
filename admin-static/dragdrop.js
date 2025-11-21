// Drag and Drop Logic for AppBuilder
// Handles dropping APIs and data into the page editor

// Helper function to get caret position from coordinates
function getCaretIndexFromCoords(textarea, x, y) {
  // Simple implementation - just return current selection start
  // For more accurate implementation, would need to calculate based on text metrics
  return textarea.selectionStart || 0;
}

document.addEventListener('DOMContentLoaded', function() {
// DragDrop module loaded

  // Store last request/response from REST client for drag-and-drop
  window.lastRestClientData = {};
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'rest-client-result') {
      window.lastRestClientData = event.data;
    }
  });

  // Drag-and-drop logic for page editor
  const editorEl = qs('#pageEditor');
  if(editorEl){
    // debug: capture dragstart types for troubleshooting
    document.addEventListener('dragstart', function(ev){
      try { console.debug('dragstart', { types: ev.dataTransfer && ev.dataTransfer.types ? Array.from(ev.dataTransfer.types) : null }); } catch(e){}
    });

    // compute drop index on dragover so the caret feels responsive
    let _lastDropIndex = null;
    editorEl.addEventListener('dragover', e=>{
      e.preventDefault();
      try{ _lastDropIndex = getCaretIndexFromCoords(editorEl, e.clientX, e.clientY); }catch(err){ _lastDropIndex = editorEl.selectionStart || 0; }
    });

    editorEl.addEventListener('drop', (e)=>{
      e.preventDefault();

      // Get drop data
      var types = null;
      try { types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : null; } catch(e) { types = null; }
      const jsonData = e.dataTransfer.getData('application/json');
      const textData = e.dataTransfer.getData('text/plain');

      let payload = null;
      if(jsonData){
        try {
          payload = JSON.parse(jsonData);
        } catch(err) {
          payload = null;
        }
      }

      // Debug what was received
      try { console.debug('drop received', { types: types, jsonDataSample: jsonData && jsonData.slice ? jsonData.slice(0,200) : jsonData, textDataSample: textData && textData.slice ? textData.slice(0,200) : textData, parsedPayload: payload }); } catch(e) {}

      // Compute drop position
      let dropIndex = null;
      try{ dropIndex = getCaretIndexFromCoords(editorEl, e.clientX, e.clientY); }catch(err){ dropIndex = editorEl.selectionStart || 0; }
      const start = dropIndex;
      const end = editorEl.selectionEnd || start;
      const val = editorEl.value;

      // Handle API drops
      if(payload?.apiName){
        const method = (payload.method||'GET').toUpperCase();
        const apiName = payload.apiName;

        // Use stored sample data from API definition
        if(!payload.sample){
          try {
            if(selectedSite?.apis){
              const apiDef = selectedSite.apis.find(a=>a.name===apiName);
              if(apiDef?.bodyTemplate){
                payload.sample = typeof apiDef.bodyTemplate === 'string' ? JSON.parse(apiDef.bodyTemplate) : apiDef.bodyTemplate;
              }
            }
          } catch(err) {
            // Sample not available or invalid, continue without it
          }
        }

        let componentHtml = '';

        if(method === 'GET'){
          try {
            componentHtml = window.TemplateGenerators.generateGetComponent(payload);
          } catch(genErr) {
            console.error('generateGetComponent error', genErr);
            componentHtml = `<div>GET ${apiName} component</div>`;
          }
          try { console.debug('Generated GET componentHtml (preview)', componentHtml && componentHtml.slice ? componentHtml.slice(0,300) : componentHtml); } catch(e){}
          showMessage(`Inserted loop for ${apiName}. Edit the content inside the loop-item div to display data.`, 'Loop inserted');

        } else if(method === 'POST' || method === 'PUT' || method === 'PATCH'){
          // Always use simple form generation - let users use Form Builder button for complex forms
          componentHtml = window.TemplateGenerators.generatePostComponent(payload);
          showMessage(`Inserted form for ${apiName}`, 'Form inserted');

        } else if(method === 'DELETE'){
          componentHtml = window.TemplateGenerators.generateDeleteComponent(payload);
          showMessage(`Inserted DELETE button for ${apiName} with confirmation.`, 'Button inserted');

        } else {
          componentHtml = window.TemplateGenerators.generateOtherComponent(payload);
          showMessage(`Inserted ${method} button for ${apiName}.`, 'Button inserted');
        }

        try { console.debug('Inserting generated HTML at', start, 'length', componentHtml && componentHtml.length); } catch(e){}
        // Insert the generated component HTML
        const newVal = val.slice(0,start) + componentHtml + val.slice(end);
        editorEl.value = newVal;
        const pos = start + componentHtml.length;
        editorEl.selectionStart = editorEl.selectionEnd = pos;
        try { console.debug('Editor content after insert (preview)', editorEl.value && editorEl.value.slice ? editorEl.value.slice(Math.max(0,start-80), start+Math.min(300, componentHtml.length)) : null); } catch(e){}

        // Save page mapping for API usage tracking
        if (selectedSite && qs('#pageSelect')) {
          const currentPage = qs('#pageSelect').value;
          if (currentPage) {
            savePageMapping(currentPage, apiName, method, componentHtml);
          }
        }

        return;
      }

      // Handle field/value drops
      if(payload?.type){
        const fullPath = payload.apiPath;
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
        try { console.debug('Inserting field/value snippet', insertText); } catch(e){}
        const newVal = val.slice(0,start) + insertText + val.slice(end);
        editorEl.value = newVal;
        const pos = start + insertText.length;
        editorEl.selectionStart = editorEl.selectionEnd = pos;
        return;
      }

      // Fallback: insert plain text
      const fallback = jsonData || textData || '';
      try { console.debug('Fallback inserting plain text (preview)', fallback && fallback.slice ? fallback.slice(0,200) : fallback); } catch(e){}
      editorEl.value = val.slice(0,start) + fallback + val.slice(end);
      const pos = start + fallback.length;
      editorEl.selectionStart = editorEl.selectionEnd = pos;
    });
  }
});

// Save page mapping when API is used in a page
function savePageMapping(page, apiName, method, componentHtml) {
  // Extract basic field mappings from the component HTML
  const fieldMappings = {};
  let submitSelector = null;

  // Parse the HTML to find form inputs and submit button
  const parser = new DOMParser();
  const doc = parser.parseFromString(componentHtml, 'text/html');
  
  // Find input fields
  const inputs = doc.querySelectorAll('input[name], textarea[name], select[name]');
  inputs.forEach(input => {
    const name = input.getAttribute('name');
    if (name) {
      fieldMappings[name] = `[name="${name}"]`;
    }
  });

  // Find submit button
  const submitBtn = doc.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
  if (submitBtn) {
    if (submitBtn.id) {
      submitSelector = `#${submitBtn.id}`;
    } else if (submitBtn.className) {
      submitSelector = `.${submitBtn.className.split(' ')[0]}`;
    } else {
      submitSelector = submitBtn.tagName.toLowerCase();
      if (submitBtn.type) submitSelector += `[type="${submitBtn.type}"]`;
    }
  }

  // Save the mapping
  fetch(`/api/sites/${selectedSite.name}/page-mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page,
      apiName,
      method,
      fieldMappings,
      submitSelector
    })
  })
  .then(response => response.json())
  .then(data => {
    console.log('Page mapping saved:', data);
  })
  .catch(error => {
    console.error('Error saving page mapping:', error);
  });
}
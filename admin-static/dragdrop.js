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
    // compute drop index on dragover so the caret feels responsive
    let _lastDropIndex = null;
    editorEl.addEventListener('dragover', e=>{
      e.preventDefault();
      try{ _lastDropIndex = getCaretIndexFromCoords(editorEl, e.clientX, e.clientY); }catch(err){ _lastDropIndex = editorEl.selectionStart || 0; }
    });

    editorEl.addEventListener('drop', (e)=>{
      e.preventDefault();

      // Get drop data
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
          componentHtml = window.TemplateGenerators.generateGetComponent(payload);
          showMessage(`Inserted loop for ${apiName}. Edit the content inside the loop-item div to display data.`, 'Loop inserted');

        } else if(method === 'POST' || method === 'PUT' || method === 'PATCH'){
          componentHtml = window.TemplateGenerators.generatePostComponent(payload);
          showMessage(`Inserted form for ${apiName}`, 'Form inserted');

        } else if(method === 'DELETE'){
          componentHtml = window.TemplateGenerators.generateDeleteComponent(payload);
          showMessage(`Inserted DELETE button for ${apiName} with confirmation.`, 'Button inserted');

        } else {
          componentHtml = window.TemplateGenerators.generateOtherComponent(payload);
          showMessage(`Inserted ${method} button for ${apiName}.`, 'Button inserted');
        }

        // Insert the generated component HTML
        const newVal = val.slice(0,start) + componentHtml + val.slice(end);
        editorEl.value = newVal;
        const pos = start + componentHtml.length;
        editorEl.selectionStart = editorEl.selectionEnd = pos;
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
        const newVal = val.slice(0,start) + insertText + val.slice(end);
        editorEl.value = newVal;
        const pos = start + insertText.length;
        editorEl.selectionStart = editorEl.selectionEnd = pos;
        return;
      }

      // Fallback: insert plain text
      const fallback = jsonData || textData || '';
      editorEl.value = val.slice(0,start) + fallback + val.slice(end);
      const pos = start + fallback.length;
      editorEl.selectionStart = editorEl.selectionEnd = pos;
    });
  }
});
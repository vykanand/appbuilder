// Single clean implementation for template generators
// ES5-compatible and avoids backtick/template-literal usage

(function (window) {
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function generateGetComponent(payload) {
    // Very small generator: return a plain Handlebars foreach snippet using fields from payload.sample.
    var rawSample = payload && payload.sample !== undefined ? payload.sample : null;
    var loopVar = (payload && payload.loopVar) ? String(payload.loopVar) : 'items';
    // Prefer the API path/name from the drag payload as the loop variable when present
    try {
      if (payload && payload.apiPath && typeof payload.apiPath === 'string' && payload.apiPath.length) {
        loopVar = payload.apiPath;
      } else if (payload && payload.apiName && typeof payload.apiName === 'string' && payload.apiName.length) {
        loopVar = payload.apiName;
      }
    } catch (e) { /* ignore */ }

    // If sample is a JSON string, try to parse it to get the object/array.
    var sample = null;
    try {
      if (typeof rawSample === 'string') {
        sample = JSON.parse(rawSample);
      } else {
        sample = rawSample;
      }
    } catch (e) {
      sample = rawSample; // best-effort: leave as-is if parse fails
    }

    // If no sample provided, attempt to find sample from selectedSite.apis (when available)
    try {
      if (!sample && payload && payload.apiName && window && window.selectedSite && Array.isArray(window.selectedSite.apis)) {
        var apiDef = window.selectedSite.apis.find(function(a){ return a.name === payload.apiName; });
        if (apiDef) {
          if (apiDef.bodyTemplate) {
            try { sample = typeof apiDef.bodyTemplate === 'string' ? JSON.parse(apiDef.bodyTemplate) : apiDef.bodyTemplate; } catch(e) { sample = apiDef.bodyTemplate; }
          } else if (apiDef.sample) {
            sample = apiDef.sample;
          } else if (apiDef.exampleResponse) {
            sample = apiDef.exampleResponse;
          }
        }
      }
    } catch (e) {
      // ignore lookup errors
    }

    // If sample is an object that contains an inner array (common), detect and use that
    function findInnerArray(o, depth) {
      if (depth === undefined) depth = 4;
      if (!o || typeof o !== 'object' || depth <= 0) return null;
      for (var k in o) {
        if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
        try {
          if (Array.isArray(o[k])) return { arr: o[k], key: k };
          if (o[k] && typeof o[k] === 'object') {
            var res = findInnerArray(o[k], depth - 1);
            if (res) return res;
          }
        } catch (e) { /* ignore */ }
      }
      return null;
    }

    try {
      if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        var inner = findInnerArray(sample, 4);
        if (inner && Array.isArray(inner.arr)) {
          loopVar = inner.key || loopVar;
          sample = inner.arr;
        }
      }
    } catch (e) { /* ignore */ }

    // If no usable sample array is present but the drag payload provided a `fields` list,
    // prefer generating a loop that references those fields (helps when sample is null).
    try {
      if ((!sample || (Array.isArray(sample) && sample.length && typeof sample[0] !== 'object')) && payload && Array.isArray(payload.fields) && payload.fields.length) {
        // Try to locate a richer sample for this API (from selectedSite.apis) so we can expand nested fields
        var sampleForFields = null;
        try {
          if (window && window.selectedSite && Array.isArray(window.selectedSite.apis)) {
            var _apiDef = window.selectedSite.apis.find(function(a){ return a.name === payload.apiName; });
            if (_apiDef) {
              if (_apiDef.exampleResponse) sampleForFields = (typeof _apiDef.exampleResponse === 'string') ? JSON.parse(_apiDef.exampleResponse) : _apiDef.exampleResponse;
              else if (_apiDef.bodyTemplate) sampleForFields = (typeof _apiDef.bodyTemplate === 'string') ? JSON.parse(_apiDef.bodyTemplate) : _apiDef.bodyTemplate;
              else if (_apiDef.sample) sampleForFields = _apiDef.sample;
            }
          }
        } catch (e) { sampleForFields = null; }

        var tplF = '';
        tplF += '{{#each ' + loopVar + '}}\n';
        tplF += '  <!-- LOOP_START -->\n';
        tplF += '  <div class="loop-item">\n';

        // If we have a sample array/object, attempt to expand nested paths for each requested field
        try {
          var expandedPaths = [];
          if (sampleForFields) {
            var look = Array.isArray(sampleForFields) && sampleForFields.length ? sampleForFields[0] : sampleForFields;
            if (look && typeof look === 'object') {
              // helper collectPaths already defined later; replicate minimal logic inline to avoid ordering issues
              function _collectPaths(obj, prefix, depth) {
                if (depth === undefined) depth = 3;
                var out = [];
                for (var kk in obj) {
                  if (!Object.prototype.hasOwnProperty.call(obj, kk)) continue;
                  var vv = obj[kk];
                  var p = prefix ? (prefix + '.' + kk) : kk;
                  if (vv === null) {
                    out.push(p);
                  } else if (typeof vv === 'object') {
                    if (Array.isArray(vv)) {
                      if (vv.length > 0 && typeof vv[0] === 'object' && vv[0] !== null && depth > 1) {
                        var child = _collectPaths(vv[0], p, depth - 1);
                        for (var cci = 0; cci < child.length; cci++) out.push(child[cci]);
                      } else {
                        out.push(p);
                      }
                    } else {
                      if (depth > 1) {
                        var child2 = _collectPaths(vv, p, depth - 1);
                        for (var c2i = 0; c2i < child2.length; c2i++) out.push(child2[c2i]);
                      } else {
                        out.push(p);
                      }
                    }
                  } else {
                    out.push(p);
                  }
                }
                return out;
              }

              for (var fi2 = 0; fi2 < payload.fields.length; fi2++) {
                var fld = payload.fields[fi2];
                if (!fld || typeof fld !== 'string') continue;
                if (Object.prototype.hasOwnProperty.call(look, fld) && typeof look[fld] === 'object' && look[fld] !== null) {
                  var sub = _collectPaths(look[fld], fld, 3);
                  for (var sidx = 0; sidx < sub.length; sidx++) expandedPaths.push(sub[sidx]);
                } else {
                  expandedPaths.push(fld);
                }
              }
            }
          }
          // fallback: use plain fields if expandedPaths empty
          if (!expandedPaths || !expandedPaths.length) expandedPaths = payload.fields.slice();

          for (var epi = 0; epi < expandedPaths.length; epi++) {
            tplF += '    {{this.' + expandedPaths[epi] + '}}\n';
          }
        } catch (e) {
          // fallback to simple fields
          for (var f3 = 0; f3 < payload.fields.length; f3++) {
            var fName = payload.fields[f3];
            tplF += '    {{this.' + fName + '}}\n';
          }
        }

        tplF += '  </div>\n';
        tplF += '  <!-- LOOP_END -->\n';
        tplF += '{{/each}}';
        return '<!-- AB_TEMPLATE_GENERATOR_V2 -->\n' + tplF;
      }
    } catch (e) {
      /* ignore field-generation errors and fall through to other handlers */
    }

    // Debug info to help trace why generation may fall back
    try { if (window && window.console && window.console.debug) window.console.debug('TemplateGenerators.generateGetComponent using loopVar=', loopVar, 'sample=', sample); } catch(e) {}

    // Marker to help debug whether the updated generator is running in the admin UI
    var _ab_marker = '<!-- AB_TEMPLATE_GENERATOR_V2 -->\n';

    // If sample is an array, handle object items (including nested objects) and primitives
    if (Array.isArray(sample) && sample.length) {
      var first = sample[0];
      if (typeof first === 'object' && first !== null) {
        // recursively collect dotted paths for primitive leaves (depth-limited)
        function collectPaths(obj, prefix, depth) {
          if (depth === undefined) depth = 3;
          var out = [];
          for (var k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
            var v = obj[k];
            var path = prefix ? (prefix + '.' + k) : k;
            if (v === null) {
              out.push(path);
            } else if (typeof v === 'object') {
              if (Array.isArray(v)) {
                if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null && depth > 1) {
                  var child = collectPaths(v[0], path, depth - 1);
                  for (var ci = 0; ci < child.length; ci++) out.push(child[ci]);
                } else {
                  out.push(path);
                }
              } else {
                if (depth > 1) {
                  var child2 = collectPaths(v, path, depth - 1);
                  for (var c2 = 0; c2 < child2.length; c2++) out.push(child2[c2]);
                } else {
                  out.push(path);
                }
              }
            } else {
              out.push(path);
            }
          }
          return out;
        }

        var paths = collectPaths(first, '', 4);
        var tpl2 = '';
        tpl2 += '{{#each ' + loopVar + '}}\n';
        tpl2 += '  <!-- LOOP_START -->\n';
        tpl2 += '  <div class="loop-item">\n';
        for (var pi = 0; pi < paths.length; pi++) {
          tpl2 += '    {{this.' + paths[pi] + '}}\n';
        }
        tpl2 += '  </div>\n';
        tpl2 += '  <!-- LOOP_END -->\n';
        tpl2 += '{{/each}}';
        return _ab_marker + tpl2;
      }
      // array of primitives OR array where first item isn't an object
      // If the payload provided a `fields` list, prefer generating dotted-field placeholders
      if (payload && Array.isArray(payload.fields) && payload.fields.length) {
        var tpl3 = '';
        tpl3 += '{{#each ' + loopVar + '}}\n';
        tpl3 += '  <!-- LOOP_START -->\n';
        tpl3 += '  <div class="loop-item">\n';
        for (var fi = 0; fi < payload.fields.length; fi++) {
          var f = payload.fields[fi];
          // ensure field is a simple string key
          if (typeof f === 'string' && f.length) {
            tpl3 += '    {{this.' + f + '}}\n';
          }
        }
        tpl3 += '  </div>\n';
        tpl3 += '  <!-- LOOP_END -->\n';
        tpl3 += '{{/each}}';
        return _ab_marker + tpl3;
      }

      return _ab_marker + '{{#each ' + loopVar + '}}\n  {{this}}\n{{/each}}';
    }

    // If sample is a single object, return placeholders for its keys.
    if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
      var ok = Object.keys(sample);
      var otpl = '';
      otpl += '<div class="object-item">\n';
      for (var j = 0; j < ok.length; j++) {
        otpl += '  {{' + ok[j] + '}}\n';
      }
      otpl += '</div>';
      return _ab_marker + otpl;
    }

    // Fallback simple each
    return _ab_marker + '{{#each ' + loopVar + '}}\n  {{this}}\n{{/each}}';
  }

  function generatePostComponent(payload) {
    var apiName = payload && payload.apiName ? payload.apiName : 'api';
    var method = payload && payload.method ? String(payload.method).toUpperCase() : 'POST';
    var id = 'abform_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    var html = '';
    html += '<form id="' + id + '" data-ab-api="' + escapeHtml(apiName) + '" data-ab-method="' + escapeHtml(method) + '">';

    // Generate input fields based on sample data if available
    var sample = payload && payload.sample;
    if(sample && typeof sample === 'object' && !Array.isArray(sample)){
      var fields = Object.keys(sample);
      if(fields.length > 0){
        for(var i = 0; i < fields.length; i++){
          var field = fields[i];
          var value = sample[field];
          var inputType = 'text';
          if(typeof value === 'number') inputType = 'number';
          else if(typeof value === 'boolean') inputType = 'checkbox';
          else if(typeof value === 'string' && value.includes('@')) inputType = 'email';
          
          var fieldId = id + '_field_' + field.replace(/[^a-zA-Z0-9]/g, '_');
          if(inputType === 'checkbox'){
            html += '<label><input type="' + inputType + '" id="' + fieldId + '" name="' + escapeHtml(field) + '" data-field="' + escapeHtml(field) + '"' + (value ? ' checked' : '') + '> ' + escapeHtml(field) + ' (default: ' + (value ? 'checked' : 'unchecked') + ')</label><br>';
          } else {
            html += '<label>' + escapeHtml(field) + ': <input type="' + inputType + '" id="' + fieldId + '" name="' + escapeHtml(field) + '" data-field="' + escapeHtml(field) + '" placeholder="' + escapeHtml(String(value || '')) + '"></label><br>';
          }
        }
      }
    }

    html += '<button type="submit">Submit</button> <button type="reset">Reset</button>';
    html += '</form>';

    html += '<script>(function(){var f=document.getElementById("' + id + '"); if(!f) return; function notify(t,m){ try{ if(window.parent && window.parent.AppUtils && window.parent.AppUtils.Notify){ if(t==="success") return window.parent.AppUtils.Notify.success(m); if(t==="error") return window.parent.AppUtils.Notify.error(m); return window.parent.AppUtils.Notify.info(m);} }catch(e){} try{ if(window.parent && window.parent.showMessage) return window.parent.showMessage(m); }catch(e){} alert(m);} f.addEventListener("submit", function(e){ if(e && e.preventDefault) e.preventDefault(); var bodyData = {}; var inputs = f.querySelectorAll("input[data-field]"); for(var j=0; j<inputs.length; j++){ var inp=inputs[j]; var field = inp.getAttribute("data-field"); if(field){ var val = inp.type === "checkbox" ? inp.checked : inp.value; bodyData[field] = val; } } try{ var parts=window.location.pathname.split("/"); var site=parts.length>2?parts[2]:""; var xhr=new XMLHttpRequest(); xhr.open("POST", "/api/sites/"+site+"/endpoints/' + encodeURIComponent(apiName) + '/execute", true); xhr.setRequestHeader("Content-Type","application/json;charset=UTF-8"); xhr.onreadystatechange=function(){ if(xhr.readyState!==4) return; if(xhr.status>=200 && xhr.status<300){ notify("success","Success!"); f.reset(); } else { notify("error","Error: HTTP "+xhr.status); } }; xhr.send(JSON.stringify(bodyData)); }catch(err){ notify("error","Error: "+String(err)); } }); })()<\/script>';

    return html;
  }

  function generateDeleteComponent(payload) {
    var apiName = payload && payload.apiName ? payload.apiName : 'api';
    var id = 'abdel_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    // Prepare serialized runtime values to inject into the generated script
    var providedUrl = (payload && payload.url) ? String(payload.url) : null;
    var providedMethod = (payload && payload.method) ? String(payload.method).toUpperCase() : 'DELETE';
    var providedHeaders = (payload && payload.headers && typeof payload.headers === 'object') ? payload.headers : null;
    var providedBody = null;
    try { if (payload && payload.sample !== undefined && payload.sample !== null) providedBody = payload.sample; } catch (e) { providedBody = null; }

    // Helper to safely JSON.stringify generation-time values for embedding in the script
    function _safeStringify(v) {
      try { return JSON.stringify(v); } catch (e) { return 'null'; }
    }

    var html = '';
    html += '<button id="' + id + '" data-ab-api="' + escapeHtml(apiName) + '" data-ab-method="DELETE" style="padding:8px 12px;background:#ef4444;color:#fff;border:0;border-radius:6px">Delete ' + escapeHtml(apiName) + '</button>';

    // Generated script: will determine target URL and method at runtime, prefer direct URL if provided,
    // otherwise fall back to the server-side execute wrapper. It sends provided headers and body
    // and attempts to parse JSON responses where appropriate. Uses fetch() for modern behavior.
    html += '<script>(function(){var b=document.getElementById("' + id + '"); if(!b) return;';
    html += 'function notify(t,m){ try{ if(window.parent && window.parent.AppUtils && window.parent.AppUtils.Notify){ if(t==="success") return window.parent.AppUtils.Notify.success(m); if(t==="error") return window.parent.AppUtils.Notify.error(m); return window.parent.AppUtils.Notify.info(m);} }catch(e){} try{ if(window.parent && window.parent.showMessage) return window.parent.showMessage(m); }catch(e){} alert(m); }';
    html += 'b.addEventListener("click", function(){ if(!confirm("Are you sure?")) return; try{';

    // Embed generation-time values as JSON literals inside the runtime script
    html += 'var generatedApiName = ' + _safeStringify(apiName) + ';';
    html += 'var configuredUrl = ' + _safeStringify(providedUrl) + ';';
    html += 'var configuredMethod = ' + _safeStringify(providedMethod) + ' || "DELETE";';
    html += 'var configuredHeaders = ' + _safeStringify(providedHeaders) + ';';
    html += 'var providedBody = ' + _safeStringify(providedBody) + ';';

    // runtime decision and execution
    html += 'var parts = window.location.pathname.split("/"); var site = parts.length>2?parts[2]:"";';
    html += 'var targetUrl = null; var method = (configuredMethod||"DELETE");';
    html += 'if(configuredUrl){ targetUrl = configuredUrl; } else {';
    html += '  try{ if(window && window.selectedSite && Array.isArray(window.selectedSite.apis)){ var def = window.selectedSite.apis.find(function(a){ return a.name === generatedApiName; }); if(def && def.url) targetUrl = def.url; } }catch(e){}';
    html += '  if(!targetUrl) { targetUrl = "/api/sites/" + site + "/endpoints/" + encodeURIComponent(generatedApiName) + "/execute"; method = "POST"; }';
    html += '}';

    // Build headers and body
    html += 'var headers = {}; if(configuredHeaders && typeof configuredHeaders === "object"){ try{ for(var _hk in configuredHeaders){ if(Object.prototype.hasOwnProperty.call(configuredHeaders,_hk)) headers[_hk] = configuredHeaders[_hk]; } }catch(e){} }';
    html += 'var bodyToSend = null; var hasBody = (typeof providedBody !== "undefined" && providedBody !== null);';
    html += 'if(hasBody){ try{ if(!headers["Content-Type"]) headers["Content-Type"] = (typeof providedBody === "object")?"application/json;charset=UTF-8":"text/plain;charset=UTF-8"; }catch(e){} }';
    html += 'if(hasBody){ try{ if(typeof providedBody === "object") bodyToSend = JSON.stringify(providedBody); else bodyToSend = String(providedBody); }catch(e){ bodyToSend = String(providedBody); } }';

    html += 'var opts = { method: method, headers: headers, credentials: "same-origin" }; if(bodyToSend && method !== "GET" && method !== "HEAD") opts.body = bodyToSend;';

    html += 'fetch(targetUrl, opts).then(function(resp){ if(resp.ok){ try{ var ct = (resp.headers && resp.headers.get)?(resp.headers.get("content-type")||""):""; if(ct.indexOf("application/json")!==-1){ resp.json().then(function(d){ notify("success","Deleted"); try{ location.reload(); }catch(e){} }); } else { resp.text().then(function(t){ notify("success","Deleted"); try{ location.reload(); }catch(e){} }); } }catch(e){ notify("success","Deleted"); try{ location.reload(); }catch(e){} } } else { resp.text().then(function(txt){ notify("error","Delete failed: HTTP "+resp.status+" "+resp.statusText+" — "+txt); }).catch(function(){ notify("error","Delete failed: HTTP "+resp.status+" "+resp.statusText); }); } }).catch(function(err){ notify("error", err && err.message?err.message:String(err)); });';

    html += '}catch(err){ notify("error", err && err.message?err.message:String(err)); } });})();<\/script>';

    return html;
  }

  function generateOtherComponent(payload) {
    var method = payload && payload.method ? String(payload.method).toUpperCase() : 'GET';
    // Always delegate POST/PUT/PATCH to form generation
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      return generatePostComponent(payload);
    }
    var apiName = payload && payload.apiName ? payload.apiName : 'api';
    var id = 'abbtn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    var html = '<script>(function(){var b=document.getElementById("' + id + '"); if(!b) return; function notify(t,m){ try{ if(window.parent && window.parent.AppUtils && window.parent.AppUtils.Notify){ if(t==="success") return window.parent.AppUtils.Notify.success(m); if(t==="error") return window.parent.AppUtils.Notify.error(m); return window.parent.AppUtils.Notify.info(m);} }catch(e){} try{ if(window.parent && window.parent.showMessage) return window.parent.showMessage(m); }catch(e){} alert(m);} b.addEventListener("click", function(){ try{ var parts=window.location.pathname.split("/"); var site=parts.length>2?parts[2]:""; var xhr=new XMLHttpRequest(); xhr.open("POST", "/api/sites/"+site+"/endpoints/' + encodeURIComponent(apiName) + '/execute", true); xhr.setRequestHeader("Content-Type","application/json;charset=UTF-8"); xhr.onreadystatechange=function(){ if(xhr.readyState!==4) return; if(xhr.status>=200 && xhr.status<300){ try{ notify("success", xhr.responseText||"Success"); }catch(e){} } else { try{ notify("error","HTTP "+xhr.status+": "+xhr.statusText); }catch(e){} } }; xhr.send(JSON.stringify({})); }catch(err){ notify("error", err && err.message?err.message:String(err)); } }); })()<\/script>';
    return html;
  }

  // Expose
  window.TemplateGenerators = {
    generateGetComponent: generateGetComponent,
    generatePostComponent: generatePostComponent,
    generateDeleteComponent: generateDeleteComponent,
    generateOtherComponent: generateOtherComponent
  };

})(window);
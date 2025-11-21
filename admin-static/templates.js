// Single clean implementation for template generators
// ES5-compatible and avoids backtick/template-literal usage

(function (window) {
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function generateGetComponent(payload) {
    var apiName = payload && payload.apiName ? payload.apiName : '';
    return '<div class="ab-get-component">GET ' + escapeHtml(apiName) + '</div>';
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

    html += '<script>(function(){var f=document.getElementById("' + id + '"); if(!f) return; function showNotification(message, isSuccess){ var notif=document.createElement("div"); notif.textContent=message; notif.style.cssText="position:fixed;top:20px;right:20px;padding:10px 20px;border-radius:4px;color:#fff;background:"+ (isSuccess?"#4CAF50":"#f44336") +";z-index:10000"; document.body.appendChild(notif); setTimeout(function(){ if(notif.parentNode) notif.parentNode.removeChild(notif); }, 3000); } f.addEventListener("submit", function(e){ if(e && e.preventDefault) e.preventDefault(); var bodyData = {}; var inputs = f.querySelectorAll("input[data-field]"); for(var j=0; j<inputs.length; j++){ var inp=inputs[j]; var field = inp.getAttribute("data-field"); if(field){ var val = inp.type === "checkbox" ? inp.checked : inp.value; bodyData[field] = val; } } try{ var parts=window.location.pathname.split("/"); var site=parts.length>2?parts[2]:""; var xhr=new XMLHttpRequest(); xhr.open("' + method + '", "/api/sites/"+site+"/endpoints/' + encodeURIComponent(apiName) + '/execute", true); xhr.setRequestHeader("Content-Type","application/json;charset=UTF-8"); xhr.onreadystatechange=function(){ if(xhr.readyState!==4) return; if(xhr.status>=200 && xhr.status<300){ showNotification("Success!", true); f.reset(); } else { showNotification("Error: HTTP "+xhr.status, false); } }; xhr.send(JSON.stringify(bodyData)); }catch(err){ showNotification("Error: "+String(err), false); } }); })()<\/script>';

    return html;
  }

  function generateDeleteComponent(payload) {
    var apiName = payload && payload.apiName ? payload.apiName : 'api';
    var id = 'abdel_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    var html = '<button id="' + id + '" data-ab-api="' + escapeHtml(apiName) + '" data-ab-method="DELETE" style="padding:8px 12px;background:#ef4444;color:#fff;border:0;border-radius:6px">Delete ' + escapeHtml(apiName) + '</button>';
    html += '<script>(function(){var b=document.getElementById("' + id + '"); if(!b) return; function notify(t,m){ try{ if(window.parent && window.parent.AppUtils && window.parent.AppUtils.Notify){ if(t==="success") return window.parent.AppUtils.Notify.success(m); if(t==="error") return window.parent.AppUtils.Notify.error(m); return window.parent.AppUtils.Notify.info(m);} }catch(e){} try{ if(window.parent && window.parent.showMessage) return window.parent.showMessage(m); }catch(e){} alert(m);} b.addEventListener("click", function(){ if(!confirm("Are you sure?")) return; try{ var parts=window.location.pathname.split("/"); var site=parts.length>2?parts[2]:""; var xhr=new XMLHttpRequest(); xhr.open("POST", "/api/sites/"+site+"/endpoints/' + encodeURIComponent(apiName) + '/execute", true); xhr.setRequestHeader("Content-Type","application/json;charset=UTF-8"); xhr.onreadystatechange=function(){ if(xhr.readyState!==4) return; if(xhr.status>=200 && xhr.status<300){ try{ notify("success","Deleted"); location.reload(); }catch(e){} } else { try{ notify("error","Delete failed: HTTP "+xhr.status+" "+xhr.statusText); }catch(e){} } }; xhr.send(JSON.stringify({})); }catch(err){ notify("error", err && err.message?err.message:String(err)); } }); })()<\/script>';
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
    var html = '<script>(function(){var b=document.getElementById("' + id + '"); if(!b) return; function notify(t,m){ try{ if(window.parent && window.parent.AppUtils && window.parent.AppUtils.Notify){ if(t==="success") return window.parent.AppUtils.Notify.success(m); if(t==="error") return window.parent.AppUtils.Notify.error(m); return window.parent.AppUtils.Notify.info(m);} }catch(e){} try{ if(window.parent && window.parent.showMessage) return window.parent.showMessage(m); }catch(e){} alert(m);} b.addEventListener("click", function(){ try{ var parts=window.location.pathname.split("/"); var site=parts.length>2?parts[2]:""; var xhr=new XMLHttpRequest(); xhr.open("' + method + '", "/api/sites/"+site+"/endpoints/' + encodeURIComponent(apiName) + '/execute", true); xhr.setRequestHeader("Content-Type","application/json;charset=UTF-8"); xhr.onreadystatechange=function(){ if(xhr.readyState!==4) return; if(xhr.status>=200 && xhr.status<300){ try{ notify("success", xhr.responseText||"Success"); }catch(e){} } else { try{ notify("error","HTTP "+xhr.status+": "+xhr.statusText); }catch(e){} } }; xhr.send(JSON.stringify({})); }catch(err){ notify("error", err && err.message?err.message:String(err)); } }); })()<\/script>';
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
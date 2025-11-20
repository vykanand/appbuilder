// Simple reusable modal and loader utilities
(function(window){
  // capture native console methods to avoid accidental recursion
  const _nativeConsole = {
    log: console.log && console.log.bind ? console.log.bind(console) : (...a)=>{},
    info: console.info && console.info.bind ? console.info.bind(console) : (...a)=>{},
    warn: console.warn && console.warn.bind ? console.warn.bind(console) : (...a)=>{},
    error: console.error && console.error.bind ? console.error.bind(console) : (...a)=>{},
  };
  function createModal(){
    const overlay = document.createElement('div');
    overlay.className = 'ab-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.6);display:none;align-items:center;justify-content:center;z-index:10000';
    const dlg = document.createElement('div');
    dlg.className = 'ab-modal';
    dlg.style.cssText = 'background:linear-gradient(180deg,#071022,#0b1424);color:#e6eef8;padding:16px;border-radius:12px;max-width:900px;width:90%;max-height:80%;overflow:auto;box-shadow:0 10px 30px rgba(2,6,23,0.7)';
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);

    function show(opts){
      dlg.innerHTML = '';
      if(opts.title){ const h = document.createElement('div'); h.style.cssText='font-weight:700;margin-bottom:8px'; h.textContent = opts.title; dlg.appendChild(h); }
      const content = document.createElement('div');
      // support multiple content keys for compatibility: body, html, text
      if(opts.body){ content.innerHTML = opts.body; }
      else if(opts.html){ content.innerHTML = opts.html; }
      else if(opts.text){ const pre = document.createElement('pre'); pre.style.cssText='white-space:pre-wrap;word-break:break-word;color:#dbeafe;background:rgba(255,255,255,0.02);padding:10px;border-radius:8px'; pre.textContent = opts.text; content.appendChild(pre); }
      dlg.appendChild(content);
      const footer = document.createElement('div'); footer.style.cssText='display:flex;gap:8px;justify-content:flex-end;margin-top:12px';
      if(opts.buttons && Array.isArray(opts.buttons)){
        for(const b of opts.buttons){
          const btn = document.createElement('button'); btn.className='btn'; btn.textContent = b.label || 'OK';
          if(b.variant === 'ghost') btn.className = 'btn ghost';
          btn.onclick = ()=>{ if(b.onClick) b.onClick(); if(b.closeOnClick!==false) hide(); };
          footer.appendChild(btn);
        }
      } else {
        const ok = document.createElement('button'); ok.className='btn'; ok.textContent='Close'; ok.onclick = hide; footer.appendChild(ok);
      }
      dlg.appendChild(footer);
      overlay.style.display = 'flex';
    }

    function hide(){ overlay.style.display = 'none'; }

    return { show, hide, el: overlay };
  }

  function createLoader(){
    const l = document.createElement('div'); l.className='ab-loader';
    l.style.cssText='position:fixed;right:18px;bottom:18px;background:rgba(0,0,0,0.6);color:white;padding:8px 12px;border-radius:10px;display:none;z-index:12000;box-shadow:0 6px 18px rgba(0,0,0,0.5)';
    l.textContent = 'Loading...';
    document.body.appendChild(l);
    return {
      show: ()=> { l.style.display = 'block'; },
      hide: ()=> { l.style.display = 'none'; }
    };
  }

  // expose to window
  window.AppUtils = window.AppUtils || {};
  window.AppUtils.Modal = createModal();
  window.AppUtils.Loader = createLoader();

  // Simple top-bar notification system (reusable)
  function createNotifier(){
    const wrap = document.createElement('div'); wrap.className = 'ab-notify-wrap';
    wrap.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:13000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:90%;';
    document.body.appendChild(wrap);

    function show(type, message, opts={timeout:3500}){
      try{
        const n = document.createElement('div'); n.className = `ab-notify ab-notify-${type}`; n.style.cssText = 'pointer-events:auto;min-width:280px;max-width:720px;padding:10px 14px;border-radius:8px;box-shadow:0 8px 24px rgba(2,6,23,0.6);display:flex;justify-content:space-between;gap:12px;align-items:center';
        const txt = document.createElement('div'); txt.innerHTML = message;
        const close = document.createElement('button'); close.className = 'btn small ghost'; close.textContent = '×'; close.style.marginLeft='12px'; close.onclick = ()=>{ wrap.removeChild(n); };
        n.appendChild(txt); n.appendChild(close);
        wrap.appendChild(n);
        if(opts.timeout && opts.timeout>0){ setTimeout(()=>{ try{ if(n.parentNode) n.parentNode.removeChild(n); }catch(e){} }, opts.timeout); }
        return n;
      }catch(e){ console.error('notify', e); }
    }

    return { show };
  }

  window.AppUtils.Notifier = createNotifier();
  window.AppUtils.Notify = {
    success: (msg, opts)=> window.AppUtils.Notifier.show('success', msg, opts),
    error: (msg, opts)=> window.AppUtils.Notifier.show('error', msg, opts),
    info: (msg, opts)=> window.AppUtils.Notifier.show('info', msg, opts)
  };

  // lightweight client-side logger that also posts logs to server
  function sendClientLog(level, message, meta){
    try{
      fetch('/api/logs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ level, message, meta }) }).catch(()=>{});
    }catch(e){}
  }

  const Logger = {
    log: (...args) => { const msg = args.map(a=> typeof a === 'string' ? a : JSON.stringify(a)).join(' '); _nativeConsole.log(`[LOG] ${new Date().toISOString()} ${msg}`); sendClientLog('info', msg); },
    info: (...args) => { const msg = args.map(a=> typeof a === 'string' ? a : JSON.stringify(a)).join(' '); _nativeConsole.info(`[INFO] ${new Date().toISOString()} ${msg}`); sendClientLog('info', msg); },
    warn: (...args) => { const msg = args.map(a=> typeof a === 'string' ? a : JSON.stringify(a)).join(' '); _nativeConsole.warn(`[WARN] ${new Date().toISOString()} ${msg}`); sendClientLog('warn', msg); },
    error: (...args) => { const msg = args.map(a=> (a && a.stack) ? a.stack : (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); _nativeConsole.error(`[ERROR] ${new Date().toISOString()} ${msg}`); sendClientLog('error', msg); }
  };
  window.AppUtils.Logger = Logger;

  // global error handlers for client-side
  window.addEventListener('error', function(evt){
    try{ const msg = `${evt.message} at ${evt.filename}:${evt.lineno}:${evt.colno}`; Logger.error(msg); }catch(e){ console.error(e); }
  });
  window.addEventListener('unhandledrejection', function(evt){
    try{ const r = evt.reason; Logger.error('Unhandled Rejection: ' + (r && r.stack ? r.stack : JSON.stringify(r))); }catch(e){ console.error(e); }
  });
})(window);

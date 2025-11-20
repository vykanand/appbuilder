const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'app.log');

function timestamp(){ return new Date().toISOString(); }

function write(level, msg){
  const line = `[${timestamp()}] [${level.toUpperCase()}] ${msg}\n`;
  try{ fs.appendFileSync(LOG_FILE, line); }catch(e){ /* best effort */ }
  // also write to stdout
  if(level === 'error') console.error(line); else console.log(line);
}

module.exports = {
  info: (msg) => write('info', typeof msg === 'string' ? msg : JSON.stringify(msg)),
  warn: (msg) => write('warn', typeof msg === 'string' ? msg : JSON.stringify(msg)),
  error: (msg) => write('error', typeof msg === 'string' ? msg : (msg && msg.stack) ? msg.stack : JSON.stringify(msg)),
  debug: (msg) => write('debug', typeof msg === 'string' ? msg : JSON.stringify(msg)),
  requestLogger: function(req, res, next){
    const start = Date.now();
    res.on('finish', ()=>{
      const ms = Date.now() - start;
      const meta = `${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`;
      write('info', meta);
    });
    next();
  }
};

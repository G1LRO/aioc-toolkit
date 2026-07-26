'use strict';

// ── Shared activity log (used by both the Configure and Flash Firmware tabs) ─
function log(msg, level = 'info') {
  const scrl = document.getElementById('log-scrl');
  const ts = new Date().toLocaleTimeString('en', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const el = document.createElement('div');
  el.className = `le ${level}`;
  el.innerHTML = `<span class="ts">${ts}</span><span class="m">${escHtml(String(msg))}</span>`;
  scrl.appendChild(el);
  scrl.scrollTop = scrl.scrollHeight;
}
function logOk(m)   { log(m, 'ok');   }
function logWarn(m) { log(m, 'warn'); }
function logErr(m)  { log(m, 'err');  }

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.getElementById('btn-clrlog').addEventListener('click', () => {
  document.getElementById('log-scrl').innerHTML = '';
});

// ── Tabs ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-section').forEach(s => {
      s.hidden = (s.id !== `tab-${btn.dataset.tab}`);
    });
  });
});

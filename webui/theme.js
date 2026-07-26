'use strict';

// Light is the default look; dark is a one-click opt-in via the header toggle.
function applyTheme(theme) {
  const root = document.documentElement;
  const btn = document.getElementById('btn-theme');
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    btn.title = 'Switch to light theme';
    btn.setAttribute('aria-label', 'Switch to light theme');
  } else {
    root.removeAttribute('data-theme');
    btn.title = 'Switch to dark theme';
    btn.setAttribute('aria-label', 'Switch to dark theme');
  }
}
applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
document.getElementById('btn-theme').addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('aioc-toolkit-theme', next); } catch (e) {}
});

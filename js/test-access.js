import { session } from './supabase.js';

function authUrl(mode = '') {
  const current = `${location.pathname.split('/').pop() || 'index.html'}${location.search}`;
  const params = new URLSearchParams({ next: current });
  if (mode) params.set('mode', mode);
  return `auth.html?${params.toString()}`;
}

function renderSignInPrompt() {
  const main = document.querySelector('#main');
  if (!main) return;
  main.innerHTML = `
    <div class="container test-auth-gate">
      <section class="card test-auth-card">
        <div class="eyebrow">ტესტები</div>
        <h1>ტესტის გასაგრძელებლად შედით ანგარიშზე</h1>
        <p class="lead">ტესტებით სარგებლობისთვის საჭიროა რეგისტრაცია ან თქვენს ანგარიშზე შესვლა.</p>
        <div class="hero-actions">
          <a class="btn" href="${authUrl()}">შესვლა</a>
          <a class="btn secondary" href="${authUrl('signup')}">რეგისტრაცია</a>
        </div>
      </section>
    </div>
  `;
}

export async function requireTestAccess() {
  const activeSession = await session();
  if (activeSession) return true;
  renderSignInPrompt();
  return false;
}

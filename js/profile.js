import { getClient } from './supabase.js';

document.querySelector('#sign-out-btn')?.addEventListener('click', async () => {
  const client = await getClient();
  if (client) await client.auth.signOut();
  location.href = 'index.html';
});

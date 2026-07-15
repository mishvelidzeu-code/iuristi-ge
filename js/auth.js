const $ = (selector) => document.querySelector(selector);

let mode = 'login';

function setMode(nextMode) {
  mode = nextMode;
  const isSignup = mode === 'signup';
  document.querySelectorAll('.tab').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.setAttribute('aria-selected', String(active));
    button.classList.toggle('secondary', !active);
  });
  $('#name-field').classList.toggle('hidden', !isSignup);
  $('#auth-submit').textContent = isSignup ? 'ანგარიშის შექმნა' : 'შესვლა';
  $('#auth-title').textContent = isSignup ? 'შექმენით ახალი ანგარიში' : 'კეთილი იყოს თქვენი დაბრუნება';
  $('#password').autocomplete = isSignup ? 'new-password' : 'current-password';
  $('#auth-status').textContent = '';
}

document.querySelectorAll('.tab').forEach((button) => {
  button.onclick = () => setMode(button.dataset.mode);
});

$('#auth-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#auth-submit');
  const status = $('#auth-status');
  button.disabled = true;
  status.textContent = '';

  try {
    const client = await window.App.getClient();
    if (!client) {
      status.textContent = 'დემო რეჟიმში ავტორიზაციისთვის დაამატეთ Supabase კონფიგურაცია.';
      return;
    }

    const email = $('#email').value.trim();
    const password = $('#password').value;
    const fullName = $('#full-name').value.trim();
    const result = mode === 'signup'
      ? await client.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      : await client.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;
    location.href = 'profile.html';
  } catch (error) {
    status.textContent = window.App.friendlyError(error);
  } finally {
    button.disabled = false;
  }
});

$('#reset-password')?.addEventListener('click', async () => {
  const email = $('#email').value.trim();
  if (!email) {
    window.App.toast('ჯერ მიუთითეთ ელფოსტა.');
    return;
  }

  try {
    const client = await window.App.getClient();
    if (!client) throw new Error('Supabase კონფიგურაცია ვერ მოიძებნა.');
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth.html`,
    });
    if (error) throw error;
    window.App.toast('აღდგენის ბმული გაგზავნილია ელფოსტაზე.');
  } catch (error) {
    window.App.toast(window.App.friendlyError(error));
  }
});

setMode('login');

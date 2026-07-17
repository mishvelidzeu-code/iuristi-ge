import { questions } from './data.js';

const $ = (selector) => document.querySelector(selector);

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('ka-GE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderQuestions(items) {
  $('#admin-questions').replaceChildren(...items.map((q) => {
    const tr = document.createElement('tr');
    [q.text, `${q.law}, ${q.article}`, 'დადასტურებული'].forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });
    const td = document.createElement('td');
    const button = document.createElement('button');
    button.className = 'btn secondary';
    button.textContent = 'რედაქტირება';
    button.onclick = () => window.App.toast('რედაქტირება Supabase-ის ჩართვის შემდეგ შეინახება.');
    td.append(button);
    tr.append(td);
    return tr;
  }));
}

function renderOrders(orders) {
  const body = $('#admin-test-orders');
  if (!body) return;
  if (!orders?.length) {
    body.innerHTML = '<tr><td colspan="4">ტესტის შეკვეთები ჯერ არ არის.</td></tr>';
    return;
  }
  body.replaceChildren(...orders.map((order) => {
    const tr = document.createElement('tr');
    const cells = [
      formatDate(order.created_at),
      `${order.name || '-'}\n${order.contact || '-'}`,
      order.details || '-',
      order.status || 'new',
    ];
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });
    return tr;
  }));
}

async function loadOrders(client) {
  const body = $('#admin-test-orders');
  if (!body || !client) return;
  const { data, error } = await client
    .from('test_orders')
    .select('id,name,contact,details,status,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  renderOrders(data || []);
}

async function init() {
  const status = $('#admin-status');
  try {
    const client = await window.App.getClient();
    if (client) {
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('AUTH');
      const { data, error } = await client
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (error || data?.role !== 'admin') throw new Error('ADMIN');
      await loadOrders(client);
    } else {
      status.innerHTML = '<div class="notice">დემო რეჟიმი — რეალურ რეჟიმში ეს გვერდი ხელმისაწვდომია მხოლოდ admin როლისთვის.</div>';
      renderOrders([]);
    }
    renderQuestions(questions);
  } catch (error) {
    document.querySelector('main').innerHTML = '<div class="container card"><h1>წვდომა აკრძალულია</h1><p>ადმინისტრატორის უფლებები ვერ დადასტურდა.</p><a class="btn" href="auth.html">შესვლა</a></div>';
  }
}

$('#admin-search').oninput = (event) => {
  renderQuestions(questions.filter((q) => (q.text + q.law + q.article).includes(event.target.value)));
};

$('#add-question').onclick = () => window.App.toast('კითხვის ფორმა მზადაა მონაცემთა ბაზასთან დასაკავშირებლად.');

init();

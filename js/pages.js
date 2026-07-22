import { categories, laws as fallbackLaws, questions } from './data.js';
import { session } from './supabase.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

const directionNames = {
  constitutional: 'კონსტიტუციური',
  criminal: 'სისხლის',
  civil: 'სამოქალაქო',
  administrative: 'ადმინისტრაციული',
  labor: 'შრომის',
  tax: 'საგადასახადო',
  other: 'სხვა',
};

function card(c) {
  return `<article class="card"><div class="eyebrow">${esc(c.icon)} სამართალი</div><h3>${esc(c.title)}</h3><p class="meta">${esc(c.desc)}</p><div class="card-footer"><span>${c.count} კითხვა</span><a class="btn" href="quiz.html?category=${encodeURIComponent(c.id)}">დაწყება</a></div></article>`;
}

let isAdminUser = false;

async function checkAdmin() {
  try {
    const client = await window.App.getClient();
    if (!client) return false;
    const { data: { session: authSession } } = await client.auth.getSession();
    if (!authSession) return false;
    const { data, error } = await client.from('profiles').select('role').eq('id', authSession.user.id).single();
    if (error) return false;
    return data?.role === 'admin';
  } catch {
    return false;
  }
}

function lawTestCard(law) {
  const direction = law.direction_slug || law.direction || 'other';
  const count = law.question_count ?? law.count ?? 0;
  const title = law.title || law.short_title || law.short;
  const desc = law.description || law.desc || '';
  const countBadge = isAdminUser ? `<span class="question-total">${count} კითხვა</span>` : '';
  return `<article class="card test-card"><div class="eyebrow">${esc(directionNames[direction] || 'სამართლის')} ტესტი</div><h3>${esc(title)}</h3><p class="meta">${esc(desc)}</p><div class="card-footer">${countBadge}<div class="test-actions"><a class="btn" href="quiz.html?law=${encodeURIComponent(law.slug)}&mode=learning">სასწავლო ტესტი</a><a class="btn secondary" href="quiz.html?law=${encodeURIComponent(law.slug)}&mode=exam">საგამოცდო ტესტი</a></div></div></article>`;
}

if ($('#categories')) $('#categories').remove();

if ($('#test-list')) {
  let lawTests = fallbackLaws.filter((law) => (law.count ?? 0) > 0);
  let customSelections = {};

  const normalize = (value) => String(value || '').toLowerCase();
  const availableCount = (law) => Number(law.question_count ?? law.count ?? 0);
  const render = () => {
    const q = normalize($('#search').value);
    const cat = $('#category').value;
    const diff = $('#difficulty').value;
    const access = $('#access').value;

    const categoryCards = categories
      .filter((c) => (
        (!cat || c.id === cat)
        && (!q || normalize(`${c.title} ${c.desc}`).includes(q))
        && (!diff || questions.some((x) => x.category === c.id && x.difficulty === diff))
        && (access === 'ყველა' || access === 'უფასო')
      ))
      .map((item) => ({ type: 'category', item }));

    const lawCards = lawTests
      .filter((law) => {
        const direction = law.direction_slug || law.direction;
        const count = law.question_count ?? law.count ?? 0;
        const haystack = normalize(`${law.title} ${law.short_title || law.short || ''} ${law.description || law.desc || ''}`);
        return count > 0
          && (!cat || direction === cat)
          && (!q || haystack.includes(q))
          && !diff
          && (access === 'ყველა' || access === 'უფასო');
      })
      .map((item) => ({ type: 'law', item }));

    const data = lawCards;
    $('#test-list').innerHTML = data.length
      ? data.map((entry) => lawTestCard(entry.item)).join('')
      : '<p class="card">ტესტი ვერ მოიძებნა.</p>';
  };

  async function loadLawTests() {
    try {
      const client = await window.App.getClient();
      if (!client) {
        render();
        return;
      }
      const { data, error } = await client.rpc('get_law_catalog', { p_direction: null });
      if (error) throw error;
      lawTests = data || [];
    } catch {
      lawTests = fallbackLaws.filter((law) => (law.count ?? 0) > 0);
      window.App.toast('კანონებზე მიბმული ტესტები დროებით დემო მონაცემებიდან ჩაიტვირთა.');
    }
    render();
  }

  function selectedTotal() {
    return Object.values(customSelections).reduce((sum, count) => sum + Number(count || 0), 0);
  }

  function renderCustomBuilder() {
    const modal = $('#custom-test-modal');
    if (!modal) return;
    const list = $('#custom-law-list');
    const selected = $('#custom-selected-list');
    const total = selectedTotal();
    const searchable = normalize($('#custom-law-search')?.value || '');
    const rows = lawTests
      .filter((law) => availableCount(law) > 0)
      .filter((law) => !searchable || normalize(`${law.title} ${law.short_title || law.short || ''}`).includes(searchable));

    $('#custom-total').textContent = `${total} / 100`;
    $('#custom-auto-fill').textContent = total < 100
      ? `დარჩენილი ${100 - total} კითხვა ავტომატურად შეივსება სხვა კანონებიდან.`
      : total === 100 ? 'ტესტი სრულად არის შევსებული.' : 'რაოდენობა 100-ზე მეტია — შეამცირე.';
    $('#custom-start').disabled = total <= 0 || total > 100;

    list.innerHTML = rows.map((law) => {
      const slug = law.slug;
      const count = availableCount(law);
      const current = customSelections[slug] || '';
      return `<div class="custom-law-row"><div><b>${esc(law.short_title || law.short || law.title)}</b><span>${count} კითხვა</span></div><div class="custom-law-actions"><input type="number" min="1" max="${Math.min(100, count)}" value="${current}" data-custom-count="${esc(slug)}" placeholder="რაოდ."><button class="btn secondary" type="button" data-custom-add="${esc(slug)}">+</button></div></div>`;
    }).join('');

    const selectedRows = Object.entries(customSelections)
      .map(([slug, count]) => {
        const law = lawTests.find((item) => item.slug === slug);
        if (!law) return '';
        return `<div class="custom-selected-row"><span>${esc(law.short_title || law.short || law.title)}</span><b>${count}</b><button type="button" class="btn secondary" data-custom-remove="${esc(slug)}">წაშლა</button></div>`;
      })
      .join('');
    selected.innerHTML = selectedRows || '<p class="meta">ჯერ კანონი არ არის დამატებული.</p>';
  }

  function openCustomBuilder() {
    let modal = $('#custom-test-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'custom-test-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `<section class="card custom-builder" role="dialog" aria-modal="true" aria-labelledby="custom-test-title"><div class="section-head"><div><div class="eyebrow">საგამოცდო კონსტრუქტორი</div><h2 id="custom-test-title">დაამზადე ტესტი</h2></div><button class="btn secondary" type="button" id="custom-close">დახურვა</button></div><p class="meta">აირჩიე კანონები და მიუთითე რამდენი კითხვა მოვიდეს თითო კანონიდან. ჯამი არის 100 ქულა/100 კითხვა.</p><div class="custom-builder-grid"><div><div class="field"><label for="custom-law-search">კანონის ძებნა</label><input id="custom-law-search" type="search" placeholder="მაგ. კონსტიტუცია"></div><div id="custom-law-list" class="custom-law-list"></div></div><aside><div class="custom-total"><span>ჯამი</span><b id="custom-total">0 / 100</b></div><p class="meta" id="custom-auto-fill"></p><div id="custom-selected-list"></div><button class="btn" type="button" id="custom-start">საგამოცდო ტესტის შექმნა</button></aside></div></section>`;
      document.body.append(modal);
      $('#custom-close').onclick = () => modal.hidden = true;
      modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.hidden = true;
        const add = event.target.closest('[data-custom-add]');
        const remove = event.target.closest('[data-custom-remove]');
        if (add) {
          const slug = add.dataset.customAdd;
          const law = lawTests.find((item) => item.slug === slug);
          const existing = Number(customSelections[slug] || 0);
          const remaining = Math.max(0, 100 - selectedTotal());
          const typedInput = [...modal.querySelectorAll('[data-custom-count]')].find((item) => item.dataset.customCount === slug);
          const typed = Number(typedInput?.value || 0);
          const next = typed || existing || Math.min(remaining || 10, availableCount(law), 10);
          customSelections[slug] = Math.max(1, Math.min(availableCount(law), next));
          renderCustomBuilder();
        } else if (remove) {
          delete customSelections[remove.dataset.customRemove];
          renderCustomBuilder();
        }
      });
      modal.addEventListener('change', (event) => {
        const input = event.target.closest('[data-custom-count]');
        if (!input) return;
        const slug = input.dataset.customCount;
        const value = Math.max(0, Math.min(Number(input.max), Number(input.value || 0)));
        if (value) customSelections[slug] = value;
        else delete customSelections[slug];
        renderCustomBuilder();
      });
      $('#custom-law-search').addEventListener('input', renderCustomBuilder);
      $('#custom-start').onclick = () => {
        const selections = Object.entries(customSelections)
          .filter(([, count]) => Number(count) > 0)
          .map(([slug, count]) => ({ slug, count: Number(count) }));
        localStorage.setItem('iuristi_custom_exam', JSON.stringify({
          id: crypto.randomUUID(),
          total: 100,
          selections,
          createdAt: Date.now(),
        }));
        location.href = 'quiz.html?mode=exam&custom=1';
      };
    }
    modal.hidden = false;
    renderCustomBuilder();
  }

  function installCustomBuilderButton() {
    const head = $('.section-head');
    if (!head || $('#open-custom-test')) return;
    let actions = $('#test-page-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'test-page-actions';
      actions.className = 'test-page-actions';
      head.append(actions);
    }
    const button = document.createElement('button');
    button.className = 'btn gold';
    button.id = 'open-custom-test';
    button.type = 'button';
    button.textContent = 'დაამზადე ტესტი';
    button.onclick = openCustomBuilder;
    actions.append(button);

    const orderButton = document.createElement('button');
    orderButton.className = 'btn order-test-btn';
    orderButton.id = 'open-test-order';
    orderButton.type = 'button';
    orderButton.textContent = 'ტესტის შეკვეთა';
    orderButton.onclick = openTestOrderModal;
    actions.append(orderButton);
  }

  function openTestOrderModal() {
    let modal = $('#test-order-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'test-order-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `<section class="card test-order-modal" role="dialog" aria-modal="true" aria-labelledby="test-order-title"><div class="section-head"><div><div class="eyebrow">ინდივიდუალური შეკვეთა</div><h2 id="test-order-title">ტესტის შეკვეთა</h2></div><button class="btn secondary" type="button" id="test-order-close">დახურვა</button></div><p class="meta">დაწერე რა ტიპის ტესტი გჭირდება, რა თემაზე, რა სირთულის, რისთვის გჭირდება და რამდენ კითხვას ელოდები. მოთხოვნა ჩაიწერება ადმინთან და გაიხსნება ელფოსტის გაგზავნის ფანჯარაც.</p><form id="test-order-form" class="test-order-form"><div class="field"><label for="order-name">სახელი</label><input id="order-name" name="name" autocomplete="name" placeholder="თქვენი სახელი"></div><div class="field"><label for="order-contact">საკონტაქტო ელფოსტა ან ტელეფონი</label><input id="order-contact" name="contact" autocomplete="email" placeholder="ელფოსტა ან ტელეფონი" required></div><div class="field"><label for="order-details">რა ტესტი გჭირდება?</label><textarea id="order-details" name="details" rows="8" placeholder="მაგალითად: მჭირდება 100 კითხვა სისხლის სამართლის პროცესში, საშუალო/რთული, გამოცდისთვის, კაზუსური და განმარტებებით..." required></textarea></div><p class="status" id="test-order-status" role="alert"></p><button class="btn order-test-btn" type="submit">შეკვეთის გაგზავნა</button></form></section>`;
      document.body.append(modal);
      $('#test-order-close').onclick = () => modal.hidden = true;
      modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.hidden = true;
      });
      $('#test-order-form').onsubmit = submitTestOrder;
    }
    modal.hidden = false;
    $('#order-details')?.focus();
  }

  async function submitTestOrder(event) {
    event.preventDefault();
    const status = $('#test-order-status');
    const form = event.currentTarget;
    const name = $('#order-name').value.trim();
    const contact = $('#order-contact').value.trim();
    const details = $('#order-details').value.trim();
    const adminEmail = 'toilet.ge@gmail.com';
    if (!contact || !details) {
      status.textContent = 'საკონტაქტო და განმარტება აუცილებელია.';
      return;
    }
    status.textContent = 'იგზავნება...';
    let stored = false;
    try {
      const client = await window.App.getClient();
      if (client) {
        const { error } = await client.from('test_orders').insert({
          name: name || null,
          contact,
          details,
          page_url: location.href,
          status: 'new',
        });
        if (error) throw error;
        stored = true;
      }
    } catch (error) {
      console.warn('test order db insert failed', error);
    }

    const subject = 'ტესტის შეკვეთა - sagamocdo.ge';
    const body = [
      `სახელი: ${name || '-'}`,
      `საკონტაქტო: ${contact}`,
      '',
      'მოთხოვნა:',
      details,
      '',
      `გვერდი: ${location.href}`,
    ].join('\n');
    window.location.href = `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = stored
      ? 'შეკვეთა ჩაიწერა ადმინთან. ელფოსტის ფანჯარაც გაიხსნა.'
      : 'ელფოსტის ფანჯარა გაიხსნა. თუ არ გაიხსნა, გადაამოწმე ბრაუზერის mail app.';
    form.reset();
  }

  ['input', 'change'].forEach((event) => $('.toolbar').addEventListener(event, render));
  installCustomBuilderButton();
  render();
  loadLawTests();
  checkAdmin().then((result) => {
    isAdminUser = result;
    render();
  });
}

if ($('#leaderboard')) {
  const rows = [
    ['ნინო კაპანაძე', '2 450', 'ექსპერტი'],
    ['გიორგი მაისურაძე', '2 210', 'ექსპერტი'],
    ['ანა ლომიძე', '1 980', 'მცოდნე'],
    ['თქვენ', '860', 'სტუდენტი'],
  ];
  $('#leaderboard').innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r[0]}</td><td>${r[1]}</td><td><span class="badge">${r[2]}</span></td></tr>`).join('');
}

if ($('#progress-card')) {
  session().then(async (activeSession) => {
    if (!activeSession) return;
    try {
      const [usage, stats] = await Promise.all([
        window.App.rpc('check_daily_usage'),
        window.App.rpc('get_user_statistics'),
      ]);
      const used = Number(usage?.used ?? 0);
      const limit = Number(usage?.limit ?? 0);
      const attempts = Number(stats?.attempts ?? 0);
      $('#stat-daily').textContent = `${used} / ${limit}`;
      $('#stat-remaining-label').textContent = 'დარჩენილი დღიური კითხვა';
      $('#stat-remaining').textContent = String(Math.max(0, limit - used));
      $('#stat-completed').textContent = String(attempts);
    } catch (error) {
      console.warn('progress card update failed', error);
    }
  });
}

if ($('#certificate-form')) {
  $('#certificate-form').onsubmit = async (e) => {
    e.preventDefault();
    const code = $('#certificate-code').value.trim();
    const out = $('#certificate-result');
    out.textContent = 'მოწმდება…';
    try {
      const c = await window.App.getClient();
      if (!c) {
        out.textContent = code === 'DEMO-2026-80'
          ? 'ნამდვილი სერტიფიკატი — დემო მომხმარებელი, 85%, 12.07.2026'
          : 'სერტიფიკატი ვერ მოიძებნა.';
        return;
      }
      const { data, error } = await c.rpc('verify_certificate', { p_code: code });
      if (error) throw error;
      out.textContent = data?.length ? `ნამდვილია — ${data[0].full_name}, ${data[0].score_percent}%` : 'სერტიფიკატი ვერ მოიძებნა.';
    } catch (e) {
      out.textContent = window.App.friendlyError(e);
    }
  };
}

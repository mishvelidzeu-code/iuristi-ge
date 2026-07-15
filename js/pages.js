import { categories, laws as fallbackLaws, questions } from './data.js';

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

function lawTestCard(law) {
  const direction = law.direction_slug || law.direction || 'other';
  const count = law.question_count ?? law.count ?? 0;
  const title = law.title || law.short_title || law.short;
  const desc = law.description || law.desc || '';
  return `<article class="card test-card"><div class="eyebrow">${esc(directionNames[direction] || 'სამართლის')} ტესტი</div><h3>${esc(title)}</h3><p class="meta">${esc(desc)}</p><div class="card-footer"><span class="question-total">${count} კითხვა</span><div class="test-actions"><a class="btn" href="quiz.html?law=${encodeURIComponent(law.slug)}&mode=learning">სასწავლო ტესტი</a><a class="btn secondary" href="quiz.html?law=${encodeURIComponent(law.slug)}&mode=exam">საგამოცდო ტესტი</a></div></div></article>`;
}

if ($('#categories')) $('#categories').remove();

if ($('#test-list')) {
  let lawTests = fallbackLaws.filter((law) => (law.count ?? 0) > 0);

  const normalize = (value) => String(value || '').toLowerCase();
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

  ['input', 'change'].forEach((event) => $('.toolbar').addEventListener(event, render));
  render();
  loadLawTests();
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

import { questions } from './data.js';

const $ = (selector) => document.querySelector(selector);
const key = 'iuristi_active_attempt';
const optionLetters = ['A', 'B', 'C', 'D'];
let pool = [];
let state = null;
let timer = null;

function save() {
  localStorage.setItem(key, JSON.stringify(state));
}

function remaining() {
  return Math.max(0, state.duration - Math.floor((Date.now() - state.startedAt) / 1000));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mapRemoteQuestion(row) {
  return {
    id: row.id,
    category: 'constitutional',
    subcategory: row.law_name,
    difficulty: row.difficulty,
    text: row.text,
    options: row.options || [],
    answer: optionLetters.indexOf(row.correct_option),
    explanation: row.explanation,
    law: row.law_name,
    article: row.law_article,
    version: row.law_version_date || '',
  };
}

async function loadRemoteLawQuestions(lawSlug) {
  if (!lawSlug || !window.App?.getClient) return null;
  const client = await window.App.getClient();
  if (!client) return null;
  const { data, error } = await client.rpc('get_public_quiz_questions_by_law', {
    p_law_slug: lawSlug,
    p_count: 200,
  });
  if (error) throw error;
  return (data || []).map(mapRemoteQuestion);
}

async function setup() {
  const params = new URLSearchParams(location.search);
  const cat = params.get('category');
  const law = params.get('law');
  if (cat && !law) {
    location.href = 'tests.html';
    return;
  }
  const names = {
    'constitution-of-georgia': 'საქართველოს კონსტიტუცია',
    'criminal-code': 'საქართველოს სისხლის სამართლის კოდექსი',
    'criminal-procedure-code': 'საქართველოს სისხლის სამართლის საპროცესო კოდექსი',
    'civil-code': 'საქართველოს სამოქალაქო კოდექსი',
    'general-administrative-code': 'საქართველოს ზოგადი ადმინისტრაციული კოდექსი',
  };

  try {
    pool = (await loadRemoteLawQuestions(law)) || [];
  } catch (error) {
    window.App.toast(`Supabase-დან კითხვები ვერ ჩაიტვირთა: ${window.App.friendlyError?.(error) || error.message}`);
    pool = [];
  }

  if (!pool.length) {
    pool = questions.filter((q) => (!cat || q.category === cat) && (!law || names[law] === q.law));
  }

  if (!pool.length) {
    window.App.toast('ამ კანონზე გამოქვეყნებული კითხვები ჯერ არ არის.');
    location.href = 'laws.html';
    return;
  }

  pool = shuffle(pool);
  localStorage.removeItem(key);
  state = {
    id: crypto.randomUUID(),
    attemptId: crypto.randomUUID(),
    questionIds: pool.map((q) => q.id),
    index: 0,
    answers: {},
    startedAt: Date.now(),
    duration: 600,
    mode: params.get('mode') || 'learning',
    lawSlug: law,
    completed: false,
  };
  save();

  pool = state.questionIds.map((id) => pool.find((q) => q.id === id)).filter(Boolean);
  render();
  tick();
  timer = setInterval(tick, 1000);
}

function render() {
  const q = pool[state.index];
  if (!q) return;

  $('#question-count').textContent = `კითხვა ${state.index + 1} / ${pool.length}`;
  $('#progress-bar').style.width = `${((state.index + 1) / pool.length) * 100}%`;
  $('#question-text').textContent = q.text;
  $('#law-ref').textContent = `${q.law} • ${q.article}${q.version ? ` • რედაქცია: ${q.version}` : ''}`;

  const box = $('#options');
  box.replaceChildren();
  q.options.forEach((text, i) => {
    const b = document.createElement('button');
    const selected = state.answers[q.id];
    b.className = 'option';
    if (selected !== undefined && i === q.answer) b.classList.add('correct');
    if (selected === i && selected !== q.answer) b.classList.add('incorrect');
    if (selected === i) b.classList.add('selected');
    b.type = 'button';
    b.textContent = `${String.fromCharCode(65 + i)}. ${text}`;
    b.onclick = () => {
      if (state.answers[q.id] !== undefined) return;
      state.answers[q.id] = i;
      save();
      render();
    };
    box.append(b);
  });

  const selected = state.answers[q.id];
  const feedback = $('#feedback');
  if (selected === undefined) {
    feedback.hidden = true;
    feedback.className = 'notice';
    feedback.textContent = '';
  } else {
    feedback.hidden = false;
    feedback.className = selected === q.answer ? 'notice correct-feedback' : 'notice';
    feedback.textContent = q.explanation;
  }

  $('#prev').disabled = state.index === 0;
  $('#next').textContent = state.index === pool.length - 1 ? 'ტესტის დასრულება' : 'შემდეგი კითხვა';
  $('#question-nav').replaceChildren(...pool.map((x, i) => {
    const b = document.createElement('button');
    b.textContent = i + 1;
    b.className = i === state.index ? 'active' : '';
    b.onclick = () => {
      state.index = i;
      save();
      render();
    };
    return b;
  }));
}

function tick() {
  const r = remaining();
  const m = Math.floor(r / 60);
  const s = r % 60;
  $('#timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
  state.remaining = r;
  save();
  if (!r) complete();
}

function complete() {
  if (state.completed) return;
  state.completed = true;
  clearInterval(timer);
  const correct = pool.filter((q) => state.answers[q.id] === q.answer).length;
  const pct = Math.round((correct / pool.length) * 100);
  state.result = { correct, total: pool.length, pct, elapsed: state.duration - remaining() };
  save();
  localStorage.setItem('iuristi_last_result', JSON.stringify(state));
  location.href = 'result.html';
}

$('#prev').onclick = () => {
  state.index -= 1;
  save();
  render();
};
$('#next').onclick = () => (state.index === pool.length - 1 ? complete() : (state.index += 1, save(), render()));
$('#finish').onclick = () => confirm('ნამდვილად გსურთ ტესტის დასრულება?') && complete();
$('#report').onclick = () => window.App.toast('შეტყობინება მიღებულია. ავტორიზებულ რეჟიმში ის ადმინისტრატორს გადაეგზავნება.');
setup();

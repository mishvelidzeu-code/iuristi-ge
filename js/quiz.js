import { questions } from './data.js';

const $ = (selector) => document.querySelector(selector);
const key = 'iuristi_active_attempt';
const optionLetters = ['A', 'B', 'C', 'D'];
const questionLimit = 30;
const customExamQuestionLimit = 100;
const testDurationSeconds = 30 * 60;
const remotePoolLimit = 1000;
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

function isExamMode() {
  return state?.mode === 'exam';
}

function ensureExamControls() {
  let controls = $('#question-status-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.id = 'question-status-controls';
    controls.className = 'exam-tools';
    controls.innerHTML = `
      <button class="btn secondary" type="button" data-mark="yellow">ყვითლად მონიშვნა</button>
      <button class="btn secondary" type="button" data-mark="green">მწვანედ მონიშვნა</button>
      <button class="btn secondary" type="button" data-mark="">მონიშვნის მოხსნა</button>
    `;
    $('#feedback').after(controls);
    controls.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-mark]');
      if (!button) return;
      const q = pool[state.index];
      const mark = button.dataset.mark;
      state.marks = state.marks || {};
      if (mark) {
        state.marks[q.id] = mark;
      } else {
        delete state.marks[q.id];
      }
      save();
      render();
    });
  }
  controls.hidden = !isExamMode();
  return controls;
}

function ensureQuestionSummary() {
  let summary = $('#question-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'question-summary';
    summary.className = 'question-summary';
    $('#question-nav').before(summary);
  }
  summary.hidden = !isExamMode();
  return summary;
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
    p_count: remotePoolLimit,
  });
  if (error) throw error;
  return (data || []).map(mapRemoteQuestion);
}

async function loadLawCatalog() {
  if (!window.App?.getClient) return [];
  const client = await window.App.getClient();
  if (!client) return [];
  const { data, error } = await client.rpc('get_law_catalog', { p_direction: null });
  if (error) throw error;
  return data || [];
}

async function loadCustomExamQuestions() {
  const raw = localStorage.getItem('iuristi_custom_exam');
  if (!raw) return [];
  const config = JSON.parse(raw);
  const target = Number(config.total || customExamQuestionLimit);
  const chosen = [];
  const usedIds = new Set();
  const selections = Array.isArray(config.selections) ? config.selections : [];

  for (const selection of selections) {
    const lawQuestions = shuffle(await loadRemoteLawQuestions(selection.slug) || []);
    const wanted = Math.max(0, Number(selection.count || 0));
    const picked = lawQuestions.filter((question) => !usedIds.has(question.id)).slice(0, wanted);
    picked.forEach((question) => usedIds.add(question.id));
    chosen.push(...picked);
  }

  if (chosen.length < target) {
    const catalog = await loadLawCatalog();
    const selectedSlugs = new Set(selections.map((selection) => selection.slug));
    const fillLaws = shuffle(catalog.filter((law) => (law.question_count ?? law.count ?? 0) > 0));
    for (const law of fillLaws) {
      if (chosen.length >= target) break;
      const lawQuestions = shuffle(await loadRemoteLawQuestions(law.slug) || []);
      for (const question of lawQuestions) {
        if (chosen.length >= target) break;
        if (usedIds.has(question.id)) continue;
        if (selectedSlugs.has(law.slug) && selections.some((selection) => selection.slug === law.slug && Number(selection.count || 0) <= 0)) continue;
        usedIds.add(question.id);
        chosen.push(question);
      }
    }
  }

  return shuffle(chosen).slice(0, target);
}

async function setup() {
  const params = new URLSearchParams(location.search);
  const cat = params.get('category');
  const law = params.get('law');
  const isCustomExam = params.get('custom') === '1';
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
    pool = isCustomExam ? await loadCustomExamQuestions() : ((await loadRemoteLawQuestions(law)) || []);
  } catch (error) {
    window.App.toast(`Supabase-დან კითხვები ვერ ჩაიტვირთა: ${window.App.friendlyError?.(error) || error.message}`);
    pool = [];
  }

  if (!pool.length && !isCustomExam) {
    pool = questions.filter((q) => (!cat || q.category === cat) && (!law || names[law] === q.law));
  }

  if (!pool.length) {
    window.App.toast('ამ კანონზე გამოქვეყნებული კითხვები ჯერ არ არის.');
    location.href = 'laws.html';
    return;
  }

  pool = isCustomExam ? shuffle(pool).slice(0, customExamQuestionLimit) : shuffle(pool).slice(0, questionLimit);
  localStorage.removeItem(key);
  state = {
    id: crypto.randomUUID(),
    attemptId: crypto.randomUUID(),
    questionIds: pool.map((q) => q.id),
    index: 0,
    answers: {},
    marks: {},
    startedAt: Date.now(),
    duration: testDurationSeconds,
    mode: isCustomExam ? 'exam' : (params.get('mode') || 'learning'),
    lawSlug: law,
    customExam: isCustomExam,
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
  const exam = isExamMode();
  document.body.classList.toggle('exam-mode', exam);

  $('#question-count').textContent = `${exam ? 'საგამოცდო ტესტი' : 'სასწავლო ტესტი'} • კითხვა ${state.index + 1} / ${pool.length}`;
  $('#progress-bar').style.width = `${((state.index + 1) / pool.length) * 100}%`;
  $('#question-text').textContent = q.text;
  $('#law-ref').textContent = `${q.law} • ${q.article}${q.version ? ` • რედაქცია: ${q.version}` : ''}`;

  const box = $('#options');
  box.replaceChildren();
  q.options.forEach((text, i) => {
    const b = document.createElement('button');
    const selected = state.answers[q.id];
    b.className = 'option';
    if (!exam && selected !== undefined && i === q.answer) b.classList.add('correct');
    if (!exam && selected === i && selected !== q.answer) b.classList.add('incorrect');
    if (selected === i) b.classList.add('selected');
    b.type = 'button';
    b.textContent = `${String.fromCharCode(65 + i)}. ${text}`;
    b.onclick = () => {
      if (!exam && state.answers[q.id] !== undefined) return;
      state.answers[q.id] = i;
      if (exam && state.marks?.[q.id] === 'skipped') delete state.marks[q.id];
      save();
      render();
    };
    box.append(b);
  });

  const selected = state.answers[q.id];
  const feedback = $('#feedback');
  if (exam || selected === undefined) {
    feedback.hidden = true;
    feedback.className = 'notice';
    feedback.textContent = '';
  } else {
    feedback.hidden = false;
    feedback.className = selected === q.answer ? 'notice correct-feedback' : 'notice';
    feedback.textContent = q.explanation;
  }
  const controls = ensureExamControls();
  if (exam) {
    const mark = state.marks?.[q.id] || '';
    controls.querySelectorAll('button[data-mark]').forEach((button) => {
      button.classList.toggle('active-mark', button.dataset.mark === mark);
    });
  }

  $('#prev').disabled = state.index === 0;
  $('#next').textContent = state.index === pool.length - 1 ? 'ტესტის დასრულება' : 'შემდეგი კითხვა';
  const summary = ensureQuestionSummary();
  if (exam) {
    const answers = state.answers || {};
    const marks = state.marks || {};
    const yellow = pool.filter((item) => marks[item.id] === 'yellow').length;
    const green = pool.filter((item) => marks[item.id] === 'green').length;
    const skipped = pool.filter((item) => marks[item.id] === 'skipped' && answers[item.id] === undefined).length;
    const answered = pool.filter((item) => answers[item.id] !== undefined).length;
    summary.innerHTML = `<span class="dot answered"></span>${answered} პასუხი <span class="dot yellow"></span>${yellow} ყვითელი <span class="dot green"></span>${green} მწვანე <span class="dot skipped"></span>${skipped} გამოტოვებული`;
  }
  $('#question-nav').replaceChildren(...pool.map((x, i) => {
    const b = document.createElement('button');
    const mark = state.marks?.[x.id];
    const answered = state.answers?.[x.id] !== undefined;
    b.textContent = i + 1;
    b.className = [
      i === state.index ? 'active' : '',
      answered ? 'answered' : '',
      mark ? `marked-${mark}` : '',
    ].filter(Boolean).join(' ');
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
$('#next').onclick = () => {
  const q = pool[state.index];
  if (isExamMode() && state.answers[q.id] === undefined && !state.marks?.[q.id]) {
    state.marks = state.marks || {};
    state.marks[q.id] = 'skipped';
  }
  if (state.index === pool.length - 1) {
    complete();
    return;
  }
  state.index += 1;
  save();
  render();
};
$('#finish').onclick = () => confirm('ნამდვილად გსურთ ტესტის დასრულება?') && complete();
$('#report').onclick = () => window.App.toast('შეტყობინება მიღებულია. ავტორიზებულ რეჟიმში ის ადმინისტრატორს გადაეგზავნება.');
setup();

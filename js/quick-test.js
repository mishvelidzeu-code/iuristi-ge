const $ = (selector, root = document) => root.querySelector(selector);

const storageKey = 'iuristi_quick_test_state';
const optionLetters = ['A', 'B', 'C', 'D'];
const modes = {
  five: { title: '5 კითხვა', count: 5, timed: false },
  ten: { title: '10 კითხვა', count: 10, timed: false },
  daily: { title: 'დღის ტესტი', count: 10, timed: false, daily: true },
  challenge: { title: '60-წამიანი გამოწვევა', count: 100, timed: true, duration: 60 },
};

let state = null;
let timer = null;

function show(view) {
  ['#quick-home', '#quick-loading', '#quick-error', '#quick-runner', '#quick-result'].forEach((selector) => {
    $(selector).hidden = selector !== view;
  });
}

function save() {
  if (state) localStorage.setItem(storageKey, JSON.stringify(state));
}

function clearSaved() {
  localStorage.removeItem(storageKey);
}

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function seededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tbilisiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    key: `${parts.year}-${parts.month}-${parts.day}`,
    label: `${parts.day}.${parts.month}.${parts.year}`,
  };
}

function mapRemoteQuestion(row) {
  return {
    id: row.id,
    text: row.text,
    options: Array.isArray(row.options) ? row.options : [],
    answer: optionLetters.indexOf(row.correct_option),
    explanation: row.explanation || '',
    law: row.law_name || '',
    article: row.law_article || '',
    sourceUrl: row.source_url || '',
  };
}

function validQuestion(question) {
  return question
    && question.text
    && Array.isArray(question.options)
    && question.options.length === 4
    && question.options.every(Boolean)
    && Number.isInteger(question.answer)
    && question.answer >= 0
    && question.answer < 4;
}

async function loadSourceUrls(client, questions) {
  const ids = questions.map((question) => question.id).filter(Boolean);
  if (!ids.length) return questions;
  try {
    const { data, error } = await client
      .from('questions')
      .select('id,source_url')
      .in('id', ids);
    if (error) throw error;
    const urls = new Map((data || []).map((row) => [row.id, row.source_url || '']));
    return questions.map((question) => ({ ...question, sourceUrl: question.sourceUrl || urls.get(question.id) || '' }));
  } catch {
    return questions;
  }
}

async function loadQuestionsFromQuickRpc(client) {
  const { data, error } = await client.rpc('get_public_quick_test_questions', { p_count: 1000 });
  if (error) throw error;
  return (data || []).map(mapRemoteQuestion);
}

async function loadQuestionsFromLawRpc(client) {
  const { data: laws, error } = await client.rpc('get_law_catalog', { p_direction: null });
  if (error) throw error;
  const activeLaws = (laws || []).filter((law) => Number(law.question_count || 0) > 0);
  const chunks = await Promise.all(activeLaws.map(async (law) => {
    const { data, error: questionError } = await client.rpc('get_public_quiz_questions_by_law', {
      p_law_slug: law.slug,
      p_count: 200,
    });
    if (questionError) throw questionError;
    return data || [];
  }));
  return chunks.flat().map(mapRemoteQuestion);
}

async function loadQuestionPool() {
  const client = await window.App.getClient();
  if (!client) throw new Error('Supabase config is missing');
  let questions;
  try {
    questions = await loadQuestionsFromQuickRpc(client);
  } catch {
    questions = await loadQuestionsFromLawRpc(client);
    questions = await loadSourceUrls(client, questions);
  }
  const unique = new Map();
  questions.filter(validQuestion).forEach((question) => unique.set(question.id, question));
  return [...unique.values()];
}

function buildQuestionSet(pool, modeKey) {
  const mode = modes[modeKey];
  if (mode.daily) {
    const today = tbilisiDateParts();
    return {
      questions: shuffle([...pool].sort((a, b) => String(a.id).localeCompare(String(b.id))), seededRandom(today.key)).slice(0, mode.count),
      dateKey: today.key,
      dateLabel: today.label,
    };
  }
  return {
    questions: shuffle(pool).slice(0, mode.count),
    dateKey: null,
    dateLabel: '',
  };
}

function ensureEnough(questions, modeKey) {
  const required = modes[modeKey].timed ? 1 : modes[modeKey].count;
  return questions.length >= required;
}

async function start(modeKey, forceNew = true) {
  const mode = modes[modeKey];
  if (!mode) return;
  if (forceNew) clearSaved();
  show('#quick-loading');
  try {
    const pool = await loadQuestionPool();
    if (!ensureEnough(pool, modeKey)) {
      showError('ტესტისთვის საკმარისი კითხვები ვერ მოიძებნა.');
      return;
    }
    const picked = buildQuestionSet(pool, modeKey);
    if (!picked.questions.length || (!mode.timed && picked.questions.length < mode.count)) {
      showError('ტესტისთვის საკმარისი კითხვები ვერ მოიძებნა.');
      return;
    }
    state = {
      id: crypto.randomUUID(),
      mode: modeKey,
      questions: picked.questions,
      index: 0,
      answers: [],
      startedAt: Date.now(),
      endsAt: mode.timed ? Date.now() + mode.duration * 1000 : null,
      dateKey: picked.dateKey,
      dateLabel: picked.dateLabel,
      completed: false,
    };
    save();
    render();
  } catch (error) {
    console.warn(error);
    showError('ტესტის ჩატვირთვა ვერ მოხერხდა. სცადეთ ხელახლა.');
  }
}

function showError(message) {
  $('#quick-error-text').textContent = message;
  show('#quick-error');
}

function answerCurrent(index) {
  if (!state || state.completed) return;
  if (modes[state.mode].timed && remainingSeconds() <= 0) return;
  const question = state.questions[state.index];
  if (!question) return;
  state.answers[state.index] = {
    questionId: question.id,
    selected: index,
    correct: index === question.answer,
  };
  if (state.index >= state.questions.length - 1 || (!modes[state.mode].timed && state.answers.length >= state.questions.length)) {
    complete();
    return;
  }
  state.index += 1;
  save();
  render();
}

function remainingSeconds() {
  if (!state?.endsAt) return 0;
  return Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
}

function renderTimer() {
  const left = remainingSeconds();
  $('#quick-timer').textContent = `0:${String(left).padStart(2, '0')}`;
  if (left <= 0) complete();
}

function render() {
  if (!state || state.completed) return;
  const mode = modes[state.mode];
  const question = state.questions[state.index];
  if (!question) {
    complete();
    return;
  }
  show('#quick-runner');
  clearInterval(timer);
  $('#quick-mode-title').textContent = mode.title;
  $('#quick-date').hidden = !mode.daily;
  $('#quick-date').textContent = mode.daily ? `დღევანდელი თარიღი: ${state.dateLabel}` : '';
  $('#quick-timer').hidden = !mode.timed;
  $('#quick-count').textContent = mode.timed
    ? `კითხვა ${state.index + 1} / ${state.questions.length} • პასუხი: ${state.answers.length}`
    : `კითხვა ${state.index + 1} / ${state.questions.length}`;
  $('#quick-progress').style.width = `${Math.max(4, ((state.index + 1) / state.questions.length) * 100)}%`;
  $('#quick-question').textContent = question.text;
  $('#quick-law-ref').textContent = [question.law, question.article].filter(Boolean).join(' • ');
  const options = $('#quick-options');
  options.replaceChildren();
  const locked = mode.timed && remainingSeconds() <= 0;
  question.options.forEach((text, index) => {
    const button = document.createElement('button');
    button.className = 'option';
    button.type = 'button';
    button.disabled = locked;
    button.textContent = `${optionLetters[index]}. ${text}`;
    button.addEventListener('click', () => answerCurrent(index));
    options.append(button);
  });
  $('#quick-nav').replaceChildren(...state.questions.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = index + 1;
    button.disabled = mode.timed;
    button.className = [
      index === state.index ? 'active' : '',
      state.answers[index] ? 'answered' : '',
    ].filter(Boolean).join(' ');
    button.addEventListener('click', () => {
      state.index = index;
      save();
      render();
    });
    return button;
  }));
  if (mode.timed) {
    renderTimer();
    timer = setInterval(renderTimer, 1000);
  }
}

function complete() {
  if (!state || state.completed) return;
  state.completed = true;
  clearInterval(timer);
  save();
  renderResult();
  clearSaved();
}

function renderResult() {
  const answered = state.answers.filter(Boolean);
  const correct = answered.filter((answer) => answer.correct).length;
  const timed = modes[state.mode].timed;
  const wrong = timed ? answered.length - correct : state.questions.length - correct;
  const totalForPercent = timed ? Math.max(answered.length, 1) : state.questions.length;
  const percent = Math.round((correct / totalForPercent) * 100);
  $('#quick-score').textContent = `${percent}%`;
  $('#quick-result-title').textContent = timed
    ? `უპასუხე ${answered.length} კითხვას`
    : `${correct} / ${state.questions.length}`;
  $('#quick-correct').textContent = correct;
  $('#quick-wrong').textContent = wrong;
  $('#quick-total').textContent = timed ? answered.length : state.questions.length;
  const detailQuestions = timed
    ? state.questions.slice(0, state.answers.length)
    : state.questions;
  $('#quick-details').replaceChildren(...detailQuestions.map((question, index) => detailCard(question, index)));
  show('#quick-result');
}

function detailCard(question, index) {
  const answer = state.answers[index];
  const selectedText = answer ? question.options[answer.selected] : 'პასუხი არ არის არჩეული';
  const article = document.createElement('article');
  article.className = 'card quick-detail-card';
  article.innerHTML = `
    <div class="section-head">
      <div>
        <div class="eyebrow">კითხვა ${index + 1}</div>
        <h2></h2>
      </div>
      <span class="badge ${answer?.correct ? 'quick-ok' : 'quick-bad'}">${answer?.correct ? 'სწორია' : 'არასწორია'}</span>
    </div>
    <dl class="quick-answer-list">
      <div><dt>თქვენი პასუხი</dt><dd></dd></div>
      <div><dt>სწორი პასუხი</dt><dd></dd></div>
      <div><dt>განმარტება</dt><dd></dd></div>
      <div><dt>კანონი</dt><dd></dd></div>
      <div><dt>მუხლი</dt><dd></dd></div>
    </dl>
  `;
  $('h2', article).textContent = question.text;
  const values = [...article.querySelectorAll('dd')];
  values[0].textContent = selectedText;
  values[1].textContent = question.options[question.answer];
  values[2].textContent = question.explanation || 'განმარტება არ არის მითითებული.';
  values[3].textContent = question.law || 'კანონი არ არის მითითებული.';
  values[4].textContent = question.article || 'მუხლი არ არის მითითებული.';
  if (question.sourceUrl) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const desc = document.createElement('dd');
    const link = document.createElement('a');
    term.textContent = 'წყარო';
    link.href = question.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'წყაროს ბმული';
    desc.append(link);
    row.append(term, desc);
    $('.quick-answer-list', article).append(row);
  }
  return article;
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || saved.completed || !modes[saved.mode]) return false;
    if (modes[saved.mode].daily && saved.dateKey !== tbilisiDateParts().key) {
      clearSaved();
      return false;
    }
    state = saved;
    if (modes[state.mode].timed && remainingSeconds() <= 0) {
      complete();
    } else {
      render();
    }
    return true;
  } catch {
    clearSaved();
    return false;
  }
}

document.querySelectorAll('[data-start-mode]').forEach((button) => {
  button.addEventListener('click', () => start(button.dataset.startMode));
});

$('#quick-error-back').addEventListener('click', () => {
  clearSaved();
  state = null;
  show('#quick-home');
});
$('#quick-back-home').addEventListener('click', () => {
  if (confirm('მიმდინარე ტესტი შეწყდეს?')) {
    clearSaved();
    state = null;
    show('#quick-home');
  }
});
$('#quick-finish').addEventListener('click', () => {
  if (confirm('ნამდვილად გსურთ ტესტის დასრულება?')) complete();
});
$('#quick-retry').addEventListener('click', () => {
  const mode = modes[state.mode];
  state = {
    ...state,
    index: 0,
    answers: [],
    startedAt: Date.now(),
    endsAt: mode.timed ? Date.now() + mode.duration * 1000 : null,
    completed: false,
  };
  save();
  render();
});
$('#quick-new').addEventListener('click', () => start(state.mode));
$('#quick-home-button').addEventListener('click', () => {
  state = null;
  clearSaved();
  show('#quick-home');
});

if (!restore()) show('#quick-home');

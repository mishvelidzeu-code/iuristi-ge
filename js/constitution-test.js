const csvPath = 'data/constitution_questions.csv';
const optionLetters = ['A', 'B', 'C', 'D'];
const $ = (selector) => document.querySelector(selector);

let questions = [];
let index = 0;
let answers = [];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...data] = rows;
  return data.map((values) =>
    Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])),
  );
}

function toQuestion(row, number) {
  return {
    id: `constitution-${number + 1}`,
    text: row.text,
    difficulty: row.difficulty,
    explanation: row.explanation,
    law: row.law_name,
    article: row.law_article,
    version: row.law_version_date,
    options: [row.option_a, row.option_b, row.option_c, row.option_d],
    answer: optionLetters.indexOf(row.correct_option),
  };
}

function render() {
  const question = questions[index];
  const selected = answers[index];
  const correctCount = answers.filter((answer, i) => answer === questions[i].answer).length;

  $('#question-count').textContent = `კითხვა ${index + 1} / ${questions.length}`;
  $('#score').textContent = `${correctCount} სწორი`;
  $('#progress-bar').style.width = `${((index + 1) / questions.length) * 100}%`;
  $('#law-ref').textContent = `${question.law} • ${question.article} • რედაქცია: ${question.version}`;
  $('#question-text').textContent = question.text;
  $('#result-text').textContent = `პასუხები გაცემულია: ${answers.filter((answer) => answer !== undefined).length} / ${questions.length}`;
  $('#next').textContent = index === questions.length - 1 ? 'დასრულება' : 'შემდეგი კითხვა →';

  const options = $('#options');
  options.replaceChildren();
  question.options.forEach((text, optionIndex) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option';
    if (selected === optionIndex) button.classList.add('selected');
    button.textContent = `${optionLetters[optionIndex]}. ${text}`;
    button.disabled = selected !== undefined;
    button.addEventListener('click', () => {
      answers[index] = optionIndex;
      render();
    });
    options.append(button);
  });

  const feedback = $('#feedback');
  if (selected === undefined) {
    feedback.hidden = true;
    feedback.textContent = '';
  } else {
    feedback.hidden = false;
    feedback.textContent = question.explanation;
  }

  $('#question-nav').replaceChildren(...questions.map((_, navIndex) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = navIndex + 1;
    if (navIndex === index) button.className = 'active';
    button.addEventListener('click', () => {
      index = navIndex;
      render();
    });
    return button;
  }));
}

function finish() {
  const correctCount = answers.filter((answer, i) => answer === questions[i].answer).length;
  const percent = Math.round((correctCount / questions.length) * 100);
  $('#question-text').textContent = `შედეგი: ${correctCount} / ${questions.length} (${percent}%)`;
  $('#law-ref').textContent = 'საქართველოს კონსტიტუციის CSV ტესტი დასრულებულია.';
  $('#options').replaceChildren();
  $('#feedback').hidden = true;
  $('#next').disabled = true;
  $('#result-text').textContent = `სწორი პასუხები: ${correctCount}; არასწორი ან გამოტოვებული: ${questions.length - correctCount}.`;
}

async function setup() {
  const response = await fetch(csvPath);
  if (!response.ok) throw new Error(`CSV ვერ ჩაიტვირთა: ${response.status}`);
  const rows = parseCsv(await response.text());
  questions = rows.map(toQuestion);
  answers = Array(questions.length);
  render();
}

$('#next').addEventListener('click', () => {
  if (index === questions.length - 1) finish();
  else {
    index += 1;
    render();
  }
});

$('#restart').addEventListener('click', () => {
  index = 0;
  answers = Array(questions.length);
  $('#next').disabled = false;
  render();
});

setup().catch((error) => {
  $('#question-count').textContent = 'შეცდომა';
  $('#question-text').textContent = error.message;
});

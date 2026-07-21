import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/build-juvenile-justice-import.mjs <input.json> <output.sql>');
}

const payload = JSON.parse((await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, ''));
const { questions } = payload;

if (!Array.isArray(questions) || questions.length !== 110) {
  throw new Error('Expected exactly 110 questions from the source document.');
}

for (const [index, question] of questions.entries()) {
  if (
    !question.text?.trim()
    || !question.law_article?.trim()
    || !question.explanation?.trim()
    || !Array.isArray(question.options)
    || question.options.length !== 4
    || !question.options.every((option) => option?.trim())
    || !['A', 'B', 'C', 'D'].includes(question.correct_option)
  ) {
    throw new Error(`Question ${index + 1} is incomplete.`);
  }
}

const questionJson = JSON.stringify(questions).replaceAll('$questions$', '$question_payload$');
const sql = `-- Generated from ${inputPath.replaceAll('\\', '/')}.
-- The source document contains the question text, four answers, and an answer key.
do $$
declare
  v_category_id uuid;
  v_subcategory_id uuid;
  v_law_id uuid;
  v_question_id uuid;
  r record;
begin
  select id into v_category_id
  from public.categories
  where slug = 'criminal';

  if v_category_id is null then
    raise exception 'Criminal category is missing';
  end if;

  insert into public.subcategories (category_id, slug, title)
  values (v_category_id, 'juvenile-justice-code', 'არასრულწლოვანთა მართლმსაჯულება')
  on conflict (category_id, slug) do update set title = excluded.title
  returning id into v_subcategory_id;

  insert into public.laws (
    slug, title, short_title, direction_slug, description, official_url,
    current_version_date, is_active, needs_review, sort_order, updated_at
  )
  values (
    'juvenile-justice-code', 'არასრულწლოვანთა მართლმსაჯულების კოდექსი',
    'არასრულწლოვანთა მართლმსაჯულება', 'criminal',
    'არასრულწლოვანთა მართლმსაჯულების პროცესის წესები და არასრულწლოვნის უფლებების დაცვა.',
    'https://matsne.gov.ge/ka/document/view/2877281', current_date, true, false, 55, now()
  )
  on conflict (slug) do update set
    title = excluded.title,
    short_title = excluded.short_title,
    direction_slug = excluded.direction_slug,
    description = excluded.description,
    official_url = excluded.official_url,
    current_version_date = excluded.current_version_date,
    is_active = true,
    needs_review = false,
    sort_order = excluded.sort_order,
    updated_at = now()
  returning id into v_law_id;

  for r in
    select value as question
    from jsonb_array_elements($questions$${questionJson}$questions$::jsonb)
  loop
    select id into v_question_id
    from public.questions
    where law_id = v_law_id
      and text = r.question->>'text';

    if v_question_id is null then
      insert into public.questions (
        category_id, subcategory_id, law_id, text, difficulty, explanation,
        law_name, law_article, source_url, law_version_date,
        needs_review, is_prime, is_published, verified_at
      )
      values (
        v_category_id, v_subcategory_id, v_law_id,
        r.question->>'text', 'medium', r.question->>'explanation',
        'არასრულწლოვანთა მართლმსაჯულების კოდექსი', r.question->>'law_article',
        'https://matsne.gov.ge/ka/document/view/2877281', current_date,
        false, false, true, now()
      )
      returning id into v_question_id;

      insert into public.question_options (question_id, option_text, is_correct, sort_order)
      select
        v_question_id,
        option.value,
        case option.ordinality
          when 1 then r.question->>'correct_option' = 'A'
          when 2 then r.question->>'correct_option' = 'B'
          when 3 then r.question->>'correct_option' = 'C'
          when 4 then r.question->>'correct_option' = 'D'
        end,
        option.ordinality
      from jsonb_array_elements_text(r.question->'options') with ordinality as option(value, ordinality);
    end if;
  end loop;
end $$;
`;

await writeFile(outputPath, sql, 'utf8');

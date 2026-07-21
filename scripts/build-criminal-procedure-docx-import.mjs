import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/build-criminal-procedure-docx-import.mjs <input.json> <output.sql>');
}

const payload = JSON.parse((await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, ''));
const { questions } = payload;

if (!Array.isArray(questions) || questions.length !== 190) {
  throw new Error('Expected exactly 190 questions from the source document.');
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
-- Adds exact document questions to the existing criminal procedure law without duplicates.
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

  select id into v_subcategory_id
  from public.subcategories
  where category_id = v_category_id and slug = 'criminal-procedure-code';

  select id into v_law_id
  from public.laws
  where slug = 'criminal-procedure-code';

  if v_category_id is null or v_subcategory_id is null or v_law_id is null then
    raise exception 'Criminal procedure law is missing';
  end if;

  for r in
    select value as question
    from jsonb_array_elements($questions$${questionJson}$questions$::jsonb)
  loop
    select id into v_question_id
    from public.questions
    where law_id = v_law_id and text = r.question->>'text';

    if v_question_id is null then
      insert into public.questions (
        category_id, subcategory_id, law_id, text, difficulty, explanation,
        law_name, law_article, source_url, law_version_date,
        needs_review, is_prime, is_published, verified_at
      ) values (
        v_category_id, v_subcategory_id, v_law_id,
        r.question->>'text', 'medium', r.question->>'explanation',
        'საქართველოს სისხლის სამართლის საპროცესო კოდექსი', r.question->>'law_article',
        'https://matsne.gov.ge/ka/document/view/90034', current_date,
        false, false, true, now()
      ) returning id into v_question_id;

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

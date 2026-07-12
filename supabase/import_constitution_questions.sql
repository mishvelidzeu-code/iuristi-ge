-- 1) Create this staging table in Supabase.
-- 2) Upload data/constitution_questions.csv into public.question_import_staging.
-- 3) Run the import block below.

create table if not exists public.question_import_staging (
  category_slug text,
  subcategory_slug text,
  text text,
  difficulty text,
  explanation text,
  law_name text,
  law_article text,
  source_url text,
  law_version_date date,
  is_prime boolean,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text
);

do $$
declare
  v_category_id uuid;
  v_subcategory_id uuid;
  v_law_id uuid;
  r record;
  v_question_id uuid;
  v_article_id uuid;
begin
  insert into public.categories(slug, title, description, sort_order, is_active)
  values ('constitutional', 'კონსტიტუციური სამართალი', 'საქართველოს კონსტიტუციასა და კონსტიტუციურ წესრიგზე დაფუძნებული ტესტები.', 5, true)
  on conflict (slug) do update
  set title = excluded.title,
      description = excluded.description,
      is_active = true
  returning id into v_category_id;

  select id into v_category_id
  from public.categories
  where slug = 'constitutional';

  insert into public.subcategories(category_id, title, slug)
  values (v_category_id, 'საქართველოს კონსტიტუცია', 'constitution')
  on conflict (category_id, slug) do update
  set title = excluded.title
  returning id into v_subcategory_id;

  select id into v_subcategory_id
  from public.subcategories
  where category_id = v_category_id and slug = 'constitution';

  insert into public.laws(slug, title, short_title, direction_slug, description, current_version_date, is_active, needs_review, sort_order)
  values ('constitution-of-georgia', 'საქართველოს კონსტიტუცია', 'კონსტიტუცია', 'constitutional', 'სახელმწიფოს ძირითადი კანონი და ადამიანის ძირითადი უფლებები.', '2018-03-23', true, false, 10)
  on conflict (slug) do update
  set title = excluded.title,
      short_title = excluded.short_title,
      direction_slug = excluded.direction_slug,
      description = excluded.description,
      current_version_date = excluded.current_version_date,
      is_active = true,
      needs_review = false
  returning id into v_law_id;

  select id into v_law_id
  from public.laws
  where slug = 'constitution-of-georgia';

  for r in
    select *
    from public.question_import_staging
    where category_slug = 'constitutional'
      and subcategory_slug = 'constitution'
      and law_name = 'საქართველოს კონსტიტუცია'
  loop
    insert into public.law_articles(law_id, article_number, version_date, is_active)
    values (v_law_id, r.law_article, r.law_version_date, true)
    on conflict (law_id, article_number) do update
    set version_date = excluded.version_date,
        is_active = true
    returning id into v_article_id;

    select id into v_article_id
    from public.law_articles
    where law_id = v_law_id and article_number = r.law_article;

    insert into public.questions(
      category_id,
      subcategory_id,
      text,
      difficulty,
      explanation,
      law_name,
      law_article,
      source_url,
      law_version_date,
      is_prime,
      law_id,
      primary_law_article_id,
      verified_at,
      needs_review,
      is_published
    )
    values (
      v_category_id,
      v_subcategory_id,
      r.text,
      r.difficulty::public.difficulty,
      r.explanation,
      r.law_name,
      r.law_article,
      nullif(r.source_url, ''),
      r.law_version_date,
      coalesce(r.is_prime, false),
      v_law_id,
      v_article_id,
      now(),
      false,
      true
    )
    returning id into v_question_id;

    insert into public.question_options(question_id, option_text, is_correct, sort_order)
    values
      (v_question_id, r.option_a, r.correct_option = 'A', 1),
      (v_question_id, r.option_b, r.correct_option = 'B', 2),
      (v_question_id, r.option_c, r.correct_option = 'C', 3),
      (v_question_id, r.option_d, r.correct_option = 'D', 4);

    insert into public.question_law_articles(question_id, law_article_id, is_primary)
    values (v_question_id, v_article_id, true)
    on conflict (question_id, law_article_id) do update
    set is_primary = true;
  end loop;
end $$;

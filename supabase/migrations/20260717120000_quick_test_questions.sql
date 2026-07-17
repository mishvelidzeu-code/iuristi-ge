create or replace function public.get_public_quick_test_questions(
  p_count int default 1000
)
returns table(
  id uuid,
  text text,
  difficulty public.difficulty,
  explanation text,
  law_name text,
  law_article text,
  law_version_date date,
  source_url text,
  options jsonb,
  correct_option text
)
language sql
security definer
set search_path=''
as $$
  select
    q.id,
    q.text,
    q.difficulty,
    q.explanation,
    coalesce(l.title, q.law_name) as law_name,
    coalesce(a.article_number, q.law_article) as law_article,
    coalesce(a.version_date, q.law_version_date) as law_version_date,
    q.source_url,
    jsonb_agg(o.option_text order by o.sort_order) as options,
    max(case when o.is_correct then chr(64 + o.sort_order) end) as correct_option
  from public.questions q
  left join public.laws l on l.id = q.law_id
  left join public.law_articles a on a.id = q.primary_law_article_id
  join public.question_options o on o.question_id = q.id
  where q.is_published
    and q.verified_at is not null
    and not q.needs_review
    and not q.is_prime
    and q.text is not null
    and btrim(q.text) <> ''
  group by q.id, q.text, q.difficulty, q.explanation, l.title, q.law_name, a.article_number, q.law_article, a.version_date, q.law_version_date, q.source_url
  having count(o.id) = 4
    and count(*) filter (where o.is_correct) = 1
    and count(*) filter (where btrim(o.option_text) <> '') = 4
  order by q.id
  limit least(greatest(p_count, 1), 5000)
$$;

grant execute on function public.get_public_quick_test_questions(int) to anon, authenticated;

-- Keep a database-side recovery copy before removing pre-2026-07-20 Criminal Code questions.
do $$
declare
  v_law_id uuid;
  v_cutoff timestamptz := timestamptz '2026-07-20 00:00:00+04';
begin
  select id into v_law_id
  from public.laws
  where slug = 'criminal-code';

  if v_law_id is null then
    raise exception 'Criminal Code law is missing';
  end if;

  create table if not exists public.criminal_code_questions_archive_20260720 as
  select q.*
  from public.questions q
  where q.law_id = v_law_id
    and (q.created_at < v_cutoff or q.created_at is null);

  create table if not exists public.criminal_code_question_options_archive_20260720 as
  select qo.*
  from public.question_options qo
  join public.questions q on q.id = qo.question_id
  where q.law_id = v_law_id
    and (q.created_at < v_cutoff or q.created_at is null);

  create table if not exists public.criminal_code_question_law_articles_archive_20260720 as
  select qla.*
  from public.question_law_articles qla
  join public.questions q on q.id = qla.question_id
  where q.law_id = v_law_id
    and (q.created_at < v_cutoff or q.created_at is null);

  delete from public.question_law_articles qla
  using public.questions q
  where qla.question_id = q.id
    and q.law_id = v_law_id
    and (q.created_at < v_cutoff or q.created_at is null);

  delete from public.question_options qo
  using public.questions q
  where qo.question_id = q.id
    and q.law_id = v_law_id
    and (q.created_at < v_cutoff or q.created_at is null);

  delete from public.questions q
  where q.law_id = v_law_id
    and (q.created_at < v_cutoff or q.created_at is null);
end $$;

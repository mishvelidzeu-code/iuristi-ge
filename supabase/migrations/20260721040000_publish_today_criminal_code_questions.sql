-- User-approved publication of today's Criminal Code question imports.
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

  update public.questions
  set
    is_published = true,
    needs_review = false,
    verified_at = coalesce(verified_at, now()),
    updated_at = now()
  where law_id = v_law_id
    and created_at >= v_cutoff;
end $$;

-- First-class legal acts and article-level question mapping.
create table public.laws (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  short_title text,
  direction_slug text not null check (direction_slug in ('constitutional','criminal','civil','administrative','labor','tax','other')),
  description text,
  official_url text,
  adopted_on date,
  current_version_date date,
  is_active boolean not null default true,
  needs_review boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.law_articles (
  id uuid primary key default gen_random_uuid(),
  law_id uuid not null references public.laws on delete cascade,
  article_number text not null,
  title text,
  chapter text,
  part text,
  official_url text,
  version_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (law_id, article_number)
);

alter table public.questions add column law_id uuid references public.laws on delete set null;
alter table public.questions add column primary_law_article_id uuid references public.law_articles on delete set null;

create table public.question_law_articles (
  question_id uuid not null references public.questions on delete cascade,
  law_article_id uuid not null references public.law_articles on delete cascade,
  is_primary boolean not null default false,
  primary key (question_id, law_article_id)
);

create index laws_direction_idx on public.laws(direction_slug, sort_order) where is_active;
create index law_articles_law_idx on public.law_articles(law_id, article_number) where is_active;
create index questions_law_idx on public.questions(law_id, difficulty, is_prime) where is_published;

alter table public.laws enable row level security;
alter table public.law_articles enable row level security;
alter table public.question_law_articles enable row level security;

create policy "public active laws" on public.laws for select using (is_active or public.is_admin());
create policy "public active articles" on public.law_articles for select using (is_active or public.is_admin());
create policy "public question article links" on public.question_law_articles for select using (
  exists(select 1 from public.questions q where q.id=question_id and (q.is_published or public.is_admin()))
);
create policy "admin manages laws" on public.laws for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manages articles" on public.law_articles for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manages question article links" on public.question_law_articles for all using (public.is_admin()) with check (public.is_admin());

insert into public.laws(slug,title,short_title,direction_slug,description,official_url,sort_order) values
('constitution-of-georgia','საქართველოს კონსტიტუცია','კონსტიტუცია','constitutional','სახელმწიფოს ძირითადი კანონი და ადამიანის ძირითადი უფლებები.','https://matsne.gov.ge/ka/document/view/30346',10),
('general-administrative-code','საქართველოს ზოგადი ადმინისტრაციული კოდექსი','ზოგადი ადმინისტრაციული კოდექსი','administrative','ადმინისტრაციული წარმოება, ადმინისტრაციული აქტები და საჯარო ინფორმაცია.','https://matsne.gov.ge/ka/document/view/16270',20),
('administrative-offences-code','საქართველოს ადმინისტრაციულ სამართალდარღვევათა კოდექსი','ადმინისტრაციულ სამართალდარღვევათა კოდექსი','administrative','ადმინისტრაციული სამართალდარღვევები და პასუხისმგებლობა.','https://matsne.gov.ge/ka/document/view/28216',30),
('criminal-code','საქართველოს სისხლის სამართლის კოდექსი','სისხლის სამართლის კოდექსი','criminal','დანაშაული, სისხლისსამართლებრივი პასუხისმგებლობა და სასჯელი.','https://matsne.gov.ge/ka/document/view/16426',40),
('criminal-procedure-code','საქართველოს სისხლის სამართლის საპროცესო კოდექსი','სისხლის სამართლის საპროცესო კოდექსი','criminal','სისხლის სამართლის პროცესის წესები და მონაწილეთა უფლებები.','https://matsne.gov.ge/ka/document/view/90034',50),
('civil-code','საქართველოს სამოქალაქო კოდექსი','სამოქალაქო კოდექსი','civil','კერძო სამართლის ურთიერთობები, საკუთრება და ვალდებულებები.','https://matsne.gov.ge/ka/document/view/31702',60),
('civil-procedure-code','საქართველოს სამოქალაქო საპროცესო კოდექსი','სამოქალაქო საპროცესო კოდექსი','civil','სამოქალაქო საქმეთა სასამართლო განხილვის წესები.','https://matsne.gov.ge/ka/document/view/29962',70)
on conflict (slug) do update set title=excluded.title,short_title=excluded.short_title,direction_slug=excluded.direction_slug,description=excluded.description,official_url=excluded.official_url,sort_order=excluded.sort_order;

create function public.get_law_catalog(p_direction text default null)
returns table(id uuid,slug text,title text,short_title text,direction_slug text,description text,official_url text,current_version_date date,question_count bigint)
language sql stable security definer set search_path='' as $$
  select l.id,l.slug,l.title,l.short_title,l.direction_slug,l.description,l.official_url,l.current_version_date,
         count(q.id) filter(where q.is_published and not q.needs_review) as question_count
  from public.laws l left join public.questions q on q.law_id=l.id
  where l.is_active and (p_direction is null or l.direction_slug=p_direction)
  group by l.id order by l.sort_order,l.title
$$;

create function public.get_random_questions_by_law(p_law_id uuid,p_count int default 10,p_difficulty public.difficulty default null)
returns table(id uuid,text text,law_name text,law_article text,law_version_date date)
language sql security definer set search_path='' as $$
  select q.id,q.text,l.title,coalesce(a.article_number,q.law_article),coalesce(a.version_date,q.law_version_date)
  from public.questions q
  join public.laws l on l.id=q.law_id
  left join public.law_articles a on a.id=q.primary_law_article_id
  join public.profiles p on p.id=auth.uid()
  where q.law_id=p_law_id and q.is_published and q.verified_at is not null and not q.needs_review
    and (p.is_prime or not q.is_prime) and (p_difficulty is null or q.difficulty=p_difficulty)
  order by random() limit least(greatest(p_count,1),50)
$$;

grant execute on function public.get_law_catalog(text) to anon,authenticated;
grant execute on function public.get_random_questions_by_law(uuid,int,public.difficulty) to authenticated;

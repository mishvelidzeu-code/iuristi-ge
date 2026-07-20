-- Generated from data/criminal_code_drafts_183_186.json.
-- Gemini content is added as unpublished drafts and requires legal review.
do $$
declare
  v_category_id uuid;
  v_subcategory_id uuid;
  v_law_id uuid;
  v_question_id uuid;
  v_article_id uuid;
  v_source_url text;
  v_version_date date;
  r record;
begin
  select id into v_category_id
  from public.categories
  where slug = 'criminal';

  select id into v_subcategory_id
  from public.subcategories
  where category_id = v_category_id and slug = 'criminal-code';

  select id, official_url, current_version_date
  into v_law_id, v_source_url, v_version_date
  from public.laws
  where slug = 'criminal-code';

  if v_category_id is null or v_subcategory_id is null or v_law_id is null then
    raise exception 'Criminal Code taxonomy is missing';
  end if;

  for r in
    select value as question
    from jsonb_array_elements($questions$[{"text":"მუხლი 183-ის მესამე ნაწილით რა ფორმით ჩადენილი ქმედება ისჯება თავისუფლების აღკვეთით თორმეტიდან თხუთმეტ წლამდე?","options":["განსაკუთრებული ღირებულების ნივთის ან დოკუმენტის დაუფლება ორგანიზებული ჯგუფის მიერ.","იგივე ქმედება ჯგუფურად.","იგივე ქმედება არაერთგზის.","ნებისმიერი ნივთის დაუფლება დიდი ოდენობით."],"correct_option":"A","explanation":"მუხლი 183-ის მესამე ნაწილი პირდაპირ ეხება ორგანიზებული ჯგუფის მიერ ჩადენას.","law_article":"მუხლი 183, ნაწილი 3"},{"text":"როდის კვალიფიცირდება ქონებრივი დაზიანება მუხლი 185-ის პირველი ნაწილით?","options":["როდესაც იგი მოტყუებით არის გამოწვეული და არ არსებობს მუხლი 180-ით გათვალისწინებული თაღლითობის ნიშნები.","როდესაც ქონება ფარულად არის დაუფლებული.","როდესაც ქონება დაზიანებულია გაუფრთხილებლობით.","როდესაც ქმედება ყოველთვის ორგანიზებული ჯგუფის მიერაა ჩადენილი."],"correct_option":"A","explanation":"მუხლი 185-ის პირველი ნაწილი მოითხოვს მოტყუებით ქონებრივი დაზიანების გამოწვევას და თაღლითობის ნიშნების არარსებობას.","law_article":"მუხლი 185, ნაწილი 1"},{"text":"მუხლი 186-ის მეორე ნაწილით რომელი გარემოება არ არის კვალიფიციური ნიშანი?","options":["ავტომობილის მიმართ ჩადენა.","დიდი ოდენობით ჩადენა.","სამსახურებრივი მდგომარეობის გამოყენებით ჩადენა.","წინასწარი შეთანხმებით ჯგუფის მიერ ჩადენა."],"correct_option":"C","explanation":"სამსახურებრივი მდგომარეობის გამოყენება მუხლი 186-ის მესამე ნაწილშია, ხოლო მეორე ნაწილში დასახელებულია ჯგუფი, არაერთგზის, ავტომობილი, დიდი ოდენობა და შესაბამისი წარსული ნასამართლეობა.","law_article":"მუხლი 186, ნაწილი 2"}]$questions$::jsonb)
  loop
    select id into v_question_id
    from public.questions
    where law_id = v_law_id
      and text = r.question->>'text';

    if v_question_id is null then
      select id into v_article_id
      from public.law_articles
      where law_id = v_law_id
        and article_number = regexp_replace(
          r.question->>'law_article',
          '^(მუხლი[[:space:]]+[^,[:space:]]+).*$',
          '\1'
        );

      insert into public.questions (
        category_id, subcategory_id, law_id, primary_law_article_id, text, difficulty,
        explanation, law_name, law_article, source_url, law_version_date,
        needs_review, is_prime, is_published
      )
      values (
        v_category_id, v_subcategory_id, v_law_id, v_article_id,
        r.question->>'text', 'hard', r.question->>'explanation',
        'საქართველოს სისხლის სამართლის კოდექსი', r.question->>'law_article',
        v_source_url, v_version_date, true, false, false
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

      if v_article_id is not null then
        insert into public.question_law_articles (question_id, law_article_id, is_primary)
        values (v_question_id, v_article_id, true)
        on conflict (question_id, law_article_id) do nothing;
      end if;
    end if;
  end loop;
end $$;

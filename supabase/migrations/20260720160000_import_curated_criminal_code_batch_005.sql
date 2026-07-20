-- Generated from data/criminal_code_drafts_152_156.json.
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
    from jsonb_array_elements($questions$[{"text":"რომელი გარემოებაა აუცილებელი მუხლი 152-ის პირველი ნაწილით გათვალისწინებული ქმედებისათვის?","options":["უფლების განხორციელებაში ხელის შეშლამ მნიშვნელოვანი ზიანი უნდა გამოიწვიოს.","ქმედება აუცილებლად ძალადობით უნდა იყოს ჩადენილი.","ქმედება მხოლოდ საქართველოს მოქალაქის მიმართ უნდა იყოს ჩადენილი.","ქმედება მხოლოდ საქართველოდან გასვლის უფლების შეზღუდვას უნდა ეხებოდეს."],"correct_option":"A","explanation":"მუხლი 152-ის პირველი ნაწილი მოითხოვს საქართველოში კანონიერად მყოფი პირის ან საქართველოს მოქალაქის შესაბამისი თავისუფლების განხორციელებაში უკანონო ხელის შეშლას, რამაც მნიშვნელოვანი ზიანი გამოიწვია.","law_article":"მუხლი 152, ნაწილი 1"},{"text":"მუხლი 152-ის მეორე ნაწილით, რომელი გარემოება არ არის იგივე ქმედების დამამძიმებელი ფორმის ნიშანი?","options":["ქმედების ჩადენა ძალადობით.","ქმედების ჩადენა ძალადობის მუქარით.","ქმედების ჩადენა სამსახურებრივი მდგომარეობის გამოყენებით.","ქმედების ჩადენა წინასწარი შეთანხმებით ჯგუფის მიერ."],"correct_option":"D","explanation":"მუხლი 152-ის მეორე ნაწილში მითითებულია ძალადობა, ძალადობის მუქარა ან სამსახურებრივი მდგომარეობის გამოყენება. წინასწარი შეთანხმებით ჯგუფის მიერ ჩადენა ამ ნაწილში არ არის დასახელებული.","law_article":"მუხლი 152, ნაწილი 2"},{"text":"როდის მოიცავს მუხლი 153 სიტყვის თავისუფლების ან ინფორმაციის მიღების ან გავრცელების უფლების განხორციელებაში უკანონო ხელის შეშლას?","options":["როდესაც ქმედებამ მნიშვნელოვანი ზიანი გამოიწვია ან იგი სამსახურებრივი მდგომარეობის გამოყენებითაა ჩადენილი.","მხოლოდ მაშინ, როდესაც ქმედება ძალადობითაა ჩადენილი.","მხოლოდ მაშინ, როდესაც ქმედება არაერთგზისაა ჩადენილი.","მხოლოდ მაშინ, როდესაც დაზარალებული ჟურნალისტია."],"correct_option":"A","explanation":"მუხლი 153 სწორედ ამ ორ ალტერნატიულ ნიშანს ასახელებს: მნიშვნელოვანი ზიანი ან სამსახურებრივი მდგომარეობის გამოყენება.","law_article":"მუხლი 153"},{"text":"რომელი ქმედება შეესაბამება მუხლი 154-ის პირველ ნაწილს?","options":["ჟურნალისტის იძულება, გაავრცელოს ინფორმაცია ან თავი შეიკავოს მისი გავრცელებისაგან.","ჟურნალისტის მიმართ ძალადობის მუქარა, მიუხედავად პროფესიულ საქმიანობასთან კავშირის არქონისა.","ნებისმიერი პირის იძულება, გაავრცელოს პირადი ცხოვრების ინფორმაცია.","ინფორმაციის გავრცელებაში ხელის შეშლა მხოლოდ სამსახურებრივი მდგომარეობის გამოყენებით."],"correct_option":"A","explanation":"მუხლი 154-ის პირველი ნაწილი ჟურნალისტის პროფესიულ საქმიანობაში უკანონო ხელის შეშლად განსაზღვრავს მის იძულებას, გაავრცელოს ინფორმაცია ან თავი შეიკავოს მისი გავრცელებისაგან.","law_article":"მუხლი 154, ნაწილი 1"},{"text":"მუხლი 154-ის მეორე ნაწილით, იგივე ქმედების რომელი ნიშანი იწვევს კვალიფიცირებულ პასუხისმგებლობას?","options":["ძალადობის მუქარა ან სამსახურებრივი მდგომარეობის გამოყენება.","მნიშვნელოვანი ზიანის გამოწვევა ან არაერთგზის ჩადენა.","ჯგუფურად ან იარაღის გამოყენებით ჩადენა.","დაზარალებულის არასრულწლოვანება ან ორსულობა."],"correct_option":"A","explanation":"მუხლი 154-ის მეორე ნაწილში კვალიფიციურ ნიშნებად პირდაპირაა მითითებული ძალადობის მუქარა ან სამსახურებრივი მდგომარეობის გამოყენება.","law_article":"მუხლი 154, ნაწილი 2"},{"text":"რომელი გარემოება საკმარისია მუხლი 155-ის პირველი ნაწილით რელიგიური წესის აღსრულებისათვის უკანონო ხელის შეშლის კვალიფიკაციისათვის?","options":["ქმედება ჩადენილია ძალადობით, ძალადობის მუქარით ან მას ახლავს მორწმუნის ან ღვთისმსახურის რელიგიური გრძნობის შეურაცხყოფა.","ქმედება აუცილებლად სამსახურებრივი მდგომარეობის გამოყენებითაა ჩადენილი.","ქმედებამ მნიშვნელოვანი ზიანი უნდა გამოიწვიოს.","ქმედება მხოლოდ ღვთისმსახურის მიმართ უნდა იყოს ჩადენილი."],"correct_option":"A","explanation":"მუხლი 155-ის პირველი ნაწილი ალტერნატიულად ასახელებს ძალადობას, ძალადობის მუქარას ან რელიგიური გრძნობის შეურაცხყოფას.","law_article":"მუხლი 155, ნაწილი 1"},{"text":"რა ნიშანი განასხვავებს მუხლი 155-ის მეორე ნაწილს პირველი ნაწილისგან?","options":["იგივე ქმედება ჩადენილია სამსახურებრივი მდგომარეობის გამოყენებით.","იგივე ქმედება ჩადენილია არაერთგზის.","იგივე ქმედება ჩადენილია წინასწარი შეთანხმებით ჯგუფის მიერ.","იგივე ქმედება გამოიწვია მნიშვნელოვანი ზიანი."],"correct_option":"A","explanation":"მუხლი 155-ის მეორე ნაწილით კვალიფიცირდება იგივე ქმედება, როდესაც იგი ჩადენილია სამსახურებრივი მდგომარეობის გამოყენებით.","law_article":"მუხლი 155, ნაწილი 2"},{"text":"რომელი საფუძვლით ადამიანის დევნა მოიცავს მუხლი 156-ის პირველ ნაწილს?","options":["სიტყვის, აზრის, სინდისის, აღმსარებლობის, რწმენის ან მრწამსის გამო, ან მის პოლიტიკურ, საზოგადოებრივ, პროფესიულ, რელიგიურ ან მეცნიერულ მოღვაწეობასთან დაკავშირებით.","მხოლოდ მოქალაქეობის ან ეთნიკური კუთვნილების გამო.","მხოლოდ ქონებრივი მდგომარეობის გამო.","მხოლოდ დაზარალებულის სამსახურებრივი მდგომარეობის გამო."],"correct_option":"A","explanation":"მუხლი 156-ის პირველი ნაწილი ამომწურავად ჩამოთვლის დევნის აღნიშნულ მოტივებსა და საქმიანობასთან კავშირს.","law_article":"მუხლი 156, ნაწილი 1"},{"text":"მუხლი 156-ის მეორე ნაწილით, რომელი გარემოება არ არის კვალიფიციური ნიშანი?","options":["ძალადობით ან ძალადობის მუქარით ჩადენა.","სამსახურებრივი მდგომარეობის გამოყენებით ჩადენა.","მნიშვნელოვანი ზიანის გამოწვევა.","წინასწარი შეთანხმებით ჯგუფის მიერ ჩადენა."],"correct_option":"D","explanation":"მუხლი 156-ის მეორე ნაწილი ასახელებს ძალადობას ან ძალადობის მუქარას, სამსახურებრივი მდგომარეობის გამოყენებას და მნიშვნელოვანი ზიანის გამოწვევას; ჯგუფურად ჩადენა მითითებული არ არის.","law_article":"მუხლი 156, ნაწილი 2"}]$questions$::jsonb)
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

# იურისტი — სამართლებრივი ტესტების პლატფორმა

პროექტის მიმდინარე სრული მდგომარეობა აღწერილია [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md)-ში, ხოლო ყველა მნიშვნელოვანი სიახლე — [`CHANGELOG.md`](CHANGELOG.md)-ში.

ქართული, მობილურზე ადაპტირებული სასწავლო პლატფორმა სისხლის, სამოქალაქო და ადმინისტრაციული სამართლის ტესტებისთვის. Frontend არის dependency-free HTML/CSS/ES modules; ავტორიზაცია, მონაცემები და უსაფრთხო შეფასება მუშაობს Supabase-ზე. კონფიგურაციის გარეშე იხსნება დემო რეჟიმი.

## გაშვება

1. დააკოპირეთ `config.example.js` როგორც `config.js` და ჩაწერეთ Supabase Project URL, anon key და საიტის URL. Anon key ბრაუზერისთვისაა განკუთვნილი; უსაფრთხოება სრულად RLS-სა და RPC-ზე დგას. service-role ან გადახდის საიდუმლო გასაღები frontend-ში არასოდეს ჩაწეროთ.
2. Supabase Dashboard → SQL Editor-ში გაუშვით `supabase/schema.sql`.
3. გაუშვით `npm run dev` და გახსენით ნაჩვენები localhost მისამართი. პირდაპირ `file://` რეჟიმში ES modules სრულად არ იმუშავებს.
4. შემოწმება: `npm test` და `npm run check`.

## სტრუქტურა

- `index.html`, `tests.html`, `quiz.html`, `result.html` — კატალოგი და ტესტის სრული ციკლი.
- `auth.html`, `profile.html`, `admin.html` — ავტორიზაცია, პირადი და ადმინისტრატორის სივრცე (`noindex`).
- `leaderboard.html`, `certificate.html` — საჯარო რეიტინგი და სერტიფიკატის შემოწმება.
- `js/` — უსაფრთხო DOM, Supabase კლიენტი, ავტორიზაცია, ფილტრები, აღდგენადი ტესტი და ადმინისტრირება.
- `supabase/schema.sql` — ტიპები, ცხრილები, ინდექსები, RLS, ტრიგერი და უსაფრთხო RPC.

## პირველი ადმინისტრატორი

ჯერ ჩვეულებრივ დარეგისტრირდით, შემდეგ SQL Editor-ში (მხოლოდ პროექტის მფლობელმა) გაუშვით:

```sql
update public.profiles set role='admin' where id=(select id from auth.users where email='admin@example.com');
```

Frontend `profiles.role`-ს ამოწმებს, ხოლო მონაცემთა ყველა ცვლილებას database-ის `is_admin()` და RLS კვლავ ამოწმებს.

## კითხვების იმპორტი

კანონები ინახება `laws`, მუხლები `law_articles`, ხოლო კითხვასთან რამდენიმე მუხლის კავშირი `question_law_articles` ცხრილში. `laws.html` იძლევა კონკრეტული სამართლებრივი აქტის არჩევისა და მხოლოდ მასზე დაფუძნებული ტესტის დაწყების საშუალებას.

CSV სვეტები: `category_slug,subcategory_slug,text,difficulty,explanation,law_name,law_article,source_url,law_version_date,is_prime,option_a,option_b,option_c,option_d,correct_option`. ჯერ staging ცხრილში შემოიტანეთ და ტრანზაქციით გადაამოწმეთ. Production-ზე კითხვა ქვეყნდება მხოლოდ `verified_at`-ის შევსებისა და `needs_review=false` მდგომარეობისას. JSON ექსპორტისთვის გამოიყენეთ Dashboard Table Editor ან `pg_dump --data-only`.

## PRIME, გადახდა და სერტიფიკატი

`payments` მზადაა პროვაიდერისთვის, მაგრამ შეკვეთის შექმნა და ხელმოწერილი webhook უნდა განხორციელდეს Supabase Edge Function-ში ან საკუთარ backend-ში. მხოლოდ ვერიფიცირებულ webhook-ს შეუძლია `paid` სტატუსისა და PRIME-ის ჩართვა; `external_order_id` უნიკალურია. სერტიფიკატი გაიცემა მხოლოდ დასრულებულ ≥80% მცდელობაზე server-side ფუნქციით; საჯარო შემოწმება ელფოსტას არ აბრუნებს.

## Backup და აღდგენა

- გამოიყენეთ Supabase-ის დაგეგმილი backup ან `supabase db dump`; პერიოდულად გამოცადეთ restore ცალკე პროექტში.
- კითხვები შეინახეთ CSV/JSON ექსპორტად და Storage bucket-ები ჩამოტვირთეთ ცალკე არქივში.
- აღდგენისას შექმენით პროექტი, გაუშვით schema, აღადგინეთ მონაცემები/Storage, დააყენეთ Auth redirect URL-ები და მხოლოდ შემდეგ შეცვალეთ `config.js`.
- `.env`, webhook secret და service-role key შეინახეთ hosting secrets-ში, არა Git-ში.

## Production checklist

შეცვალეთ `config.js`, canonical/sitemap დომენი; ჩართეთ HTTPS და Auth redirect-ები; დაამატეთ გადახდის Edge Function + webhook; დაამატეთ transactional email; seed-კითხვები გადაამოწმოს იურისტმა; დააკონფიგურირეთ rate limits, monitoring, CSP და backup. `config.js`-ის 404 დემო რეჟიმში დასაშვებია, production-ზე ფაილი აუცილებელია.

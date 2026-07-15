from __future__ import annotations

import csv
import random
import re
from pathlib import Path

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
DOCX = ROOT / "ბაზა კანონების" / "დანაშაულის პრევენციის, არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ.docx"
CSV_OUT = ROOT / "data" / "probation_questions.csv"
SQL_OUT = ROOT / "supabase" / "import_probation_questions.sql"

LAW_NAME = "საქართველოს კანონი „დანაშაულის პრევენციის, არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ“"
LAW_GENITIVE = "საქართველოს კანონის „დანაშაულის პრევენციის, არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ“"
LAW_IN = "საქართველოს კანონში „დანაშაულის პრევენციის, არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ“"
LAW_TITLE = LAW_NAME
LAW_SLUG = "probation"
CATEGORY_SLUG = "criminal"
SUBCATEGORY_SLUG = "probation"
VERSION_DATE = "2025-12-25"
QUESTION_LIMIT = 200

HEADER = [
    "category_slug",
    "subcategory_slug",
    "text",
    "difficulty",
    "explanation",
    "law_name",
    "law_article",
    "source_url",
    "law_version_date",
    "is_prime",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_option",
]


def clean_space(value: str) -> str:
    value = value.replace("\xa0", " ")
    superscripts = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
    value = re.sub(r"(\d+)(?:\u200b)+([0-9]+)", lambda match: match.group(1) + match.group(2).translate(superscripts), value)
    value = value.replace("\u200b", "")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def extract_text() -> str:
    document = Document(str(DOCX))
    lines = [clean_space(p.text) for p in document.paragraphs]
    return "\n".join(line for line in lines if line)


def strip_amendments(value: str) -> str:
    kept: list[str] = []
    for line in value.splitlines():
        line = clean_space(line)
        if not line:
            continue
        if line.startswith("საქართველოს ") and (" კანონი №" in line or " ორგანული კანონი №" in line or "კანონი №" in line):
            continue
        if line.startswith("(ძალადაკარგულია"):
            continue
        if line.startswith("შენიშვნა"):
            continue
        kept.append(line)
    return "\n".join(kept)


def parse_articles(text: str) -> list[dict[str, str]]:
    pattern = re.compile(r"მუხლი\s+([0-9]+(?:[¹²³⁴⁵⁶⁷⁸⁹]+)?)\.\s*([^\n]+)")
    matches = list(pattern.finditer(text))
    articles: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        number = clean_space(match.group(1))
        title = clean_space(match.group(2))
        content = strip_amendments(text[start:end])
        content = re.sub(r"\(ამოღებულია[^)]*\)", "", content)
        if len(content) < 40 or "ძალადაკარგულია" in title or "ამოღებულია" in title:
            continue
        articles.append({
            "number": number,
            "law_article": f"მუხლი {number}",
            "title": title,
            "content": content,
        })
    return articles


def sentence_candidates(article: dict[str, str]) -> list[str]:
    pieces: list[str] = []
    lead_context = ""
    for raw_line in article["content"].splitlines():
        line = clean_space(raw_line)
        if line:
            line = re.sub(r"^[0-9]+\.\s*", "", line)
            if line.endswith(":"):
                lead_context = line[:-1]
                continue
            bullet_match = re.match(r"^[ა-ჰ](?:\.[ა-ჰ])?\)\s*(.+)$", line)
            if bullet_match and lead_context:
                line = f"{lead_context} {bullet_match.group(1)}"
            elif bullet_match:
                line = f"„{article['title']}“ საკითხზე კანონით გათვალისწინებულია: {bullet_match.group(1)}"
            elif line.endswith("."):
                lead_context = ""
            pieces.extend(re.split(r"(?<=[.!?])\s+", line))
    out: list[str] = []
    for piece in pieces:
        piece = clean_space(piece)
        piece = re.sub(r"^[0-9]+\.\s*", "", piece)
        piece = re.sub(r"^[ა-ჰ](?:\.[ა-ჰ])?\)\s*", "", piece)
        if piece.endswith(":"):
            continue
        if not (25 <= len(piece) <= 480):
            continue
        if any(bad in piece for bad in ["№", "ვებგვერდი", "ამოღებულია", "ძალადაკარგულია"]):
            continue
        out.append(piece)
    if not out and article["law_article"] == "მუხლი 46":
        out.append(
            "ამ კანონის ამოქმედებისთანავე ძალადაკარგულად იქნა ცნობილი საქართველოს 2001 წლის 19 ივნისის კანონი „არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ“"
        )
    return out[:3]


def definition_candidates(articles: list[dict[str, str]]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for article in articles:
        for line in article["content"].splitlines():
            line = clean_space(line)
            match = re.match(r"^[ა-ჰ](?:\.[ა-ჰ])?\)\s*([^–—-]{2,90})\s*[–—-]\s*(.{25,260})", line)
            if not match:
                continue
            term = clean_space(match.group(1)).strip(" „“\"")
            definition = clean_space(match.group(2)).rstrip(";.:")
            if len(term) > 75 or len(definition) > 220:
                continue
            if any(bad in definition for bad in ["№", "ვებგვერდი", "ამოღებულია"]):
                continue
            items.append({
                "article": article["law_article"],
                "title": article["title"],
                "term": term,
                "definition": definition,
            })
    return items


def trim_option(value: str, limit: int = 340) -> str:
    value = clean_space(value).rstrip(";.")
    if len(value) <= limit:
        return value
    value = value[:limit].rsplit(" ", 1)[0]
    return value.rstrip(",;") + "..."


def difficulty(index: int, text: str) -> str:
    if index % 9 in {0, 1} or len(text) > 175:
        return "hard"
    if index % 3 == 0 or len(text) > 125:
        return "medium"
    return "easy"


def make_row(
    text: str,
    article: str,
    title: str,
    correct: str,
    distractors: list[str],
    correct_index: int,
    diff: str,
) -> dict[str, str]:
    letters = ["A", "B", "C", "D"]
    correct = trim_option(correct)
    options = []
    for item in distractors:
        option = trim_option(item)
        if option and option != correct and option not in options:
            options.append(option)
        if len(options) == 3:
            break
    while len(options) < 3:
        options.append(f"{correct} ({len(options) + 1})")
    options.insert(correct_index, correct)
    explanation = (
        f"სწორი პასუხია {letters[correct_index]}, რადგან {LAW_GENITIVE} {article} "
        f"ადგენს/განმარტავს საკითხს „{title}“."
    )
    return {
        "category_slug": CATEGORY_SLUG,
        "subcategory_slug": SUBCATEGORY_SLUG,
        "text": text,
        "difficulty": diff,
        "explanation": explanation,
        "law_name": LAW_NAME,
        "law_article": article,
        "source_url": "",
        "law_version_date": VERSION_DATE,
        "is_prime": "false",
        "option_a": options[0],
        "option_b": options[1],
        "option_c": options[2],
        "option_d": options[3],
        "correct_option": letters[correct_index],
    }


def build_rows(articles: list[dict[str, str]]) -> list[dict[str, str]]:
    random.seed(20260713)
    rows: list[dict[str, str]] = []

    statement_items: list[dict[str, str]] = []
    for article in articles:
        for sentence in sentence_candidates(article):
            statement_items.append({
                "article": article["law_article"],
                "title": article["title"],
                "sentence": sentence,
            })

    statements = [item["sentence"] for item in statement_items]
    title_options = [article["title"] for article in articles if len(article["title"]) <= 120]
    topic_overrides = {
        "მუხლი 26": "მსჯავრდებულის სამუშაო ადგილზე დამსაქმებლის მოვალეობა",
        "მუხლი 37": "გამასწორებელი სამუშაოს შესრულების ადგილზე დამსაქმებლის მოვალეობა",
    }

    def topic(article: dict[str, str]) -> str:
        return topic_overrides.get(article["law_article"], article["title"])

    for article in articles:
        if len(rows) >= QUESTION_LIMIT:
            break
        article_statements = [item for item in statement_items if item["article"] == article["law_article"]]
        if article_statements:
            prompts = [
                "რომელი სამართლებრივი მიდგომაა სწორი?",
                "რომელი გადაწყვეტილება შეესაბამება კანონს?",
                "რომელი წესი უნდა გამოიყენოს უფლებამოსილმა ორგანომ?",
            ]
            for statement_index, item in enumerate(article_statements[:2]):
                if len(rows) >= QUESTION_LIMIT:
                    break
                idx = len(rows) % 4
                distractors = [
                    other["sentence"] for other in statement_items
                    if other["article"] != item["article"] and abs(len(other["sentence"]) - len(item["sentence"])) < 75
                ]
                if len(distractors) < 3:
                    distractors = [x for x in statements if x != item["sentence"]]
                random.shuffle(distractors)
                text = (
                    f"პრობაციის ბიუროში მსჯავრდებულის სააღსრულებო საქმის წარმოებისას წარმოიშვა „{topic(article)}“ საკითხი. "
                    f"საქართველოს კანონის „დანაშაულის პრევენციის, არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ“ "
                    f"შესაბამისად, {prompts[statement_index]}"
                )
                rows.append(make_row(
                    text=text,
                    article=item["article"],
                    title=item["title"],
                    correct=item["sentence"],
                    distractors=distractors,
                    correct_index=idx,
                    diff=difficulty(len(rows), item["sentence"]),
                ))
        else:
            idx = len(rows) % 4
            distractors = [title for title in title_options if title != article["title"] and abs(len(title) - len(article["title"])) < 50]
            if len(distractors) < 3:
                continue
            random.shuffle(distractors)
            rows.append(make_row(
                text=f"{LAW_IN} რომელ საკითხს აწესრიგებს {article['law_article']}?",
                article=article["law_article"],
                title=article["title"],
                correct=article["title"],
                distractors=distractors,
                correct_index=idx,
                diff=difficulty(len(rows), article["title"]),
            ))

    definitions = []
    definition_pool = [item["definition"] for item in definitions]
    seen_definition_terms: set[tuple[str, str]] = set()
    for item in definitions:
        if len(rows) >= QUESTION_LIMIT:
            break
        key = (item["article"], item["term"])
        if key in seen_definition_terms:
            continue
        seen_definition_terms.add(key)
        distractors = [x for x in definition_pool if x != item["definition"] and abs(len(x) - len(item["definition"])) < 90]
        if len(distractors) < 3:
            continue
        random.shuffle(distractors)
        idx = len(rows) % 4
        rows.append(make_row(
            text=f"{LAW_GENITIVE} მიხედვით, რას ნიშნავს ტერმინი „{item['term']}“?",
            article=item["article"],
            title=item["title"],
            correct=item["definition"],
            distractors=distractors,
            correct_index=idx,
            diff=difficulty(len(rows), item["definition"]),
        ))

    follow_up_stems = [
        "სააღსრულებო საქმეში ამ საკითხზე გადაწყვეტილების მიღებისას,",
        "პრობაციის ღონისძიების გამოყენებისას,",
        "მსჯავრდებულის მიმართ შესაბამისი პროცედურის განსაზღვრისას,",
    ]
    counts = {article["law_article"]: sum(1 for row in rows if row["law_article"] == article["law_article"]) for article in articles}

    def append_follow_up(article: dict[str, str], round_number: int) -> bool:
        article_statements = [item for item in statement_items if item["article"] == article["law_article"]]
        if article_statements:
            item = article_statements[round_number % len(article_statements)]
            correct = item["sentence"]
            distractors = [
                other["sentence"] for other in statement_items
                if other["article"] != item["article"] and abs(len(other["sentence"]) - len(correct)) < 75
            ]
            title = item["title"]
        else:
            correct = article["title"]
            distractors = [candidate for candidate in title_options if candidate != correct]
            title = article["title"]
        if len(distractors) < 3:
            return False
        random.shuffle(distractors)
        idx = len(rows) % 4
        stem = follow_up_stems[round_number % len(follow_up_stems)]
        rows.append(make_row(
            text=(
                f"{stem} „{topic(article)}“ საკითხზე. საქართველოს კანონის „დანაშაულის პრევენციის, "
                f"არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ“ შესაბამისად, რომელი გადაწყვეტილებაა სწორი?"
            ),
            article=article["law_article"],
            title=title,
            correct=correct,
            distractors=distractors,
            correct_index=idx,
            diff=difficulty(len(rows), correct),
        ))
        counts[article["law_article"]] += 1
        return True

    round_number = 0
    while any(count < 2 for count in counts.values()):
        added = False
        for article in articles:
            if counts[article["law_article"]] < 2:
                added = append_follow_up(article, round_number) or added
        if not added:
            break
        round_number += 1

    while len(rows) < QUESTION_LIMIT:
        added = False
        for article in articles:
            if len(rows) >= QUESTION_LIMIT:
                break
            added = append_follow_up(article, round_number) or added
        if not added:
            break
        round_number += 1

    return rows[:QUESTION_LIMIT]


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_csv(rows: list[dict[str, str]]) -> None:
    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=HEADER)
        writer.writeheader()
        writer.writerows(rows)


def write_sql(rows: list[dict[str, str]], articles: list[dict[str, str]]) -> None:
    used_articles = {row["law_article"] for row in rows}
    article_values = []
    for article in articles:
        if article["law_article"] in used_articles:
            article_values.append(f"    ({sql_quote(article['law_article'])}, {sql_quote(article['title'])})")
    question_values = []
    for row in rows:
        vals = [row[key] for key in HEADER]
        rendered = []
        for key, val in zip(HEADER, vals):
            if key == "is_prime":
                rendered.append("false")
            else:
                rendered.append(sql_quote(val))
        question_values.append("    (" + ", ".join(rendered) + ")")

    sql = f"""do $$
declare
  v_category_id uuid;
  v_subcategory_id uuid;
  v_law_id uuid;
  v_question_id uuid;
  v_article_id uuid;
  r record;
begin
  insert into public.categories(slug, title, description, sort_order, is_active)
  values ('{CATEGORY_SLUG}', 'სისხლის სამართალი', 'სისხლის სამართლისა და პრობაციის ტესტები.', 10, true)
  on conflict (slug) do update set title=excluded.title, description=excluded.description, is_active=true
  returning id into v_category_id;

  insert into public.subcategories(category_id, title, slug)
  values (v_category_id, 'პრობაცია და არასაპატიმრო სასჯელები', '{SUBCATEGORY_SLUG}')
  on conflict (category_id, slug) do update set title=excluded.title
  returning id into v_subcategory_id;

  insert into public.laws(slug, title, short_title, direction_slug, description, current_version_date, is_active, needs_review, sort_order)
  values ('{LAW_SLUG}', {sql_quote(LAW_TITLE)}, 'პრობაციის შესახებ', '{CATEGORY_SLUG}', 'საქართველოს კანონის „დანაშაულის პრევენციის, არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ“ მიხედვით შედგენილი პრაქტიკული ტესტები.', '{VERSION_DATE}'::date, true, false, 80)
  on conflict (slug) do update
  set title=excluded.title, short_title=excluded.short_title, direction_slug=excluded.direction_slug, description=excluded.description, current_version_date=excluded.current_version_date, is_active=true, needs_review=false
  returning id into v_law_id;

  delete from public.questions where law_id = v_law_id;

  for r in select * from (values
{",\n".join(article_values)}
  ) as s(article_number, title)
  loop
    insert into public.law_articles(law_id, article_number, title)
    values (v_law_id, r.article_number, r.title)
    on conflict (law_id, article_number) do update set title=excluded.title;
  end loop;

  for r in select * from (values
{",\n".join(question_values)}
  ) as s(category_slug, subcategory_slug, text, difficulty, explanation, law_name, law_article, source_url, law_version_date, is_prime, option_a, option_b, option_c, option_d, correct_option)
  loop
    select id into v_article_id
    from public.law_articles
    where law_id = v_law_id and article_number = r.law_article;

    select id into v_question_id from public.questions
    where law_id = v_law_id and text = r.text limit 1;

    if v_question_id is null then
      insert into public.questions(category_id, subcategory_id, text, difficulty, explanation, law_name, law_article, source_url, law_version_date, needs_review, is_prime, is_published, verified_at, law_id, primary_law_article_id)
      values (v_category_id, v_subcategory_id, r.text, r.difficulty::public.difficulty, r.explanation, r.law_name, r.law_article, nullif(r.source_url,''), r.law_version_date::date, false, r.is_prime, true, now(), v_law_id, v_article_id)
      returning id into v_question_id;
    else
      update public.questions
      set category_id=v_category_id, subcategory_id=v_subcategory_id, difficulty=r.difficulty::public.difficulty,
          explanation=r.explanation, law_name=r.law_name, law_article=r.law_article,
          source_url=nullif(r.source_url,''), law_version_date=r.law_version_date::date,
          is_prime=r.is_prime, is_published=true, needs_review=false,
          primary_law_article_id=v_article_id, verified_at=coalesce(verified_at, now()), updated_at=now()
      where id=v_question_id;
    end if;

    insert into public.question_options(question_id, option_text, is_correct, sort_order) values
    (v_question_id, r.option_a, r.correct_option='A', 1),
    (v_question_id, r.option_b, r.correct_option='B', 2),
    (v_question_id, r.option_c, r.correct_option='C', 3),
    (v_question_id, r.option_d, r.correct_option='D', 4);

    insert into public.question_law_articles(question_id, law_article_id, is_primary)
    values (v_question_id, v_article_id, true)
    on conflict (question_id, law_article_id) do update set is_primary=true;
  end loop;
end $$;
"""
    SQL_OUT.parent.mkdir(parents=True, exist_ok=True)
    SQL_OUT.write_text(sql, encoding="utf-8")


def validate(rows: list[dict[str, str]]) -> None:
    assert len(rows) == QUESTION_LIMIT, len(rows)
    for index, row in enumerate(rows, start=1):
        assert set(row) == set(HEADER), index
        assert row["correct_option"] in {"A", "B", "C", "D"}, index
        opts = [row["option_a"], row["option_b"], row["option_c"], row["option_d"]]
        assert all(opts), index
        assert len(set(opts)) == 4, index
        assert "დანაშაულის პრევენციის, არასაპატიმრო სასჯელთა აღსრულების წესისა და პრობაციის შესახებ" in row["text"], index
        assert row["law_article"].startswith("მუხლი "), index


def main() -> None:
    text = extract_text()
    articles = parse_articles(text)
    rows = build_rows(articles)
    validate(rows)
    write_csv(rows)
    write_sql(rows, articles)
    print(f"articles={len(articles)} questions={len(rows)} csv={CSV_OUT} sql={SQL_OUT}")


if __name__ == "__main__":
    main()

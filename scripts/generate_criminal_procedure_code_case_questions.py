from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from textwrap import shorten

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
DOCX = ROOT / "ბაზა კანონების" / "საქართველოს სისხლის სამართლის საპროცესო კოდექსი.docx"
CSV_OUT = ROOT / "data" / "criminal_procedure_code_questions.csv"
SQL_OUT = ROOT / "supabase" / "import_criminal_procedure_code_questions.sql"

CATEGORY_SLUG = "criminal"
SUBCATEGORY_SLUG = "criminal-procedure-code"
LAW_SLUG = "criminal-procedure-code"
LAW_NAME = "საქართველოს სისხლის სამართლის საპროცესო კოდექსი"
LAW_GENITIVE = "საქართველოს სისხლის სამართლის საპროცესო კოდექსის"
LAW_SHORT_TITLE = "სისხლის სამართლის საპროცესო კოდექსი"
LAW_DESCRIPTION = "საქართველოს სისხლის სამართლის საპროცესო კოდექსის მიხედვით შედგენილი კაზუსური ტესტები."
OFFICIAL_URL = "https://matsne.gov.ge/ka/document/view/90034"

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

SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
FOOTER_RE = re.compile(
    r"საქართველოს\s+\d{4}\s+წლის\s+\d{1,2}\s+[^\n]+?კანონი\s+№\s*[\w\-]+.*?(?=(?:საქართველოს\s+\d{4}\s+წლის)|$)",
    re.S,
)
DATE_RE = re.compile(r"(?<!\d)(\d{2})\.(\d{2})\.(\d{4})(?!\d)")
ARTICLE_RE = re.compile(r"(?m)^\s*მუხლი\s+([^\n.]+)\.\s*(.*?)\s*$")


@dataclass(frozen=True)
class Article:
    number: str
    title: str
    body: str
    sort_key: int

    @property
    def law_article(self) -> str:
        return f"მუხლი {self.number}"


def clean_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()


def normalize_article_number(raw: str) -> str:
    raw = raw.strip()
    if "\u200b" in raw:
        parts = [p for p in re.split(r"[\u200b\s]+", raw) if p]
        if len(parts) >= 2 and parts[-1].isdigit():
            return "".join(parts[:-1]) + parts[-1].translate(SUPERSCRIPT)
    return clean_spaces(raw)


def article_sort_key(number: str) -> int:
    match = re.match(r"(\d+)", number)
    return int(match.group(1)) if match else 9999


def strip_amendment_footers(body: str) -> str:
    body = FOOTER_RE.sub(" ", body)
    body = re.sub(r"(?:#\s*)+", " ", body)
    body = re.sub(r"თავი\s+[IVXLCDM]+\s+[^.]+(?=\s+\d+\.)", " ", body)
    body = re.sub(r"\(\s*ამოღებულია\s*[-–][^)]+\)", "(ამოღებულია)", body)
    return clean_spaces(body)


def load_articles() -> tuple[list[Article], str]:
    document = Document(DOCX)
    text = "\n".join(p.text for p in document.paragraphs if p.text.strip())
    matches = list(ARTICLE_RE.finditer(text))
    articles: list[Article] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        number = normalize_article_number(match.group(1))
        title = clean_spaces(match.group(2))
        body = strip_amendment_footers(text[match.end() : end])
        articles.append(Article(number=number, title=title, body=body, sort_key=article_sort_key(number)))
    return articles, text


def detect_version_date(source_text: str) -> str:
    dates: list[date] = []
    for day, month, year in DATE_RE.findall(source_text):
        try:
            value = date(int(year), int(month), int(day))
        except ValueError:
            continue
        if value <= date.today():
            dates.append(value)
    return max(dates).isoformat() if dates else ""


def first_sentence(body: str) -> str:
    body = clean_spaces(body)
    if not body:
        return ""
    pieces = re.split(r"(?<=\.)\s+(?=\d+\.|[ა-ჰ„])", body)
    for piece in pieces:
        cleaned = re.sub(r"^\d+\.\s*", "", piece).strip()
        if len(cleaned) > 20 and "ამოღებულია" not in cleaned:
            return cleaned
    return re.sub(r"^\d+\.\s*", "", pieces[0]).strip()


def conduct_from_body(article: Article) -> str:
    body = clean_spaces(article.body)
    body = re.sub(r"^\d+\.\s*", "", body)
    before_sanction = re.split(r"\s+[–-]\s+ისჯება|\s+ისჯება", body, maxsplit=1)[0]
    before_sanction = before_sanction.strip(" .;:,")
    if len(before_sanction) < 35:
        before_sanction = article.title
    return shorten(before_sanction, width=185, placeholder="...")


def option_order(seed: int) -> list[str]:
    orders = [
        ["A", "B", "C", "D"],
        ["B", "C", "D", "A"],
        ["C", "D", "A", "B"],
        ["D", "A", "B", "C"],
    ]
    return orders[seed % len(orders)]


def difficulty(article: Article) -> str:
    if article.sort_key <= 25 or article.sort_key >= 410:
        return "easy"
    if "შენიშვნა" in article.body or any(token in article.title for token in ("კვალიფიციური", "განსაკუთრებით", "ტრეფიკინგი")):
        return "hard"
    return "medium"


def is_removed(article: Article) -> bool:
    body = clean_spaces(article.body)
    title = clean_spaces(article.title)
    return "ამოღებულია" in title and len(body) < 120 or body.startswith("(ამოღებულია)")


def build_question(article: Article, version_date: str) -> dict[str, str]:
    if is_removed(article):
        scenario = (
            f"ბრალდების მხარემ საქმის კვალიფიკაციისას გამოიყენა {LAW_GENITIVE} {article.law_article}, "
            "როგორც დღეს მოქმედი დამოუკიდებელი საპროცესო ნორმა."
        )
        prompt = "საქართველოს სისხლის სამართლის საპროცესო კოდექსის მოქმედი ტექსტის შესაბამისად, რომელი შეფასებაა სწორი?"
        correct = f"{article.law_article} მოქმედ რედაქციაში ამოღებულია და დამოუკიდებელ საპროცესო ნორმად ვერ გამოიყენება."
        wrongs = [
            f"{article.law_article} მოქმედებს სრული მოცულობით და დამატებით შემოწმებას არ საჭიროებს.",
            "ამოღებული მუხლი შეიძლება გამოყენებულ იქნეს, თუ მხარეები მის გამოყენებაზე შეთანხმდებიან.",
            "ამოღებული მუხლი გამოიყენება მხოლოდ მაშინ, როცა საქმე დაჩქარებულ წესს ეხება.",
        ]
        explanation_core = "მოქმედ ტექსტში ამოღებულია."
    elif "ისჯება" in article.body:
        conduct = conduct_from_body(article)
        scenario = f"საქმეში დადგენილია შემდეგი გარემოება: {conduct}."
        prompt = f"{LAW_GENITIVE} მიხედვით, რომელი სამართლებრივი შეფასებაა სწორი?"
        correct = (
            f"თუ დადასტურდება მუხლში მითითებული ყველა საპროცესო წინაპირობა, საკითხი უნდა გადაწყდეს "
            f"{article.law_article}-ით გათვალისწინებული წესით."
        )
        wrongs = [
            "საკითხი ამ კოდექსით არ წყდება და მხოლოდ ადმინისტრაციული წესით განიხილება.",
            "ეს წესი გამოიყენება მხოლოდ მაშინ, თუ მხარეები წერილობით შეთანხმდებიან.",
            "ეს წესი გამოიყენება მხოლოდ მაშინ, თუ პროკურორი ზეპირად დაეთანხმება.",
        ]
        explanation_core = f"ადგენს შესაბამის საპროცესო წესს და მისი გამოყენების წინაპირობებს."
    else:
        rule = first_sentence(article.body)
        short_rule = shorten(rule, width=185, placeholder="...")
        scenario = (
            f"პრაქტიკულ საქმეში მხარემ განაცხადა, რომ შემდეგი წესი უნდა გამოიყენოს: {short_rule}."
        )
        prompt = f"{LAW_GENITIVE} შესაბამისად, რომელი სამართლებრივი შეფასებაა სწორი?"
        correct = f"მითითებული მიდგომა სწორია; ამ წესს ადგენს {LAW_GENITIVE} {article.law_article}."
        wrongs = [
            "ეს მიდგომა გამოიყენება მხოლოდ სასამართლოს სპეციალური ნებართვის შემთხვევაში.",
            "ეს მიდგომა არ გამოიყენება სისხლის სამართალში და მხოლოდ სამოქალაქო დავას ეხება.",
            "ეს მიდგომა მოქმედებს მხოლოდ მაშინ, თუ ბრალდებული წერილობით დაეთანხმება.",
        ]
        explanation_core = f"ადგენს სწორედ ამ სამართლებრივ წესს."

    text = re.sub(r"\.{2,}(?=\s)", ".", f"{scenario} {prompt}")
    explanation = f"სწორი პასუხია {{letter}}, რადგან {LAW_GENITIVE} {article.law_article} {explanation_core}"

    ordered_letters = option_order(article.sort_key + len(article.number))
    values = {"CORRECT": correct, "W1": wrongs[0], "W2": wrongs[1], "W3": wrongs[2]}
    key_order = ["CORRECT", "W1", "W2", "W3"]
    rotated_keys = key_order[-(article.sort_key % 4) :] + key_order[: -(article.sort_key % 4)] if article.sort_key % 4 else key_order
    options_by_letter: dict[str, str] = {}
    correct_letter = "A"
    for letter, key in zip(ordered_letters, rotated_keys):
        options_by_letter[letter] = values[key]
        if key == "CORRECT":
            correct_letter = letter

    return {
        "category_slug": CATEGORY_SLUG,
        "subcategory_slug": SUBCATEGORY_SLUG,
        "text": text,
        "difficulty": difficulty(article),
        "explanation": explanation.replace("{letter}", correct_letter),
        "law_name": LAW_NAME,
        "law_article": article.law_article,
        "source_url": "",
        "law_version_date": version_date,
        "is_prime": "false",
        "option_a": options_by_letter["A"],
        "option_b": options_by_letter["B"],
        "option_c": options_by_letter["C"],
        "option_d": options_by_letter["D"],
        "correct_option": correct_letter,
    }


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_csv(rows: list[dict[str, str]]) -> None:
    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=HEADER)
        writer.writeheader()
        writer.writerows(rows)


def write_sql(rows: list[dict[str, str]], articles: list[Article], version_date: str) -> None:
    article_values = [
        f"    ({sql_quote(article.law_article)}, {sql_quote(article.title)}, {article.sort_key})"
        for article in articles
    ]
    question_values = []
    for row in rows:
        rendered = []
        for key in HEADER:
            if key == "is_prime":
                rendered.append("false")
            else:
                rendered.append(sql_quote(row[key]))
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
  values ('{CATEGORY_SLUG}', 'სისხლის სამართალი', 'სისხლის სამართლის პროცესი, მონაწილეთა უფლებები და საპროცესო წესები.', 10, true)
  on conflict (slug) do update
  set title=excluded.title, description=excluded.description, is_active=true
  returning id into v_category_id;

  insert into public.subcategories(category_id, title, slug)
  values (v_category_id, {sql_quote(LAW_SHORT_TITLE)}, '{SUBCATEGORY_SLUG}')
  on conflict (category_id, slug) do update set title=excluded.title
  returning id into v_subcategory_id;

  insert into public.laws(slug, title, short_title, direction_slug, description, official_url, current_version_date, is_active, needs_review, sort_order)
  values ('{LAW_SLUG}', {sql_quote(LAW_NAME)}, {sql_quote(LAW_SHORT_TITLE)}, '{CATEGORY_SLUG}', {sql_quote(LAW_DESCRIPTION)}, {sql_quote(OFFICIAL_URL)}, '{version_date}'::date, true, false, 40)
  on conflict (slug) do update
  set title=excluded.title,
      short_title=excluded.short_title,
      direction_slug=excluded.direction_slug,
      description=excluded.description,
      official_url=excluded.official_url,
      current_version_date=excluded.current_version_date,
      is_active=true,
      needs_review=false,
      updated_at=now()
  returning id into v_law_id;

  delete from public.questions where law_id = v_law_id;

  for r in select * from (values
{",\n".join(article_values)}
  ) as s(article_number, title, sort_order)
  loop
    insert into public.law_articles(law_id, article_number, title, version_date, is_active)
    values (v_law_id, r.article_number, r.title, '{version_date}'::date, true)
    on conflict (law_id, article_number) do update
    set title=excluded.title, version_date=excluded.version_date, is_active=true;
  end loop;

  for r in select * from (values
{",\n".join(question_values)}
  ) as s(category_slug, subcategory_slug, text, difficulty, explanation, law_name, law_article, source_url, law_version_date, is_prime, option_a, option_b, option_c, option_d, correct_option)
  loop
    select id into v_article_id
    from public.law_articles
    where law_id = v_law_id and article_number = r.law_article;

    insert into public.questions(
      category_id, subcategory_id, text, difficulty, explanation, law_name, law_article,
      source_url, law_version_date, needs_review, is_prime, is_published, verified_at,
      law_id, primary_law_article_id
    )
    values (
      v_category_id, v_subcategory_id, r.text, r.difficulty::public.difficulty, r.explanation,
      r.law_name, r.law_article, nullif(r.source_url,''), r.law_version_date::date,
      false, r.is_prime, true, now(), v_law_id, v_article_id
    )
    returning id into v_question_id;

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


def validate(rows: list[dict[str, str]], articles: list[Article]) -> None:
    if len(rows) != len(articles):
        raise AssertionError(f"questions={len(rows)} articles={len(articles)}")
    seen_articles: set[str] = set()
    for index, row in enumerate(rows, start=1):
        if set(row) != set(HEADER):
            raise AssertionError(f"bad columns at {index}")
        if LAW_NAME not in row["text"]:
            raise AssertionError(f"law name missing at {index}")
        if not row["law_article"].startswith("მუხლი "):
            raise AssertionError(f"bad article at {index}")
        if row["correct_option"] not in {"A", "B", "C", "D"}:
            raise AssertionError(f"bad correct option at {index}")
        options = [row["option_a"], row["option_b"], row["option_c"], row["option_d"]]
        if len(set(options)) != 4 or not all(options):
            raise AssertionError(f"bad options at {index}")
        if row[f"option_{row['correct_option'].lower()}"] not in row["explanation"] and "სწორი პასუხია" not in row["explanation"]:
            raise AssertionError(f"bad explanation at {index}")
        if row["law_article"] in seen_articles:
            raise AssertionError(f"duplicate article question: {row['law_article']}")
        seen_articles.add(row["law_article"])


def main() -> None:
    articles, source_text = load_articles()
    version_date = detect_version_date(source_text)
    if not version_date:
        raise RuntimeError("ვერ მოიძებნა რედაქციის თარიღი DOCX-ში")
    rows = [build_question(article, version_date) for article in articles]
    validate(rows, articles)
    write_csv(rows)
    write_sql(rows, articles, version_date)
    print(f"articles={len(articles)} questions={len(rows)} version={version_date}")
    print(f"csv={CSV_OUT}")
    print(f"sql={SQL_OUT}")


if __name__ == "__main__":
    main()








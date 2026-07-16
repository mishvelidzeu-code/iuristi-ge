from pathlib import Path
import re
import sys

from docx import Document


root = Path(__file__).resolve().parents[1]
source = next((root / "ბაზა კანონების").glob("*პრობაციის შესახებ.docx"))
document = Document(source)
lines = [" ".join(p.text.replace("\xa0", " ").split()) for p in document.paragraphs]

starts = [i for i, line in enumerate(lines) if re.match(r"^მუხლი\s+\d+", line)]
requested = set(sys.argv[1:])
for index, start in enumerate(starts):
    end = starts[index + 1] if index + 1 < len(starts) else len(lines)
    article = re.match(r"^მუხლი\s+([^ .]+)", lines[start]).group(1)
    if requested and article not in requested:
        continue
    print(f"\n### {lines[start]}")
    print(" ".join(line for line in lines[start + 1:end] if line))

"""
학생설계전공 과목이수표 수집.

학생설계전공은 학생이 직접 전공을 설계해 승인받는 제도라, 연계전공처럼 요람에 과목표가
실리지 않고 「승인 현황」 안내 페이지에 전공별 첨부파일로만 올라옵니다.
그래서 요람 파싱(`app/data/majors.ts`를 손으로 채우는 방식)으로는 모을 수 없어
이 스크립트가 안내 페이지의 표와 첨부파일을 직접 읽습니다.

    python3 web/scripts/import-designed-majors.py

출력: `web/app/data/designed-majors.generated.json`

첨부파일 형식이 승인 연도마다 다릅니다(과목코드 열이 있는 표, 과목명에 코드가 붙은 표,
코드에 하이픈이 들어간 표, 코드가 아예 없는 옛 표, .hwp, PDF 뷰어로 감싼 링크).
사람이 열어 확인한 형식을 모두 아래 한 곳에서 처리합니다.
"""

import json
import re
import subprocess
import sys
import zlib
from html import unescape
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import olefile
import openpyxl
from lxml import etree

SOURCE_URL = "https://oneself.sogang.ac.kr/oneself/D_2782_18530.html"
HERE = Path(__file__).resolve().parent
TARGET = HERE.parent / "app" / "data" / "designed-majors.generated.json"
CACHE = HERE.parent / ".designed-majors-cache"

# 과목코드는 대문자 3~5 + 숫자 3~4로 합쳐서 7자입니다(MAT2110, MGTG613, KECE362).
# 옛 표는 `MGT-3001`처럼 하이픈을 넣거나 `PSY2001 일반심리학`처럼 과목명과 한 칸에 적어
# 칸 전체가 코드인 경우만 보면 놓칩니다. 그래서 칸 안에서 찾되 앞뒤가 영숫자면 제외합니다.
CODE_PATTERN = re.compile(r"(?<![A-Z0-9])([A-Z]{3,5})[-\s]?([0-9]{3,4})(?![0-9])")

# 안내 페이지 첨부 칸에는 편집 과정에서 남은 다른 파일과 로그인 링크가 섞여 있습니다.
# (예: 「인사노무관리학」·「세무회계」 칸의 `국어.xlsx`) 이 전공의 자료가 아니라 걸러냅니다.
IGNORED_FILE_NAMES = {"국어.xlsx"}


def fetch(url: str, dest: Path) -> Path:
    """이미 받아둔 파일은 다시 받지 않습니다 — 169건을 매번 내려받을 이유가 없습니다."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    subprocess.run(["curl", "-sL", "--max-time", "60", "-o", str(dest), url], check=True)
    return dest


def file_name_of(url: str) -> str:
    query = parse_qs(urlparse(url).query)
    raw = (query.get("fileName") or [""])[0]
    return unquote(raw.replace("+", " ")) if raw else ""


def parse_table(html: str) -> list[dict]:
    """rowspan으로 묶인 칸을 펼쳐서 행마다 온전한 값을 갖게 만듭니다."""
    table = etree.HTML(html).xpath("//table")[0]
    trs = table.xpath(".//tr")
    grid: dict[tuple[int, int], tuple[str, list[str]]] = {}
    for r, tr in enumerate(trs):
        c = 0
        for cell in tr.xpath("./td|./th"):
            while (r, c) in grid:
                c += 1
            rowspan = int(cell.get("rowspan") or 1)
            colspan = int(cell.get("colspan") or 1)
            text = re.sub(r"\s+", " ", "".join(cell.itertext())).replace("\xa0", " ").strip()
            links = [a.get("href") for a in cell.xpath(".//a[@href]") if a.get("href")]
            for dr in range(rowspan):
                for dc in range(colspan):
                    grid[(r + dr, c + dc)] = (text, links)
            c += colspan

    width = max((key[1] for key in grid), default=-1) + 1
    rows = []
    for r in range(len(trs)):
        cells = [grid.get((r, c), ("", [])) for c in range(width)]
        rows.append({"cells": [x[0] for x in cells], "links": [x[1] for x in cells]})
    return rows


def attachments_of(row: dict, name: str) -> list[dict]:
    """이 전공의 과목이수표 링크만 골라 이름이 맞는 파일을 앞에 둡니다."""
    urls: list[str] = []
    for link in (unescape(u) for group in row["links"] for u in group):
        # PDF 뷰어로 감싼 링크(「IMC경영」)는 뷰어가 열어주는 원본이 실제 파일입니다.
        if "pdfviewer" in link:
            inner = parse_qs(urlparse(link).query).get("file")
            if inner:
                link = unquote(inner[0])
        if "login.do" in link or file_name_of(link) in IGNORED_FILE_NAMES:
            continue
        if link not in urls:
            urls.append(link)

    def loose(value: str) -> str:
        return re.sub(r"[\s·&()\[\]/,._-]|학$", "", re.sub(r"\(.*?\)", "", value))

    files = [{"url": u, "fileName": file_name_of(u)} for u in urls]
    files.sort(key=lambda f: 0 if loose(name) and loose(name) in loose(f["fileName"]) else 1)
    return files


def codes_in(text: str) -> list[str]:
    found: list[str] = []
    for match in CODE_PATTERN.finditer(text.upper()):
        code = match.group(1) + match.group(2)
        if len(code) == 7 and code not in found:
            found.append(code)
    return found


def read_xlsx(path: Path) -> list[str]:
    workbook = openpyxl.load_workbook(path, data_only=True)
    return [
        "" if cell is None else str(cell).strip()
        for sheet in workbook.worksheets
        for row in sheet.iter_rows(values_only=True)
        for cell in row
    ]


def read_hwp(path: Path) -> list[str]:
    """.hwp 첨부(「문화비평」·「뇌인지과학」)의 본문 글자만 뽑습니다."""
    ole = olefile.OleFileIO(path)
    compressed = bool(ole.openstream("FileHeader").read()[36] & 1)
    blobs = []
    for entry in ole.listdir():
        if entry[0] == "BodyText":
            data = ole.openstream(entry).read()
            if compressed:
                try:
                    data = zlib.decompress(data, -15)
                except zlib.error:
                    pass
            blobs.append(data)
    return [b"".join(blobs).decode("utf-16-le", errors="ignore")]


def main() -> int:
    page = fetch(SOURCE_URL, CACHE / "page.html")
    rows = parse_table(page.read_text(encoding="utf-8"))

    majors, seen = [], set()
    for row in rows[1:]:
        year, name, composition = row["cells"][0], row["cells"][1], row["cells"][2]
        if not name or (year, name) in seen:
            continue
        seen.add((year, name))

        files = attachments_of(row, name)
        codes: list[str] = []
        for index, entry in enumerate(files):
            path = fetch(entry["url"], CACHE / f"{len(majors):03d}_{index}.bin")
            kind = subprocess.run(["file", "-b", str(path)], capture_output=True, text=True).stdout
            if "Excel" in kind:
                target = path.with_suffix(".xlsx")
            elif "Hangul" in kind:
                target = path.with_suffix(".hwp")
            else:
                print(f"  건너뜀(형식 미상): {name} · {entry['fileName']}", file=sys.stderr)
                continue
            target.write_bytes(path.read_bytes())
            cells = read_xlsx(target) if target.suffix == ".xlsx" else read_hwp(target)
            for cell in cells:
                for code in codes_in(cell):
                    if code not in codes:
                        codes.append(code)

        majors.append(
            {
                "name": name,
                "approvedAt": year,
                "composition": composition,
                "codes": codes,
                "files": [f["fileName"] for f in files],
            }
        )

    without = [m for m in majors if not m["codes"]]
    payload = {
        "sourceUrl": SOURCE_URL,
        "majorCount": len(majors),
        "withCodes": len(majors) - len(without),
        "majors": majors,
    }
    TARGET.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"학생설계전공 {len(majors)}개 중 과목코드를 읽은 것 {len(majors) - len(without)}개 → {TARGET.name}")
    if without:
        # 과목코드 열이 생기기 전(1998~2006) 과목표는 과목명만 적혀 있어 코드를 만들 수 없습니다.
        print("과목코드가 없는 과목표(선택 목록에서 제외됨):")
        for major in without:
            print(f"  - {major['approvedAt']} {major['name']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

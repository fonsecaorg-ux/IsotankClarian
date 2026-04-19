#!/usr/bin/env python3
"""
Tabela da capa (primeira <w:tbl> com IDENTIFICA):
- Insere <w:noWrap/> após <w:tcW/> no primeiro <w:tc> de cada <w:tr> (evita IDENTIFICAÇÃ/O).
- Remove U+2060 (Word Joiner) do document.xml.

Backup: template/template.docx.backup_capa_nowrap_YYYYMMDD_HHMMSS

Uso (na raiz do repo): python scripts/fix-capa-nowrap.py
Ao final: node scripts/verify-template.js
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "template" / "template.docx"
DOC_XML = "word/document.xml"
WJ = "\u2060"


def is_w_tr_open_at(xml: str, i: int) -> bool:
    if not xml.startswith("<w:tr", i):
        return False
    j = i + len("<w:tr")
    return j < len(xml) and xml[j] in " >/"


def find_next_w_tr(xml: str, start: int) -> int:
    p = start
    while p < len(xml):
        j = xml.find("<w:tr", p)
        if j < 0:
            return -1
        if is_w_tr_open_at(xml, j):
            return j
        p = j + 5
    return -1


def extract_w_tr_block(xml: str, tr_start: int) -> tuple[int, str] | tuple[None, None]:
    if not is_w_tr_open_at(xml, tr_start):
        return None, None
    depth = 1
    i = xml.find(">", tr_start) + 1
    while True:
        c = xml.find("</w:tr>", i)
        if c < 0:
            return None, None
        o = find_next_w_tr(xml, i)
        if o != -1 and o < c:
            depth += 1
            i = xml.find(">", o) + 1
        else:
            depth -= 1
            if depth == 0:
                end = c + len("</w:tr>")
                return end, xml[tr_start:end]
            i = c + len("</w:tr>")


def is_w_tc_open_at(xml: str, i: int) -> bool:
    if not xml.startswith("<w:tc", i):
        return False
    j = i + len("<w:tc")
    return j < len(xml) and xml[j] in " >/"


def find_next_w_tc(xml: str, start: int) -> int:
    p = start
    while p < len(xml):
        j = xml.find("<w:tc", p)
        if j < 0:
            return -1
        if is_w_tc_open_at(xml, j):
            return j
        p = j + 5
    return -1


def extract_w_tc_block(xml: str, tc_start: int) -> tuple[int, str] | tuple[None, None]:
    if not is_w_tc_open_at(xml, tc_start):
        return None, None
    depth = 1
    i = xml.find(">", tc_start) + 1
    while True:
        c = xml.find("</w:tc>", i)
        if c < 0:
            return None, None
        o = find_next_w_tc(xml, i)
        if o != -1 and o < c:
            depth += 1
            i = xml.find(">", o) + 1
        else:
            depth -= 1
            if depth == 0:
                end = c + len("</w:tc>")
                return end, xml[tc_start:end]
            i = c + len("</w:tc>")


def patch_tcpr_nowrap(tcpr: str) -> str:
    if re.search(r"<w:noWrap\b", tcpr):
        return tcpr
    m_tcw = re.search(r"(<w:tcW\b[^>]*/>)", tcpr)
    if m_tcw:
        return tcpr[: m_tcw.end()] + "<w:noWrap/>" + tcpr[m_tcw.end() :]
    return re.sub(r"(<w:tcPr>)", r"\1<w:noWrap/>", tcpr, count=1)


def patch_first_cell_in_row(row_xml: str) -> str:
    tc0 = find_next_w_tc(row_xml, 0)
    if tc0 < 0:
        return row_xml
    end_tc, cell = extract_w_tc_block(row_xml, tc0)
    if cell is None:
        return row_xml
    m = re.search(r"<w:tcPr>[\s\S]*?</w:tcPr>", cell)
    if not m:
        return row_xml
    tcpr = m.group(0)
    new_tcpr = patch_tcpr_nowrap(tcpr)
    if new_tcpr == tcpr:
        return row_xml
    new_cell = cell[: m.start()] + new_tcpr + cell[m.end() :]
    return row_xml[:tc0] + new_cell + row_xml[end_tc:]


def patch_capa_table_rows(table_xml: str) -> str:
    out: list[str] = []
    last = 0
    pos = 0
    while True:
        tr_s = find_next_w_tr(table_xml, pos)
        if tr_s < 0:
            out.append(table_xml[last:])
            break
        out.append(table_xml[last:tr_s])
        tr_e, row = extract_w_tr_block(table_xml, tr_s)
        if row is None:
            out.append(table_xml[tr_s:])
            break
        out.append(patch_first_cell_in_row(row))
        last = tr_e
        pos = tr_e
    return "".join(out)


def is_w_tbl_open_at(xml: str, i: int) -> bool:
    """`<w:tbl` não confundir com tblPr / tblGrid / tblW / tblInd / tblBorders…"""
    if not xml.startswith("<w:tbl", i):
        return False
    j = i + len("<w:tbl")
    return j < len(xml) and xml[j] in " >/"


def find_next_w_tbl(xml: str, start: int) -> int:
    p = start
    while p < len(xml):
        j = xml.find("<w:tbl", p)
        if j < 0:
            return -1
        if is_w_tbl_open_at(xml, j):
            return j
        p = j + 5
    return -1


def extract_first_tbl_with_identifica(xml: str) -> tuple[int, int, str] | None:
    pos = 0
    while True:
        idx = find_next_w_tbl(xml, pos)
        if idx < 0:
            return None
        depth = 1
        i = xml.find(">", idx) + 1
        while True:
            o = find_next_w_tbl(xml, i)
            c = xml.find("</w:tbl>", i)
            if c < 0:
                return None
            if o != -1 and o < c:
                depth += 1
                i = xml.find(">", o) + 1
            else:
                depth -= 1
                if depth == 0:
                    end = c + len("</w:tbl>")
                    block = xml[idx:end]
                    if "IDENTIFICA" in block:
                        return idx, end, block
                    pos = end
                    break
                i = c + len("</w:tbl>")


def main() -> int:
    if not TEMPLATE.is_file():
        print("ERRO: não encontrado", TEMPLATE, file=sys.stderr)
        return 1

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = TEMPLATE.parent / f"template.docx.backup_capa_nowrap_{stamp}"
    shutil.copy2(TEMPLATE, backup)
    print("Backup:", backup)

    with zipfile.ZipFile(TEMPLATE, "r") as zin:
        try:
            xml = zin.read(DOC_XML).decode("utf-8")
        except KeyError:
            print("ERRO: zip sem", DOC_XML, file=sys.stderr)
            return 1
        other: list[tuple[str, bytes]] = []
        for info in zin.infolist():
            if info.filename == DOC_XML:
                continue
            other.append((info.filename, zin.read(info.filename)))

    span = extract_first_tbl_with_identifica(xml)
    if not span:
        print("ERRO: nenhuma tabela com IDENTIFICA encontrada.", file=sys.stderr)
        return 1
    s, e, tbl = span
    new_tbl = patch_capa_table_rows(tbl)
    xml2 = xml[:s] + new_tbl + xml[e:]
    xml3 = xml2.replace(WJ, "")

    with zipfile.ZipFile(TEMPLATE, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for name, data in other:
            zout.writestr(name, data)
        zout.writestr(DOC_XML, xml3.encode("utf-8"))

    print("template.docx atualizado (noWrap na capa + remoção U+2060).")

    verify = subprocess.run(
        ["node", str(ROOT / "scripts" / "verify-template.js")],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    sys.stdout.write(verify.stdout)
    sys.stderr.write(verify.stderr)
    if verify.returncode != 0:
        print("ERRO: verify-template.js falhou (código", verify.returncode, ")", file=sys.stderr)
        return verify.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""
6) Rodapé do laudo: dois blocos lado a lado (tabela 2 colunas).
   Esquerda: "Responsável pela Inspeção" + {encarregado_nome}
   Direita: "Engenheiro Responsável" + {engenheiro_nome} + {crea_info}

7) footer1.xml: campo NUMPAGES com fldChar separate (como PAGE), para total correto.

Uso: python scripts/fix_footer_two_column_and_numpages.py
"""
from __future__ import annotations

import re
import shutil
import sys
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / "template" / "template.docx"

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def q(tag: str) -> str:
    return f"{{{W}}}{tag}"


def _p_base() -> etree._Element:
    p = etree.Element(q("p"))
    ppr = etree.SubElement(p, q("pPr"))
    sp = etree.SubElement(ppr, q("spacing"))
    sp.set(q("after"), "0")
    rprp = etree.SubElement(ppr, q("rPr"))
    fonts = etree.SubElement(rprp, q("rFonts"))
    fonts.set(q("ascii"), "Arial")
    fonts.set(q("hAnsi"), "Arial")
    fonts.set(q("cs"), "Arial")
    return p


def _r_text(
    p: etree._Element,
    text: str,
    *,
    bold: bool = False,
    sz_half_points: str = "20",
) -> None:
    r = etree.SubElement(p, q("r"))
    rpr = etree.SubElement(r, q("rPr"))
    fonts = etree.SubElement(rpr, q("rFonts"))
    fonts.set(q("ascii"), "Arial")
    fonts.set(q("hAnsi"), "Arial")
    fonts.set(q("cs"), "Arial")
    if bold:
        etree.SubElement(rpr, q("b"))
        etree.SubElement(rpr, q("bCs"))
    if sz_half_points:
        sz = etree.SubElement(rpr, q("sz"))
        sz.set(q("val"), sz_half_points)
        szc = etree.SubElement(rpr, q("szCs"))
        szc.set(q("val"), sz_half_points)
    t = etree.SubElement(r, q("t"))
    if text and (text[0].isspace() or text[-1].isspace()):
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text


def _placeholder_p(placeholder: str) -> etree._Element:
    p = _p_base()
    _r_text(p, placeholder, bold=False)
    return p


def build_footer_signature_table() -> etree._Element:
    tbl = etree.Element(q("tbl"))
    tblpr = etree.SubElement(tbl, q("tblPr"))
    tw = etree.SubElement(tblpr, q("tblW"))
    tw.set(q("w"), "10315")
    tw.set(q("type"), "dxa")
    borders = etree.SubElement(tblpr, q("tblBorders"))
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = etree.SubElement(borders, q(side))
        b.set(q("val"), "none")
        b.set(q("sz"), "0")
        b.set(q("space"), "0")
        b.set(q("color"), "auto")
    look = etree.SubElement(tblpr, q("tblLook"))
    look.set(q("val"), "04A0")
    look.set(q("firstRow"), "1")
    look.set(q("lastRow"), "0")
    look.set(q("firstColumn"), "1")
    look.set(q("lastColumn"), "0")
    look.set(q("noHBand"), "0")
    look.set(q("noVBand"), "1")

    grid = etree.SubElement(tbl, q("tblGrid"))
    etree.SubElement(grid, q("gridCol")).set(q("w"), "5157")
    etree.SubElement(grid, q("gridCol")).set(q("w"), "5158")

    def add_tc(tr_el: etree._Element, width: int, inner_ps: list[etree._Element]) -> None:
        tc_el = etree.SubElement(tr_el, q("tc"))
        tcp = etree.SubElement(tc_el, q("tcPr"))
        tcw = etree.SubElement(tcp, q("tcW"))
        tcw.set(q("w"), str(width))
        tcw.set(q("type"), "dxa")
        val = etree.SubElement(tcp, q("vAlign"))
        val.set(q("val"), "top")
        for ip in inner_ps:
            tc_el.append(ip)

    # Linha 1 — títulos
    tr = etree.SubElement(tbl, q("tr"))
    trpr = etree.SubElement(tr, q("trPr"))
    etree.SubElement(trpr, q("trHeight")).set(q("val"), "340")
    p_l = _p_base()
    _r_text(p_l, "Responsável pela Inspeção", bold=True)
    p_r = _p_base()
    _r_text(p_r, "Engenheiro Responsável", bold=True)
    add_tc(tr, 5157, [p_l])
    add_tc(tr, 5158, [p_r])

    # Linha 2 — nomes
    tr = etree.SubElement(tbl, q("tr"))
    trpr = etree.SubElement(tr, q("trPr"))
    etree.SubElement(trpr, q("trHeight")).set(q("val"), "400")
    add_tc(tr, 5157, [_placeholder_p("{encarregado_nome}")])
    add_tc(tr, 5158, [_placeholder_p("{engenheiro_nome}")])

    # Linha 3 — CREA à direita
    tr = etree.SubElement(tbl, q("tr"))
    trpr = etree.SubElement(tr, q("trPr"))
    etree.SubElement(trpr, q("trHeight")).set(q("val"), "360")
    p_empty = _p_base()
    _r_text(p_empty, "")
    p_crea = _p_base()
    _r_text(p_crea, "{crea_info}", bold=True)
    add_tc(tr, 5157, [p_empty])
    add_tc(tr, 5158, [p_crea])

    return tbl


def _paragraph_full_text(p: etree._Element) -> str:
    return "".join(p.xpath(".//w:t/text()", namespaces={"w": W}))


def replace_footer_block_in_document(root: etree._Element) -> bool:
    body = root.find(q("body"))
    if body is None:
        return False
    children = list(body)
    start = None
    for i, el in enumerate(children):
        if etree.QName(el).localname != "p":
            continue
        t = _paragraph_full_text(el)
        if "Engenheiro" in t and "Inspe" in t and "Respons" in t:
            start = i
            break
    if start is None or start + 5 >= len(children):
        return False
    for j in range(1, 5):
        if etree.QName(children[start + j]).localname != "p":
            return False
    t1 = _paragraph_full_text(children[start + 1])
    t2 = _paragraph_full_text(children[start + 2])
    t3 = _paragraph_full_text(children[start + 3])
    if "{encarregado_nome}" not in t1 or "{engenheiro_nome}" not in t2 or "{crea_info}" not in t3:
        return False
    if "{cidade_data}" not in _paragraph_full_text(children[start + 5]):
        return False

    tbl = build_footer_signature_table()
    for j in range(start + 4, start - 1, -1):
        body.remove(children[j])
    body.insert(start, tbl)
    return True


def fix_numpages_in_footer_xml(xml_bytes: bytes) -> bytes:
    s = xml_bytes.decode("utf-8")
    # Inserir separate entre instrText NUMPAGES e <w:t>dígito</w:t> antes do end
    pat = re.compile(
        r"(<w:instrText(?:\s[^>]*)?>\s*NUMPAGES\s*</w:instrText></w:r>)"
        r'(<w:r[^>]*>\s*<w:t[^>]*>)(\d)(</w:t></w:r>\s*<w:r[^>]*>\s*<w:fldChar\s+w:fldCharType="end"\s*/>)',
        re.DOTALL,
    )

    def repl(m: re.Match[str]) -> str:
        return (
            m.group(1)
            + '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
            + m.group(2)
            + "1"
            + m.group(4)
        )

    ns, n = pat.subn(repl, s, count=1)
    if n:
        return ns.encode("utf-8")
    return xml_bytes


def main() -> int:
    if not DOCX.is_file():
        print("ERRO:", DOCX, file=sys.stderr)
        return 1
    tmp = DOCX.with_suffix(".docx.tmp2")
    shutil.copy2(DOCX, tmp)
    with zipfile.ZipFile(tmp, "r") as zin:
        names = list(zin.namelist())
        parts = {n: zin.read(n) for n in names}

    parser = etree.XMLParser(remove_blank_text=False, huge_tree=True)
    doc_root = etree.fromstring(parts["word/document.xml"], parser)
    if not replace_footer_block_in_document(doc_root):
        print("ERRO: bloco do rodapé não encontrado em document.xml", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return 1
    parts["word/document.xml"] = etree.tostring(
        doc_root,
        encoding="utf-8",
        xml_declaration=True,
        standalone=True,
    )

    if "word/footer1.xml" in parts:
        parts["word/footer1.xml"] = fix_numpages_in_footer_xml(parts["word/footer1.xml"])

    with zipfile.ZipFile(DOCX, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, parts[n])
    tmp.unlink(missing_ok=True)

    with zipfile.ZipFile(DOCX, "r") as z:
        foot = z.read("word/footer1.xml").decode("utf-8")
        doc = z.read("word/document.xml").decode("utf-8")
    ok_sep = "NUMPAGES" in foot and "NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType=\"separate\"" in foot
    print("OK footer NUMPAGES estruturado:", ok_sep)
    print("OK document com w:tbl no rodapé:", "<w:tbl>" in doc)
    print("Atualizado:", DOCX)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

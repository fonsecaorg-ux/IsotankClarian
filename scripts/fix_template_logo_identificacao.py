"""
Ajustes em template/template.docx:
1) Restaura word/media/image13.png a partir do backup (logo CEINSPEC no header).
2) Evita quebra em IDENTIFICAÇÃO (WORD JOINER entre Ã e O nos w:t).
3) Parágrafo com {recomendacao}: adiciona <w:keepLines/> em w:pPr (evita corte entre páginas).

Usa zipfile + lxml.

Executar na raiz do projeto: python scripts/fix_template_logo_identificacao.py

Rodapé 2 colunas + NUMPAGES: python scripts/fix_footer_two_column_and_numpages.py
"""
from __future__ import annotations

import shutil
import sys
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / "template" / "template.docx"
BACKUP = ROOT / "template" / "template.docx.backup_layout_safe"

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W_MAIN = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

WORD = "IDENTIFICAÇÃO"
WORD_FIXED = "IDENTIFICAÇÃ\u2060O"


def _q(local: str) -> str:
    return f"{{{W_MAIN}}}{local}"


def patch_document_xml(xml_bytes: bytes) -> bytes:
    parser = etree.XMLParser(remove_blank_text=False, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser)

    changed_wj = 0
    for t in root.xpath(".//w:t", namespaces=NS):
        if t.text and WORD in t.text:
            t.text = t.text.replace(WORD, WORD_FIXED)
            changed_wj += 1
    if changed_wj == 0 and "\u2060" not in etree.tostring(root, encoding="unicode"):
        raise ValueError(f"Nenhum w:t com {WORD!r} encontrado (e sem WJ já aplicado)")

    for p in root.xpath(".//w:p", namespaces=NS):
        texts = "".join(p.xpath(".//w:t/text()", namespaces=NS))
        if "{recomendacao}" not in texts:
            continue
        p_pr = p.find(_q("pPr"))
        if p_pr is None:
            p_pr = etree.Element(_q("pPr"))
            p.insert(0, p_pr)
        if p_pr.find(_q("keepLines")) is None:
            kl = etree.Element(_q("keepLines"))
            p_pr.insert(0, kl)
        break

    return etree.tostring(
        root,
        encoding="utf-8",
        xml_declaration=True,
        standalone=True,
    )


def main() -> int:
    if not DOCX.is_file():
        print("ERRO: não encontrado", DOCX, file=sys.stderr)
        return 1
    if not BACKUP.is_file():
        print("ERRO: backup não encontrado", BACKUP, file=sys.stderr)
        return 1

    with zipfile.ZipFile(BACKUP, "r") as zin:
        logo = zin.read("word/media/image13.png")
    if len(logo) < 1000:
        print("ERRO: backup image13.png muito pequeno", len(logo), file=sys.stderr)
        return 1

    tmp = DOCX.with_suffix(".docx.tmp")
    shutil.copy2(DOCX, tmp)

    with zipfile.ZipFile(tmp, "r") as zin:
        names = zin.namelist()
        parts = {n: zin.read(n) for n in names}

    rels = parts.get("word/_rels/header1.xml.rels", b"").decode("utf-8")
    if "image13.png" not in rels:
        print("AVISO: header1.xml.rels não referencia image13.png", file=sys.stderr)
    if "word/media/image13.png" not in parts:
        print("ERRO: template sem word/media/image13.png", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return 1

    parts["word/media/image13.png"] = logo
    # Slots de assinatura (rId22/rId23 → image11/12): garantir ficheiros no zip para o Word não mostrar "Não foi possível".
    if "word/media/image11.png" not in parts or len(parts.get("word/media/image11.png", b"")) < 32:
        base = parts.get("word/media/image1.png") or parts.get("word/media/image2.png")
        if not base:
            print("ERRO: sem image1/2 para clonar placeholder de assinatura", file=sys.stderr)
            tmp.unlink(missing_ok=True)
            return 1
        parts["word/media/image11.png"] = base
        parts["word/media/image12.png"] = base
        for extra in ("word/media/image11.png", "word/media/image12.png"):
            if extra not in names:
                names.append(extra)
    parts["word/document.xml"] = patch_document_xml(parts["word/document.xml"])

    with zipfile.ZipFile(DOCX, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, parts[n])

    tmp.unlink(missing_ok=True)

    with zipfile.ZipFile(DOCX, "r") as z:
        sz = z.getinfo("word/media/image13.png").file_size
        rel = z.read("word/_rels/header1.xml.rels").decode("utf-8")
        doc = z.read("word/document.xml").decode("utf-8")
    print("OK image13.png bytes:", sz)
    print("OK header1.xml.rels contém image13:", "image13.png" in rel)
    print("OK document.xml contém WJ:", "\u2060" in doc)
    print("OK document.xml keepLines na recomendação:", "<w:keepLines" in doc and "{recomendacao}" in doc)
    print("Template atualizado:", DOCX)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

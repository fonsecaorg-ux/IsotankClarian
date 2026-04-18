"""
Corrige template/template.docx:
1) Restaura word/media/image13.png a partir do backup (logo no header quebrado/pequeno).
2) Evita quebra entre Ã e O em IDENTIFICAÇÃO (insere WORD JOINER U+2060 nos nós w:t).

Usa zipfile + lxml (sem regravar o pacote inteiro de forma insegura no XML).

Executar na raiz do projeto: python scripts/fix_template_logo_identificacao.py
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
WORD = "IDENTIFICAÇÃO"
WORD_FIXED = "IDENTIFICAÇÃ\u2060O"


def patch_document_xml(xml_bytes: bytes) -> bytes:
    parser = etree.XMLParser(remove_blank_text=False, huge_tree=True)
    root = etree.fromstring(xml_bytes, parser)
    changed = 0
    for t in root.xpath(".//w:t", namespaces=NS):
        if t.text and WORD in t.text:
            t.text = t.text.replace(WORD, WORD_FIXED)
            changed += 1
    if changed == 0 and "\u2060" not in etree.tostring(root, encoding="unicode"):
        raise ValueError(f"Nenhum w:t com {WORD!r} encontrado (e sem WJ já aplicado)")
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
    print("Template atualizado:", DOCX)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

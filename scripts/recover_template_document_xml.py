"""Tenta reparar word/document.xml com parser recover (lxml) e grava no template.docx."""
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "template" / "template.docx"


def main() -> None:
    with zipfile.ZipFile(TEMPLATE, "r") as zin:
        names = zin.namelist()
        parts = {n: zin.read(n) for n in names}

    raw = parts["word/document.xml"]
    parser = etree.XMLParser(recover=True, huge_tree=True)
    tree = etree.fromstring(raw, parser)
    fixed = etree.tostring(
        tree,
        encoding="utf-8",
        xml_declaration=True,
        standalone=True,
    )
    parts["word/document.xml"] = fixed

    with zipfile.ZipFile(TEMPLATE, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, parts[n])
    print("Gravado document.xml recuperado em", TEMPLATE)


if __name__ == "__main__":
    main()

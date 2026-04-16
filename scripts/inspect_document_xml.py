"""Inspeciona word/document.xml de um .docx (encoding, primeiros bytes, parse Expat)."""
import sys
import zipfile
import xml.parsers.expat
from pathlib import Path


def main(p: Path) -> int:
    z = zipfile.ZipFile(p)
    raw = z.read("word/document.xml")
    print("Tamanho document.xml:", len(raw))
    print("Primeiros 120 bytes (repr):", raw[:120])
    # tenta utf-8
    try:
        s = raw.decode("utf-8")
        print("Primeiras 3 linhas (texto):")
        for i, line in enumerate(s.splitlines()[:3], 1):
            print(f"  L{i}: {line[:200]}")
    except UnicodeDecodeError as e:
        print("UTF-8 decode erro:", e)
        return 1

    parser = xml.parsers.expat.ParserCreate(encoding="utf-8")
    try:
        parser.Parse(raw, True)
        print("Expat: document.xml OK")
    except xml.parsers.expat.ExpatError as e:
        print("Expat ERRO:", e)
        return 1
    return 0


def count_wp(path: Path) -> None:
    import re

    z = zipfile.ZipFile(path)
    raw = z.read("word/document.xml").decode("utf-8")
    opens = len(re.findall(r"<w:p\b", raw))
    closes = raw.count("</w:p>")
    print(f"{path.name}: <w:p opens={opens} </w:p> closes={closes} diff={opens - closes}")


if __name__ == "__main__":
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("LAUDO_SUTU_464848.docx")
    p = p.resolve()
    count_wp(p)
    sys.exit(main(p))

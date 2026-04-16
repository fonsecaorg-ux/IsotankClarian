"""Lista xmlns com chaves { } no document.xml (inválido para XML 1.0)."""
import re
import sys
import zipfile
from pathlib import Path


def main(docx: Path) -> int:
    z = zipfile.ZipFile(docx)
    d = z.read("word/document.xml").decode("utf-8", errors="replace")
    bad = re.findall(r'xmlns[^=]*="[^"]*\{[^"]+\}[^"]*"', d)
    print(f"{docx.name}: xmlns com {{}}: {len(bad)}")
    for s in bad[:20]:
        print(" ", s[:200])
    return 1 if bad else 0


if __name__ == "__main__":
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("template/template.docx")
    raise SystemExit(main(p.resolve()))

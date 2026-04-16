"""
Repara xmlns inválidos em word/document.xml quando '2018' foi trocado por '{ano_fabricacao}'
dentro de URIs do Office (erro típico de replace global).
"""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "template" / "template.docx"

BAD_GOOD = [
    (
        "http://schemas.microsoft.com/office/word/{ano_fabricacao}/wordml/cex",
        "http://schemas.microsoft.com/office/word/2018/wordml/cex",
    ),
    (
        "http://schemas.microsoft.com/office/word/{ano_fabricacao}/wordml",
        "http://schemas.microsoft.com/office/word/2018/wordml",
    ),
]


def main() -> None:
    with zipfile.ZipFile(TEMPLATE, "r") as zin:
        names = zin.namelist()
        parts = {n: zin.read(n) for n in names}

    xml = parts["word/document.xml"].decode("utf-8", errors="strict")
    orig = xml
    for bad, good in BAD_GOOD:
        xml = xml.replace(bad, good)
    if xml == orig:
        print("Nada a corrigir (já está OK ou padrão diferente).")
        return

    parts["word/document.xml"] = xml.encode("utf-8")
    with zipfile.ZipFile(TEMPLATE, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, parts[n])
    print("Corrigido:", TEMPLATE)


if __name__ == "__main__":
    main()

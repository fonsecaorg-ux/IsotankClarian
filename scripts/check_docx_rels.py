"""Verifica se r:embed / r:id em word/document.xml têm Relationship e ficheiro no zip."""
import re
import sys
import zipfile
from pathlib import Path


def main(docx_path: Path) -> int:
    z = zipfile.ZipFile(docx_path)
    names = set(z.namelist())
    doc = z.read("word/document.xml").decode("utf-8", errors="replace")
    rels = z.read("word/_rels/document.xml.rels").decode("utf-8", errors="replace")

    targets = {}
    for m in re.finditer(r"<Relationship\s+([^>]+)/>", rels):
        a = m.group(1)
        im = re.search(r'Id="(rId\d+)"', a)
        tm = re.search(r'Target="([^"]+)"', a)
        if im and tm:
            targets[im.group(1)] = tm.group(1)

    embeds = set(re.findall(r'r:embed="(rId\d+)"', doc))
    rids = set(re.findall(r'r:id="(rId\d+)"', doc))
    allr = embeds | rids

    print(f"{docx_path.name}: relationships={len(targets)} r:embed={len(embeds)} r:id={len(rids)}")

    missing_rel = sorted(r for r in allr if r not in targets)
    if missing_rel:
        print("ERRO: refs no document sem Relationship:", missing_rel[:30], f"... (+{len(missing_rel)-30})" if len(missing_rel) > 30 else "")

    def part_path(target: str) -> str:
        t = target.replace("\\", "/")
        if t.startswith("../"):
            inner = t[3:]
            if inner.startswith("media/"):
                return "word/" + inner
            return inner
        if t.startswith("media/"):
            return "word/" + t
        return "word/" + t

    missing_files = []
    for rid, tgt in targets.items():
        part = part_path(tgt)
        if part not in names:
            missing_files.append((rid, tgt, part))

    if missing_files:
        print("ERRO: Relationship aponta para ficheiro ausente no zip:")
        for row in missing_files[:25]:
            print(" ", row)
        if len(missing_files) > 25:
            print(f"  ... total {len(missing_files)}")

    try:
        import xml.etree.ElementTree as ET

        ET.fromstring(doc.encode("utf-8"))
        print("document.xml: parse XML OK (ElementTree)")
    except ET.ParseError as e:
        print("AVISO: ElementTree não parseou document.xml:", e)

    return 1 if (missing_rel or missing_files) else 0


if __name__ == "__main__":
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "template" / "template.docx"
    sys.exit(main(p))

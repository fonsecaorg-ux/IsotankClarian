import re
import zipfile
from pathlib import Path


TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "template" / "template.docx"


def main():
  with zipfile.ZipFile(TEMPLATE_PATH, "r") as zf:
    files = {name: zf.read(name) for name in zf.namelist()}

  rels_path = "word/_rels/document.xml.rels"
  doc_path = "word/document.xml"

  rels = files[rels_path].decode("utf-8")
  rels = rels.replace('Id="rId22" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image11.png"',
                      'Id="rId22" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/assinatura_inspetor.png"')
  rels = rels.replace('Id="rId23" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image12.png"',
                      'Id="rId23" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/assinatura_engenheiro.png"')
  files[rels_path] = rels.encode("utf-8")

  doc = files[doc_path].decode("utf-8")
  # No layout atual há 2 assinaturas apontando para rId22.
  # Mantém a primeira como inspetor e troca a segunda para engenheiro (rId23).
  matches = list(re.finditer(r'r:embed="rId22"', doc))
  if len(matches) >= 2:
    second = matches[1]
    doc = doc[:second.start()] + 'r:embed="rId23"' + doc[second.end():]
  files[doc_path] = doc.encode("utf-8")

  # Garante placeholders com os nomes novos (fallback em branco caso sem assinatura).
  if "word/media/assinatura_inspetor.png" not in files and "word/media/image11.png" in files:
    files["word/media/assinatura_inspetor.png"] = files["word/media/image11.png"]
  if "word/media/assinatura_engenheiro.png" not in files and "word/media/image12.png" in files:
    files["word/media/assinatura_engenheiro.png"] = files["word/media/image12.png"]

  with zipfile.ZipFile(TEMPLATE_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for name, content in files.items():
      zf.writestr(name, content)

  print(f"Template atualizado com slots de assinatura: {TEMPLATE_PATH}")


if __name__ == "__main__":
  main()

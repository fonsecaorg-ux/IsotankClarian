import re
import zipfile
from pathlib import Path


TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "template" / "template.docx"


def _replace_paragraph(xml_text: str, predicate, tag: str):
  replaced = 0

  def repl(match):
    nonlocal replaced
    paragraph = match.group(0)
    texts = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", paragraph)
    full = re.sub(r"\s+", " ", "".join(texts)).strip()
    if not predicate(full):
      return paragraph

    replaced += 1
    ppr_match = re.search(r"<w:pPr>[\s\S]*?</w:pPr>", paragraph)
    ppr = ppr_match.group(0) if ppr_match else ""
    rpr_match = re.search(r"<w:rPr>[\s\S]*?</w:rPr>", paragraph)
    rpr = rpr_match.group(0) if rpr_match else ""
    return f"<w:p>{ppr}<w:r>{rpr}<w:t>{tag}</w:t></w:r></w:p>"

  pattern = re.compile(r"<w:p(?:\s[^>]*)?>[\s\S]*?</w:p>")
  return pattern.sub(repl, xml_text), replaced


def main():
  with zipfile.ZipFile(TEMPLATE_PATH, "r") as zf:
    files = {name: zf.read(name) for name in zf.namelist()}

  xml = files["word/document.xml"].decode("utf-8")
  changes = []

  xml, count = _replace_paragraph(xml, lambda t: "Elton Vieira" in t, "{encarregado_nome}")
  changes.append(("Elton Vieira", count))

  xml, count = _replace_paragraph(xml, lambda t: "Diego Aparecido de Lima" in t, "{engenheiro_nome}")
  changes.append(("Diego Aparecido de Lima", count))

  xml, count = _replace_paragraph(xml, lambda t: "CREA:506.927.6941-S" in t, "{crea_info}")
  changes.append(("CREA:506.927.6941-S", count))

  xml, count = _replace_paragraph(
    xml,
    lambda t: "Cubatão" in t and "17 de Março de 2026" in t,
    "{cidade_data}",
  )
  changes.append(("Cubatão, 17 de Março de 2026", count))

  # Se o template não tiver mais o texto do engenheiro fixo,
  # garante explicitamente a tag {engenheiro_nome} antes de {crea_info}.
  if "{engenheiro_nome}" not in xml and "{crea_info}" in xml:
    pattern = re.compile(r"(<w:p(?:\s[^>]*)?>[\s\S]*?<w:t>\{crea_info\}</w:t>[\s\S]*?</w:p>)", re.M)
    m = pattern.search(xml)
    if m:
      paragraph = m.group(1)
      new_paragraph = re.sub(r"\{crea_info\}", "{engenheiro_nome}", paragraph)
      xml = xml[:m.start()] + new_paragraph + xml[m.start():]
      changes.append(("{engenheiro_nome} inserido antes de {crea_info}", 1))
    else:
      changes.append(("{engenheiro_nome} inserido antes de {crea_info}", 0))

  files["word/document.xml"] = xml.encode("utf-8")

  with zipfile.ZipFile(TEMPLATE_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for name, content in files.items():
      zf.writestr(name, content)

  for label, count in changes:
    print(f"{label}: {count} substituição(ões)")
  print(f"Template atualizado: {TEMPLATE_PATH}")


if __name__ == "__main__":
  main()

import re
import zipfile
from pathlib import Path


TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "template" / "template.docx"


UNIQUE_REPLACEMENTS = [
    ("SUTU 258026-0", "{numero_identificacao}"),
    ("CLARIANT BRASIL LTDA", "{cliente}"),
    ("Av. Jorge Bei Maluf, 2163 - Jardim Lazzareschi, Suzano  -  SP", "{endereco}"),
    ("17/03/2026", "{data_inspecao}"),
    ("CIMC", "{fabricante}"),
    ("NCTE18T 15447", "{numero_serie}"),
    ("CHINA", "{pais_fabricacao}"),
    ("20FT", "{tamanho}"),
    ("25000 L", "{capacidade_liquida}"),
    ("2018", "{ano_fabricacao}"),
    ("SUTU", "{identificacao}"),
    ("3760 kg", "{tara}"),
    ("32240 kg", "{peso_carga_liquida}"),
    ("36000 kg", "{peso_bruto_total}"),
    ("192000 Kg", "{peso_empilhamento}"),
    ("ASME SECT. VIII DIV. 1(NCS)", "{norma_fabricacao}"),
    ("6 bar", "{pressao_ensaio}"),
    ("- 40°C à 150°C", "{temperatura_projeto}"),
    ("6 mm", "{espessura}"),
    ("3 Pol", "{conexoes_flange}"),
]

MULTI_REPLACEMENTS = {
    "4 bar": ["{pressao_projeto}", "{pressao_maxima}"],
    "AWS316L": ["{material_calota}", "{material_costado}"],
    "A": [None, "{exame_visual_externo}"],
    "NA": [None, "{exame_visual_interno}", "{estanqueidade}", "{sistema_descarga_exame}", "{valvulas_conexoes_exame}"],
    "APROVADO": [
        "{chapa_identificacao}",
        "{estrutura_externa}",
        "{corpo_tanque}",
        "{passadicos}",
        "{revestimento}",
        "{escada}",
        "{dispositivos_canto}",
        "{ponto_aterramento}",
        "{fixacoes}",
        "{bercos_fixacao}",
        "{mossas_escavacoes}",
        "{porosidade}",
        "{bocal_descarga}",
        "{boca_visita}",
        "{linha_ar}",
        "{acionamento_remoto}",
        "{tomada_saida_vapor}",
        "{sistema_carga_descarga}",
        "{tomada_entrada_vapor}",
        "{termometro_comp}",
        "{tubulacoes}",
        "{estrutura_visual}",
    ],
    "N/A": [
        "{cert_calibracao}",
        "{cert_descontaminacao}",
        "{isolamento_termico}",
        "{valvula_alivio}",
        "{linha_recuperacao}",
        "{dispositivo_medicao}",
        "{valvula_fundo}",
        "{manometro}",
    ],
}


def get_cell_text(cell_content: str) -> str:
    return "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", cell_content)).strip()


def normalize_text(value: str) -> str:
    return (
        value.replace("–", "-")
        .replace("—", "-")
        .replace("�", "-")
        .replace("  ", " ")
        .strip()
    )


def build_replaced_cell(cell_content: str, new_text: str) -> str:
    tc_pr = re.search(r"<w:tcPr>[\s\S]*?</w:tcPr>", cell_content)
    p_pr = re.search(r"<w:pPr>[\s\S]*?</w:pPr>", cell_content)
    r_pr = re.search(r"<w:rPr>[\s\S]*?</w:rPr>", cell_content)
    return (
        "<w:tc>"
        f"{tc_pr.group(0) if tc_pr else ''}"
        "<w:p>"
        f"{p_pr.group(0) if p_pr else ''}"
        "<w:r>"
        f"{r_pr.group(0) if r_pr else ''}"
        f"<w:t>{new_text}</w:t>"
        "</w:r></w:p></w:tc>"
    )


def replace_simple_cells(xml: str, replacements):
    pattern = re.compile(r"<w:tc>[\s\S]*?</w:tc>")

    def repl(match):
        cell_xml = match.group(0)
        inner_start = cell_xml.find(">") + 1
        cell_content = cell_xml[inner_start:-8]
        full_text = get_cell_text(cell_content)
        normalized = normalize_text(full_text)
        for src, tag in replacements:
            if normalized == normalize_text(src):
                return build_replaced_cell(cell_content, tag)
        return cell_xml

    return pattern.sub(repl, xml)


def tc_open_token_len(xml: str, pos: int) -> int:
    if not xml.startswith("<w:tc", pos):
        return 0
    boundary = xml[pos + 5] if pos + 5 < len(xml) else ""
    if boundary and boundary.isalpha():
        return 0
    gt = xml.find(">", pos)
    return 0 if gt == -1 else gt - pos + 1


def replace_table_cells(xml: str) -> str:
    counters = {}
    out = []
    i = 0
    while i < len(xml):
      open_idx = xml.find("<w:tc", i)
      while open_idx != -1 and tc_open_token_len(xml, open_idx) == 0:
          open_idx = xml.find("<w:tc", open_idx + 1)
      if open_idx == -1:
          out.append(xml[i:])
          break

      out.append(xml[i:open_idx])
      depth = 0
      j = open_idx
      while j < len(xml):
          open_len = tc_open_token_len(xml, j)
          if open_len > 0:
              depth += 1
              j += open_len
              continue
          if xml.startswith("</w:tc>", j):
              depth -= 1
              end = j + 8
              if depth == 0:
                  cell_xml = xml[open_idx:end]
                  inner_start = cell_xml.find(">") + 1
                  cell_content = cell_xml[inner_start:-8]
                  full_text = get_cell_text(cell_content)
                  replaced = cell_xml

                  if full_text:
                      normalized_text = normalize_text(full_text)
                      for src, tag in UNIQUE_REPLACEMENTS:
                          if normalized_text == normalize_text(src):
                              replaced = build_replaced_cell(cell_content, tag)
                              break
                      else:
                          if normalized_text in {normalize_text(k): k for k in MULTI_REPLACEMENTS}:
                              original_key = {normalize_text(k): k for k in MULTI_REPLACEMENTS}[normalized_text]
                              tags = MULTI_REPLACEMENTS[original_key]
                              counters[original_key] = counters.get(original_key, 0) + 1
                              idx = counters[original_key] - 1
                              if idx < len(tags) and tags[idx] is not None:
                                  replaced = build_replaced_cell(cell_content, tags[idx])
                  out.append(replaced)
                  i = end
                  break
              j += 8
              continue
          j += 1

      if j >= len(xml) and depth != 0:
          out.append(xml[open_idx:])
          break
    return "".join(out)


def replace_paragraph_containing(xml: str, search_text: str, new_tag: str) -> str:
    pattern = re.compile(r"<w:p(?:\s[^>]*)?>[\s\S]*?</w:p>")

    def repl(match):
        paragraph = match.group(0)
        full = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", paragraph)).strip()
        if search_text not in full:
            return paragraph
        p_pr = re.search(r"<w:pPr>[\s\S]*?</w:pPr>", paragraph)
        r_pr = re.search(r"<w:rPr>[\s\S]*?</w:rPr>", paragraph)
        return f"<w:p>{p_pr.group(0) if p_pr else ''}<w:r>{r_pr.group(0) if r_pr else ''}<w:t>{new_tag}</w:t></w:r></w:p>"

    return pattern.sub(repl, xml)


def main():
    with zipfile.ZipFile(TEMPLATE_PATH, "r") as zf:
        files = {name: zf.read(name) for name in zf.namelist()}

    xml = files["word/document.xml"].decode("utf-8", errors="ignore")

    xml = replace_table_cells(xml)
    xml = replace_simple_cells(xml, UNIQUE_REPLACEMENTS)
    xml = replace_paragraph_containing(xml, "A inspeção visual externa realizada", "{conclusao}")
    xml = replace_paragraph_containing(xml, "Ressalta-se, contudo", "")
    xml = replace_paragraph_containing(xml, "A presente inspeção possui caráter exclusivamente visual", "{recomendacao}")
    xml = replace_paragraph_containing(xml, "Recomenda-se que o equipamento", "")
    xml = replace_paragraph_containing(xml, "Elton Vieira", "{encarregado_nome}")
    xml = replace_paragraph_containing(xml, "Diego Aparecido de Lima", "{engenheiro_nome}")
    xml = replace_paragraph_containing(xml, "CREA:506.927.6941-S", "{crea_info}")
    xml = replace_paragraph_containing(xml, "Cubatão, 17 de Março de 2026", "{cidade_data}")

    # Não substituir "2018" globalmente: a primeira ocorrência pode estar em xmlns:w16
    # (…/word/2018/wordml) e quebraria o XML. O ano de fabricação já é tratado nas células.
    direct_unique = [
        ("17/03/2026", "{data_inspecao}"),
        ("CIMC", "{fabricante}"),
        ("NCTE18T 15447", "{numero_serie}"),
        ("CHINA", "{pais_fabricacao}"),
        ("25000 L", "{capacidade_liquida}"),
        ("SUTU 258026-0", "{numero_identificacao}"),
    ]
    for src, tag in direct_unique:
        if src in xml:
            xml = xml.replace(src, tag, 1)

    files["word/document.xml"] = xml.encode("utf-8")

    with zipfile.ZipFile(TEMPLATE_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)

    tags = re.findall(r"\{(\w+)\}", xml)
    print(sorted(set(tags)))


if __name__ == "__main__":
    main()

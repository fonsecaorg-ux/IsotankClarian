"""
Reconstrói template/template.docx a partir do laudo original, preservando layout.
Aplica placeholders apenas em nós de texto (w:t), sem remontar blocos XML.
"""
import zipfile
from pathlib import Path
from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "LAUDO ESTRUTURAL_ISOTANK_SUTU258026-0.docx"
DEST = ROOT / "template" / "template.docx"

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

UNIQUE_REPLACEMENTS = [
    ("SUTU 258026-0", "{numero_identificacao}"),
    ("CLARIANT BRASIL LTDA", "{cliente}"),
    ("Av. Jorge Bei Maluf, 2163 - Jardim Lazzareschi, Suzano – SP", "{endereco}"),
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

PARAGRAPH_CONTAINS = [
    ("A inspeção visual externa realizada", "{conclusao}"),
    ("Ressalta-se, contudo", ""),
    ("A presente inspeção possui caráter exclusivamente visual", "{recomendacao}"),
    ("Recomenda-se que o equipamento", ""),
    ("Elton Vieira", "{encarregado_nome}"),
    ("Diego Aparecido de Lima", "{engenheiro_nome}"),
    ("CREA:506.927.6941-S", "{crea_info}"),
    ("Cubatão, 17 de Março de 2026", "{cidade_data}"),
]


def normalize(text: str) -> str:
    return (
        text.replace("�", "–")
        .replace("—", "–")
        .replace("  ", " ")
        .strip()
    )


def get_text(node) -> str:
    texts = node.xpath(".//w:t/text()", namespaces=NS)
    return normalize("".join(texts))


def set_text(node, value: str) -> None:
    runs = node.xpath(".//w:t", namespaces=NS)
    if not runs:
        return
    runs[0].text = value
    for r in runs[1:]:
        r.text = ""


def main() -> None:
    with zipfile.ZipFile(SRC, "r") as zin:
        names = zin.namelist()
        parts = {n: zin.read(n) for n in names}

    parser = etree.XMLParser(remove_blank_text=False)
    root = etree.fromstring(parts["word/document.xml"], parser)

    counters = {}
    unique_map = {normalize(src): tag for src, tag in UNIQUE_REPLACEMENTS}

    # Trocas em células de tabela.
    for tc in root.xpath(".//w:tc", namespaces=NS):
        t = get_text(tc)
        if not t:
            continue
        if t in unique_map:
            set_text(tc, unique_map[t])
            continue
        if t in MULTI_REPLACEMENTS:
            arr = MULTI_REPLACEMENTS[t]
            idx = counters.get(t, 0)
            counters[t] = idx + 1
            if idx < len(arr) and arr[idx] is not None:
                set_text(tc, arr[idx])

    # Trocas em parágrafos livres.
    for p in root.xpath(".//w:p", namespaces=NS):
        pt = get_text(p)
        if not pt:
            continue
        for needle, new_text in PARAGRAPH_CONTAINS:
            if normalize(needle) in pt:
                set_text(p, new_text)
                break

    parts["word/document.xml"] = etree.tostring(
        root,
        encoding="utf-8",
        xml_declaration=True,
        standalone=True,
    )

    with zipfile.ZipFile(DEST, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, parts[n])

    print("Template reconstruído:", DEST)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Verificar quais imagens estão sendo referenciadas no template.docx
"""

import zipfile
import re

template_path = 'template/template.docx'

with zipfile.ZipFile(template_path, 'r') as z:
    # Ler document.xml
    doc_xml = z.read('word/document.xml').decode('utf-8')
    
    # Procurar por referências a imagens
    print("Verificando referências de imagens no template:\n")
    
    # Procurar por rId (relationship IDs que apontam para imagens)
    image_refs = re.findall(r'embed="rId(\d+)"', doc_xml)
    print(f"Encontradas {len(image_refs)} referências a imagens (rId)")
    print(f"rIds encontrados: {set(image_refs)}\n")
    
    # Procurar por blips que indicam imagens
    blips = re.findall(r'<a:blip[^>]*r:embed="([^"]*)"', doc_xml)
    print(f"Blips encontrados: {len(blips)}")
    for i, blip in enumerate(blips, 1):
        print(f"  {i}. {blip}")
    
    # Agora verificar em document.xml.rels qual rId aponta para qual imagem
    print("\n\nVerificando mapeamento de rIds em document.xml.rels:\n")
    
    rels_xml = z.read('word/_rels/document.xml.rels').decode('utf-8')
    
    # Procurar por todas as relações que mencionam image
    image_rels = re.findall(
        r'<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*image[^"]*)"',
        rels_xml
    )
    
    print(f"Encontradas {len(image_rels)} relações para imagens:")
    for rid, target in sorted(image_rels):
        print(f"  {rid} → {target}")
    
    print("\n\nResumo das imagens no template:")
    print("=" * 60)
    for rid, target in sorted(image_rels):
        if 'image' in target:
            # Extrair número
            match = re.search(r'image(\d+)', target)
            if match:
                num = int(match.group(1))
                mapa = {
                    1: "Frontal",
                    2: "Traseira",
                    3: "Lateral 1",
                    4: "Lateral 2",
                    5: "Superior",
                    6: "Termômetro",
                    7: "Tampa Boca Visita",
                    8: "Válvula de Alívio",
                    9: "Válvula Fundo",
                    10: "Placa de Identificação",
                }
                label = mapa.get(num, "??")
                print(f"  {target:30} → {label}")

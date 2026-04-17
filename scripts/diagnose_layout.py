#!/usr/bin/env python3
"""
Analisa problemas de layout no template.docx
"""

import zipfile
import tempfile
import os
from lxml import etree

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

template_path = 'template/template.docx'

with tempfile.TemporaryDirectory() as temp_dir:
    # Extrair
    with zipfile.ZipFile(template_path, 'r') as z:
        z.extractall(temp_dir)
    
    doc_path = os.path.join(temp_dir, 'word', 'document.xml')
    with open(doc_path, 'rb') as f:
        parser = etree.XMLParser(remove_blank_text=False)
        tree = etree.parse(f, parser)
        root = tree.getroot()
    
    print("=" * 70)
    print("DIAGNÓSTICO DO TEMPLATE")
    print("=" * 70)
    
    # 1. Procurar campos de numeração de página
    print("\n1. CAMPOS DE NUMERAÇÃO DE PÁGINA:")
    print("-" * 70)
    
    fields_found = False
    for para in root.findall('.//w:p', NAMESPACES):
        for fldChar in para.findall('.//w:fldChar', NAMESPACES):
            fields_found = True
            texts = []
            for t in para.findall('.//w:t', NAMESPACES):
                if t.text:
                    texts.append(t.text)
            text = ''.join(texts)
            if 'PAGE' in text or 'NUMPAGES' in text or 'Página' in text:
                print(f"Parágrafo com campo: {text[:80]}")
    
    if not fields_found:
        print("Nenhum campo de numeração encontrado no documento principal")
        print("Verificando footer...")
        
        # Procurar em footer
        footer_path = os.path.join(temp_dir, 'word', 'footer1.xml')
        if os.path.exists(footer_path):
            with open(footer_path, 'rb') as f:
                parser = etree.XMLParser(remove_blank_text=False)
                footer_tree = etree.parse(f, parser)
                footer_root = footer_tree.getroot()
            
            for para in footer_root.findall('.//w:p', NAMESPACES):
                for fldData in para.findall('.//w:fldData', NAMESPACES):
                    print(f"  fldData: {fldData.text}")
                
                # Procurar instrução de campo
                fldSimple = para.find('.//w:fldSimple', NAMESPACES)
                if fldSimple is not None:
                    instr = fldSimple.get('{http://schemas.openxmlformats.org/officeDocument/2006/main}instr')
                    print(f"  fldSimple instr: {instr}")
                
                texts = []
                for t in para.findall('.//w:t', NAMESPACES):
                    if t.text:
                        texts.append(t.text)
                text = ''.join(texts)
                if text.strip():
                    print(f"  Texto: {text}")
    
    # 2. Procurar parágrafo de Recomendação
    print("\n2. PARÁGRAFO DE RECOMENDAÇÃO:")
    print("-" * 70)
    
    for para in root.findall('.//w:p', NAMESPACES):
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        text = ''.join(texts)
        
        if 'RECOMENDAÇÃO' in text or 'Recomenda-se' in text:
            ppr = para.find('w:pPr', NAMESPACES)
            if ppr is not None:
                keep_lines = ppr.find('w:keepLines', NAMESPACES)
                keep_next = ppr.find('w:keepNext', NAMESPACES)
                keep_with_next = ppr.find('w:keepWithNext', NAMESPACES)
                widow_control = ppr.find('w:widowControl', NAMESPACES)
                
                print(f"Parágrafo: {text[:60]}...")
                print(f"  keepLines: {keep_lines is not None}")
                print(f"  keepNext: {keep_next is not None}")
                print(f"  keepWithNext: {keep_with_next is not None}")
                print(f"  widowControl: {widow_control is not None}")
    
    # 3. Procurar rodapé com assinaturas
    print("\n3. RODAPÉ (ASSINATURAS E ENGENHEIRO):")
    print("-" * 70)
    
    for para in root.findall('.//w:p', NAMESPACES):
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        text = ''.join(texts)
        
        if 'Engenheiro' in text or 'encarregado' in text or 'INSP' in text:
            print(f"Parágrafo: {text[:80]}")
            
            # Verificar estrutura
            table = para.getparent()
            if table.tag == '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tbl':
                rows = table.findall('w:tr', NAMESPACES)
                cells = table.findall('.//w:tc', NAMESPACES)
                print(f"  Em tabela com {len(rows)} linhas e {len(cells)} células")
    
    # 4. Verificar header para logo CEINSPEC
    print("\n4. HEADER (LOGO CEINSPEC):")
    print("-" * 70)
    
    header_path = os.path.join(temp_dir, 'word', 'header1.xml')
    if os.path.exists(header_path):
        with open(header_path, 'rb') as f:
            parser = etree.XMLParser(remove_blank_text=False)
            header_tree = etree.parse(f, parser)
            header_root = header_tree.getroot()
        
        drawings = header_root.findall('.//w:drawing', NAMESPACES)
        blips = header_root.findall('.//a:blip', {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'})
        
        print(f"Drawings encontrados: {len(drawings)}")
        print(f"Blips (imagens) encontradas: {len(blips)}")
        
        for blip in blips:
            embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
            link = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}link')
            print(f"  Blip: embed={embed}, link={link}")
        
        # Verificar rels
        rels_path = os.path.join(temp_dir, 'word', '_rels', 'header1.xml.rels')
        if os.path.exists(rels_path):
            with open(rels_path, 'rb') as f:
                parser = etree.XMLParser(remove_blank_text=False)
                rels_tree = etree.parse(f, parser)
                rels_root = rels_tree.getroot()
            
            for rel in rels_root.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                rid = rel.get('Id')
                type_attr = rel.get('Type')
                target = rel.get('Target')
                if 'image' in type_attr.lower():
                    print(f"  Relação {rid}: {target}")
        else:
            print("  ⚠ Arquivo header1.xml.rels não encontrado")
    else:
        print("  ⚠ Arquivo header1.xml não encontrado")

print("\n" + "=" * 70)

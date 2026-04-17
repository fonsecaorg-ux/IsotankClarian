#!/usr/bin/env python3
"""
Análise detalhada da estrutura do template
"""

import zipfile
import tempfile
import os
from lxml import etree

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
}

template_path = 'template/template.docx'

with tempfile.TemporaryDirectory() as temp_dir:
    # Extrair
    with zipfile.ZipFile(template_path, 'r') as z:
        z.extractall(temp_dir)
    
    print("=" * 70)
    print("ANÁLISE DETALHADA DO TEMPLATE")
    print("=" * 70)
    
    # 1. Analisar footer em detalhes
    print("\n1. ESTRUTURA DO FOOTER (rodapé):")
    print("-" * 70)
    
    footer_path = os.path.join(temp_dir, 'word', 'footer1.xml')
    if os.path.exists(footer_path):
        with open(footer_path, 'rb') as f:
            parser = etree.XMLParser(remove_blank_text=False)
            footer_tree = etree.parse(f, parser)
            footer_root = footer_tree.getroot()
        
        # Procurar todas as tabelas
        tables = footer_root.findall('.//w:tbl', NAMESPACES)
        print(f"Tabelas no footer: {len(tables)}")
        
        for table_idx, table in enumerate(tables):
            rows = table.findall('w:tr', NAMESPACES)
            print(f"\n  Tabela {table_idx + 1}: {len(rows)} linhas")
            
            for row_idx, row in enumerate(rows):
                cells = row.findall('w:tc', NAMESPACES)
                print(f"    Linha {row_idx + 1}: {len(cells)} células")
                
                for cell_idx, cell in enumerate(cells):
                    # Extrair texto
                    texts = []
                    for t in cell.findall('.//w:t', NAMESPACES):
                        if t.text:
                            texts.append(t.text)
                    text = ''.join(texts)
                    
                    # Extrair dimensão da célula
                    tcPr = cell.find('w:tcPr', NAMESPACES)
                    width = None
                    if tcPr is not None:
                        tcW = tcPr.find('w:tcW', NAMESPACES)
                        if tcW is not None:
                            width = tcW.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}w')
                    
                    if text.strip():
                        print(f"      Célula {cell_idx + 1}: '{text[:40]}...' (width={width})")
    
    # 2. Verificar campos de númeração de página em footer1.xml.rels
    print("\n2. CAMPOS NO FOOTER (instruções):")
    print("-" * 70)
    
    if os.path.exists(footer_path):
        with open(footer_path, 'rb') as f:
            footer_content = f.read().decode('utf-8')
        
        # Procurar por fldSimple ou instrucoes
        if 'fldSimple' in footer_content:
            print("  Encontrado fldSimple")
            # Procurar instr
            import re
            instr_pattern = r'w:instr="([^"]*)"'
            matches = re.findall(instr_pattern, footer_content)
            for match in matches:
                print(f"    Instrução: {match}")
        
        if 'NUMPAGES' in footer_content:
            print("  ✓ NUMPAGES encontrado no footer")
        if 'PAGE' in footer_content:
            print("  ✓ PAGE encontrado no footer")
        if 'Página' in footer_content:
            print("  ✓ 'Página' encontrado no footer")
    
    # 3. Verificar imagem do header (CEINSPEC)
    print("\n3. VERIFYING HEADER IMAGES:")
    print("-" * 70)
    
    header_path = os.path.join(temp_dir, 'word', 'header1.xml')
    if os.path.exists(header_path):
        # Verificar arquivo
        with zipfile.ZipFile(template_path, 'r') as z:
            files = z.namelist()
            
            # Procurar por image13
            if 'word/media/image13.png' in files:
                size = len(z.read('word/media/image13.png'))
                print(f"  ✓ image13.png existe ({size} bytes)")
            else:
                print(f"  ✗ image13.png NÃO existe")
                print(f"\n  Arquivos de media disponíveis:")
                for f in files:
                    if 'word/media/image' in f:
                        print(f"    - {f}")
    
    # 4. Verificar relacionamentos do header
    print("\n4. HEADER RELATIONSHIPS:")
    print("-" * 70)
    
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
            print(f"  {rid}: {target}")
    else:
        print("  ⚠ Arquivo não encontrado")

print("\n" + "=" * 70)

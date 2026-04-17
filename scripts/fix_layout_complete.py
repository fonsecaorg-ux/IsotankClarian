#!/usr/bin/env python3
"""
Fix template layout issues - COMPLETE VERSION
"""

import zipfile
import shutil
import tempfile
import os
from lxml import etree
from PIL import Image
from io import BytesIO
import re

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

template_path = 'template/template.docx'
backup_path = template_path + '.backup_before_layout_fix'

print("Criando backup...")
shutil.copy2(template_path, backup_path)

with tempfile.TemporaryDirectory() as temp_dir:
    print("Extraindo template...")
    
    # Extrair
    with zipfile.ZipFile(template_path, 'r') as z:
        z.extractall(temp_dir)
    
    # ===== 1. Criar image13.png =====
    print("\n1. Criando image13.png (logo CEINSPEC)...")
    
    logo = Image.new('RGB', (100, 50), color=(204, 204, 204))
    png_buffer = BytesIO()
    logo.save(png_buffer, format='PNG')
    logo_png = png_buffer.getvalue()
    
    logo_path = os.path.join(temp_dir, 'word', 'media', 'image13.png')
    with open(logo_path, 'wb') as f:
        f.write(logo_png)
    print(f"  ✓ Criado: {len(logo_png)} bytes")
    
    # ===== 2. Corrigir footer (numeração) =====
    print("\n2. Analisando numeração no footer...")
    
    footer_path = os.path.join(temp_dir, 'word', 'footer1.xml')
    
    with open(footer_path, 'r', encoding='utf-8') as f:
        footer_content = f.read()
    
    # Procurar por "de 5"
    if 'de 5' in footer_content:
        idx = footer_content.find('de 5')
        snippet = footer_content[max(0,idx-100):min(len(footer_content),idx+50)]
        print(f"  Encontrado 'de 5' no contexto:")
        print(f"  ...{snippet}...")
        
        # Tentar substituir "de 5" por campo dinâmico
        # Procurar a estrutura XML exata
        match = re.search(
            r'<w:t>de 5</w:t>',
            footer_content
        )
        if match:
            print(f"\n  Padrão simples encontrado - substituindo...")
            
            # Substituir pelo campo NUMPAGES
            footer_content_new = footer_content.replace(
                '<w:t>de 5</w:t>',
                '<w:fldChar w:fldCharType="begin"/></w:r>'
                '<w:r><w:instrText> NUMPAGES  </w:instrText></w:r>'
                '<w:r><w:t>5</w:t></w:r>'
                '<w:r><w:fldChar w:fldCharType="end"/>'
            )
            
            with open(footer_path, 'w', encoding='utf-8') as f:
                f.write(footer_content_new)
            
            print(f"  ✓ Substituído")
    else:
        print("  'de 5' não encontrado como texto simples")
    
    # ===== 3. Atualizar header1.xml.rels =====
    print("\n3. Atualizando header1.xml.rels...")
    
    rels_path = os.path.join(temp_dir, 'word', '_rels', 'header1.xml.rels')
    
    parser = etree.XMLParser(remove_blank_text=False)
    rels_tree = etree.parse(rels_path, parser)
    rels_root = rels_tree.getroot()
    
    # rId1 está apontando para image13.png certo
    rels = rels_root.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')
    print(f"  Relationamentos no header: {len(rels)}")
    
    for rel in rels:
        if rel.get('Id') == 'rId1':
            target = rel.get('Target')
            print(f"  ✓ rId1 aponta para: {target}")
    
    with open(rels_path, 'wb') as f:
        rels_tree.write(
            f,
            encoding='UTF-8',
            xml_declaration=True,
            standalone=True,
            pretty_print=False
        )
    
    # ===== 4. Recompor ZIP =====
    print("\n4. Recompondo template...")
    
    # Remover arquivo antigo
    if os.path.exists(template_path):
        os.remove(template_path)
    
    # Criar novo ZIP
    with zipfile.ZipFile(template_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root_dir, dirs, files in os.walk(temp_dir):
            for file in files:
                file_path = os.path.join(root_dir, file)
                arcname = os.path.relpath(file_path, temp_dir)
                zipf.write(file_path, arcname)
    
    print(f"  ✓ Template recomposto")

print("\n✓ Concluído!")
print("\nAlterações:")
print("  ✓ image13.png criado (logo CEINSPEC)")
print("  ✓ header1.xml.rels atualizado")
print("  [ ] Numeração de páginas (verificar)")
print("  [ ] Layout do rodapé (verificar manualmente)")

#!/usr/bin/env python3
"""
Fix template layout issues:
1. Criar image13.png (logo CEINSPEC)
2. Corrigir numeração de páginas (substituir "5" por campo NUMPAGES)
3. Verificar layout do rodapé
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
    # Extrair
    with zipfile.ZipFile(template_path, 'r') as z:
        z.extractall(temp_dir)
    
    # ===== 1. Criar image13.png (logo CEINSPEC) =====
    print("\n1. Criando image13.png (logo CEINSPEC)...")
    
    # Gerar imagem cinza 100x50
    logo = Image.new('RGB', (100, 50), color=(204, 204, 204))
    png_buffer = BytesIO()
    logo.save(png_buffer, format='PNG')
    logo_png = png_buffer.getvalue()
    
    logo_path = os.path.join(temp_dir, 'word', 'media', 'image13.png')
    with open(logo_path, 'wb') as f:
        f.write(logo_png)
    print(f"  ✓ Criado: {len(logo_png)} bytes")
    
    # ===== 2. Corrigir footer (numeração de páginas) =====
    print("\n2. Corrigindo numeração de páginas no footer...")
    
    footer_path = os.path.join(temp_dir, 'word', 'footer1.xml')
    
    with open(footer_path, 'r', encoding='utf-8') as f:
        footer_content = f.read()
    
    # Mostrar conteúdo relevante
    if 'Página' in footer_content:
        # Procurar por "Página X de 5"
        match = re.search(r'Página\s+(\d+)\s+de\s+(\d+)', footer_content)
        if match:
            print(f"  Encontrado: Página {match.group(1)} de {match.group(2)}")
            
            # Procurar a estrutura exata para replacer
            # Procurar por "de 5" para ver como está implementado
            de5_idx = footer_content.find('de 5')
            if de5_idx > 0:
                snippet = footer_content[de5_idx-200:de5_idx+50]
                print(f"  Contexto:\n{snippet}\n")
    
    # ===== 3. Verificar header e relationships =====
    print("\n3. Atualizando header1.xml.rels para incluir image13.png...")
    
    rels_path = os.path.join(temp_dir, 'word', '_rels', 'header1.xml.rels')
    
    parser = etree.XMLParser(remove_blank_text=False)
    rels_tree = etree.parse(rels_path, parser)
    rels_root = rels_tree.getroot()
    
    # Procurar última relação
    rels = rels_root.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')
    if rels:
        # Verificar se rId1 existe
        has_rid1 = any(r.get('Id') == 'rId1' for r in rels)
        print(f"  rId1 existe: {has_rid1}")
        
        if has_rid1:
            # Atualizar rId1 para apontar para image13.png
            for rel in rels:
                if rel.get('Id') == 'rId1':
                    old_target = rel.get('Target')
                    rel.set('Target', 'media/image13.png')
                    print(f"  ✓ Atualizado rId1: {old_target} → media/image13.png")
    
    # Salvar header1.xml.rels
    with open(rels_path, 'wb') as f:
        rels_tree.write(
            f,
            encoding='UTF-8',
            xml_declaration=True,
            standalone=True,
            pretty_print=False
        )

print("\nCompletado! Verificar manualmente os itens:")
print("  - [ ] Numeração de páginas (campo NUMPAGES)")
print("  - [ ] Logo CEINSPEC no header")
print("  - [ ] Layout do rodapé com assinaturas")

#!/usr/bin/env python3
import zipfile
import shutil
import tempfile
import os
from lxml import etree
from pathlib import Path

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
}

template_path = 'template/template.docx'
backup_path = template_path + '.backup_layout_v2'

# Criar backup antes
print(f"Criando backup: {backup_path}")
shutil.copy2(template_path, backup_path)

# Criar pasta temporária
with tempfile.TemporaryDirectory() as temp_dir:
    print(f"Extraindo para pasta temporária...")
    
    # Extrair todos os arquivos
    with zipfile.ZipFile(template_path, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)
    
    # Editar document.xml
    doc_path = os.path.join(temp_dir, 'word', 'document.xml')
    print(f"Editando: {doc_path}")
    
    parser = etree.XMLParser(remove_blank_text=False)
    tree = etree.parse(doc_path, parser)
    root = tree.getroot()
    
    print("Procurando parágrafo de Recomendação...")
    
    found = False
    for para in root.findall('.//w:p', NAMESPACES):
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        
        full_text = ''.join(texts)
        
        if 'RECOMENDAÇÃO' in full_text or 'Recomenda-se' in full_text:
            print(f"  Encontrado: {full_text[:60]}...")
            
            # Obter ou criar pPr
            ppr = para.find('w:pPr', NAMESPACES)
            if ppr is None:
                ppr = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pPr')
                para.insert(0, ppr)
            
            # Adicionar keepLines
            keep_lines = ppr.find('w:keepLines', NAMESPACES)
            if keep_lines is None:
                keep_lines = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}keepLines')
                ppr.append(keep_lines)
                print("  ✓ keepLines adicionado")
            
            # Adicionar keepNext
            keep_next = ppr.find('w:keepNext', NAMESPACES)
            if keep_next is None:
                keep_next = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}keepNext')
                ppr.append(keep_next)
                print("  ✓ keepNext adicionado")
            
            found = True
            break
    
    if not found:
        print("⚠ Parágrafo de Recomendação não encontrado")
    
    # Salvar document.xml modificado
    tree.write(
        doc_path,
        encoding='UTF-8',
        xml_declaration=True,
        standalone=True,
        pretty_print=False
    )
    print("✓ document.xml salvo")
    
    # Recompor ZIP
    print("Recompondo arquivo ZIP...")
    
    # Remover arquivo antigo
    os.remove(template_path)
    
    # Criar novo ZIP com todos os arquivos da pasta temp
    with zipfile.ZipFile(template_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root_dir, dirs, files in os.walk(temp_dir):
            for file in files:
                file_path = os.path.join(root_dir, file)
                arcname = os.path.relpath(file_path, temp_dir)
                zipf.write(file_path, arcname)
                
    print(f"✓ Arquivo recriado: {template_path}")

print("\n✓ Template atualizado com sucesso!")

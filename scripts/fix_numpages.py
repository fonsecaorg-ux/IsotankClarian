#!/usr/bin/env python3
"""
Fix: Corrigir numeração de páginas (substituir "5" hardcoded por NUMPAGES)
"""

import zipfile
import shutil
import tempfile
import os
from lxml import etree

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
}

template_path = 'template/template.docx'
backup_path = template_path + '.backup_before_numpages'

print("Criando backup...")
shutil.copy2(template_path, backup_path)

with tempfile.TemporaryDirectory() as temp_dir:
    print("Extraindo template...")
    
    with zipfile.ZipFile(template_path, 'r') as z:
        z.extractall(temp_dir)
    
    footer_path = os.path.join(temp_dir, 'word', 'footer1.xml')
    
    parser = etree.XMLParser(remove_blank_text=False)
    tree = etree.parse(footer_path, parser)
    root = tree.getroot()
    
    print("\nCorrigindo numeração de páginas...")
    
    # Procurar o parágrafo com "Página 2 de 5"
    found = False
    for para in root.findall('.//w:p', NAMESPACES):
        runs = para.findall('w:r', NAMESPACES)
        
        # Procurar por sequência de runs que contém "Página", PAGE, "de", "5"
        for i in range(len(runs)):
            run = runs[i]
            
            # Verificar se este run tem " de "
            text_elem = run.find('w:t', NAMESPACES)
            if text_elem is not None and text_elem.text and ' de ' in text_elem.text:
                # Procurar pelo próximo run que tem "5"
                if i + 1 < len(runs):
                    next_run = runs[i + 1]
                    next_text = next_run.find('w:t', NAMESPACES)
                    if next_text is not None and next_text.text and next_text.text.strip() == '5':
                        print(f"  Encontrado padrão 'Página X de 5'")
                        print(f"    Run {i}: {text_elem.text}")
                        print(f"    Run {i+1}: {next_text.text}")
                        
                        # Substituir o run com "5" por um campo NUMPAGES
                        # Primeiro, limpar o conteúdo do run
                        for child in list(next_run):
                            next_run.remove(child)
                        
                        # Adicionar fldChar begin
                        fld_begin = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fldChar')
                        fld_begin.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fldCharType', 'begin')
                        next_run.append(fld_begin)
                        
                        # Criar novo run para instrText
                        instr_run = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}r')
                        instr_text = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}instrText')
                        instr_text.text = ' NUMPAGES '
                        instr_run.append(instr_text)
                        
                        # Inserir após o run atual
                        para_index = list(para).index(next_run)
                        para.insert(para_index + 1, instr_run)
                        
                        # Criar novo run para o valor
                        val_run = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}r')
                        val_text = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')
                        val_text.text = '5'
                        val_run.append(val_text)
                        para.insert(para_index + 2, val_run)
                        
                        # Criar novo run para fldChar end
                        fld_end_run = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}r')
                        fld_end = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fldChar')
                        fld_end.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}fldCharType', 'end')
                        fld_end_run.append(fld_end)
                        para.insert(para_index + 3, fld_end_run)
                        
                        print(f"  ✓ Substituído '5' por campo dinâmico NUMPAGES")
                        found = True
                        break
        
        if found:
            break
    
    if not found:
        print("  ⚠ Padrão não encontrado - verifique manualmente")
    
    # Salvar footer modificado
    with open(footer_path, 'wb') as f:
        tree.write(
            f,
            encoding='UTF-8',
            xml_declaration=True,
            standalone=True,
            pretty_print=False
        )
    
    # Recompor ZIP
    print("\nRecompondo template...")
    
    if os.path.exists(template_path):
        os.remove(template_path)
    
    with zipfile.ZipFile(template_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root_dir, dirs, files in os.walk(temp_dir):
            for file in files:
                file_path = os.path.join(root_dir, file)
                arcname = os.path.relpath(file_path, temp_dir)
                zipf.write(file_path, arcname)
    
    print("✓ Template atualizado!")

print("\nAlterações aplicadas:")
print("  ✓ Campo NUMPAGES adicionado para total de páginas")
print("  ✓ Template recomposto")

#!/usr/bin/env python3
"""
fix_template_layout.py
Corrige problemas de layout no template.docx:
1. Adiciona keepLines/keepNext ao parágrafo de Recomendação
2. Corrige numeração de páginas (remove campos de contagem incorreta)
"""

import zipfile
import re
from lxml import etree
import os
import sys

# Namespaces Word
NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeOpenXml/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
}

def find_recommendation_paragraph(root):
    """Encontrar parágrafo de Recomendação"""
    for para in root.findall('.//w:p', NAMESPACES):
        # Coletar todo o texto do parágrafo
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        
        full_text = ''.join(texts)
        
        # Procurar por parágrafo que começa com "Recomenda-se"
        if 'Recomenda-se' in full_text or 'recomendação' in full_text.lower():
            return para, full_text
    
    return None, None

def add_keeplines_keepnext(para):
    """Adicionar keepLines e keepNext ao parágrafo"""
    # Encontrar ou criar pPr (paragraph properties)
    ppr = para.find('w:pPr', NAMESPACES)
    
    if ppr is None:
        # Criar pPr como primeiro elemento
        ppr = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pPr')
        para.insert(0, ppr)
    
    # Verificar se keepLines já existe
    keep_lines = ppr.find('w:keepLines', NAMESPACES)
    if keep_lines is None:
        keep_lines = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}keepLines')
        ppr.append(keep_lines)
    
    # Verificar se keepNext já existe
    keep_next = ppr.find('w:keepNext', NAMESPACES)
    if keep_next is None:
        keep_next = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}keepNext')
        ppr.append(keep_next)
    
    return True

def fix_page_numbering(root):
    """Corrigir numeração de páginas"""
    fixed = False
    
    # Procurar por campos com contagem de páginas
    # Pattern comum: NUMPAGES (total de páginas)
    # Queremos remover ou corrigir campos que causam "Página 6 de 5"
    
    for fldChar in root.findall('.//w:fldChar', NAMESPACES):
        parent = fldChar.getparent()
        if parent is not None:
            # Procurar por instrução de campo (w:instrText)
            for instr in parent.findall('.//w:instrText', NAMESPACES):
                instr_text = instr.text or ''
                
                # Se encontrar NUMPAGES mal configurado, remover
                if 'NUMPAGES' in instr_text and 'PAGE' in instr_text:
                    # Verificar se está em rodapé (header/footer)
                    # Se estiver, pode causar problema de "Página X de Y"
                    # Melhor abordagem: verificar se o numero total é realista
                    
                    print(f"[ENCONTRADO] Campo de página: {instr_text.strip()}")
                    
                    # Remover elementos problemáticos que causam contagem errada
                    # Manter apenas PAGE (número atual da página)
                    if 'NUMPAGES' in instr_text and instr_text.count('NUMPAGES') > 0:
                        # Substituir por campo mais simples
                        # Remover a instrução NUMPAGES problemática
                        
                        # Encontrar o run contendo fldChar e seus irmãos
                        run = parent.find('w:r', NAMESPACES)
                        if run is not None and 'NUMPAGES' in instr_text:
                            # Substituir instrução por uma mais segura
                            instr.text = 'PAGE'
                            print(f"  ✓ Corrigido para: PAGE")
                            fixed = True
    
    return fixed

def fix_template_layout(template_path):
    """Corrigir problemas de layout no template.docx"""
    
    if not os.path.exists(template_path):
        print(f"✗ Erro: {template_path} não encontrado")
        return False
    
    # Criar backup
    backup_path = template_path + '.backup_layout'
    if not os.path.exists(backup_path):
        with open(template_path, 'rb') as src:
            with open(backup_path, 'wb') as dst:
                dst.write(src.read())
        print(f"✓ Backup criado: {backup_path}\n")
    
    # Extrair document.xml
    doc_xml_bytes = None
    other_files = {}
    
    with zipfile.ZipFile(template_path, 'r') as zip_in:
        doc_xml_bytes = zip_in.read('word/document.xml')
        
        for item in zip_in.infolist():
            if item.filename != 'word/document.xml':
                other_files[item.filename] = (zip_in.read(item.filename), item)
    
    # Parse com lxml (preserva namespaces)
    parser = etree.XMLParser(remove_blank_text=False)
    root = etree.fromstring(doc_xml_bytes, parser)
    
    print("Procurando problemas de layout...\n")
    
    # 1. Adicionar keepLines/keepNext ao parágrafo de Recomendação
    recom_para, recom_text = find_recommendation_paragraph(root)
    recom_fixed = False
    
    if recom_para is not None:
        print(f"[ENCONTRADO] Parágrafo de Recomendação")
        print(f"  Texto: {recom_text[:80]}...")
        
        if add_keeplines_keepnext(recom_para):
            print(f"  ✓ Adicionado keepLines e keepNext")
            recom_fixed = True
    else:
        print("✗ Parágrafo de Recomendação não encontrado")
    
    # 2. Corrigir numeração de páginas
    print()
    page_fixed = fix_page_numbering(root)
    
    if page_fixed:
        print("✓ Numeração de páginas corrigida")
    else:
        print("ℹ Numeração de páginas verificada (sem mudanças necessárias)")
    
    if recom_fixed or page_fixed:
        # Serializar XML corrigido
        new_doc_xml = etree.tostring(
            root,
            encoding='UTF-8',
            xml_declaration=True,
            standalone=True,
            pretty_print=False
        )
        
        # Criar novo ZIP
        temp_path = template_path + '.tmp'
        
        with zipfile.ZipFile(temp_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            zip_out.writestr('word/document.xml', new_doc_xml)
            
            for filename, (content, item) in other_files.items():
                zip_out.writestr(item, content)
        
        # Substituir arquivo original
        import time
        time.sleep(0.1)
        
        try:
            os.remove(template_path)
            os.rename(temp_path, template_path)
            print(f"\n✓ Template atualizado: {template_path}")
            return True
        except Exception as e:
            print(f"✗ Erro ao salvar: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return False
    else:
        print("\n✗ Nenhuma mudança necessária")
        return False

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, '..', 'template', 'template.docx')
    template_path = os.path.abspath(template_path)
    
    print(f"Corrigindo problemas de layout em: {template_path}\n")
    
    if fix_template_layout(template_path):
        print("\n✓ Sucesso!")
        sys.exit(0)
    else:
        print("\n✗ Sem mudanças")
        sys.exit(0)

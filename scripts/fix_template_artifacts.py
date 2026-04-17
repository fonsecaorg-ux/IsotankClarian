#!/usr/bin/env python3
"""
fix_template_artifacts.py
Corrige artefatos no template.docx:
1. Remove texto "BJETIVO - OB" após parágrafo de objetivo
2. Unifica "Engenheiro Responsável" fragmentado em múltiplos runs
"""

import zipfile
import xml.etree.ElementTree as ET
import re
import os
import sys

# Namespaces Word
NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeOpenXml/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
}

def register_namespaces():
    """Registrar namespaces para manter prefixos ao serializar"""
    for prefix, uri in NAMESPACES.items():
        ET.register_namespace(prefix, uri)

def get_paragraph_text(para):
    """Extrair todo o texto de um parágrafo (combina todos os runs)"""
    texts = []
    for t in para.findall('.//w:t', NAMESPACES):
        if t.text:
            texts.append(t.text)
    return ''.join(texts)

def remove_artifact_text(root):
    """Remover texto 'BJETIVO - OB' após parágrafo de objetivo"""
    removed = False
    
    # Procurar por parágrafo que contém "Objetivo da inspeção"
    for para in root.findall('.//w:p', NAMESPACES):
        para_text = get_paragraph_text(para)
        
        if 'Objetivo da inspeção' in para_text or 'objetivo' in para_text.lower():
            # Verificar próximo parágrafo
            para_index = list(root.findall('.//w:p', NAMESPACES)).index(para)
            all_paras = root.findall('.//w:p', NAMESPACES)
            
            if para_index + 1 < len(all_paras):
                next_para = all_paras[para_index + 1]
                next_text = get_paragraph_text(next_para)
                
                if 'BJETIVO' in next_text and 'OB' in next_text:
                    print(f"[ENCONTRADO] Parágrafo com artefato: '{next_text.strip()}'")
                    
                    # Remover esse parágrafo
                    parent = next_para.find('..')
                    if parent is not None:
                        parent.remove(next_para)
                    else:
                        # Se não conseguir via find, tentar remover da raiz
                        for i, p in enumerate(root.findall('.//w:p', NAMESPACES)):
                            if p == next_para:
                                # Encontrar parent correto
                                for section in root.findall('.//w:body', NAMESPACES):
                                    if next_para in section:
                                        section.remove(next_para)
                                        break
                    
                    removed = True
                    print(f"✓ Artefato 'BJETIVO - OB' removido")
                    break
    
    return removed

def unify_engenheiro_responsavel(root):
    """Unificar 'Engenheiro Responsável' fragmentado em um único run"""
    unified = False
    
    for para in root.findall('.//w:p', NAMESPACES):
        para_text = get_paragraph_text(para)
        
        if 'Engenheiro' in para_text and 'Responsável' in para_text:
            # Verificar se está fragmentado em múltiplos runs
            runs = para.findall('.//w:r', NAMESPACES)
            
            if len(runs) > 1:
                # Coletar todo o texto
                all_texts = []
                for run in runs:
                    for t in run.findall('w:t', NAMESPACES):
                        if t.text:
                            all_texts.append(t.text)
                
                full_text = ''.join(all_texts)
                
                if 'Engenheiro' in full_text:
                    print(f"\n[ENCONTRADO] Parágrafo fragmentado: '{full_text.strip()}'")
                    print(f"  - Número de runs: {len(runs)}")
                    
                    # Criar um novo run unificado
                    # Usar o properties do primeiro run
                    first_run = runs[0]
                    first_rpr = first_run.find('w:rPr', NAMESPACES)
                    
                    # Limpar todos os runs
                    for run in runs[1:]:
                        para.remove(run)
                    
                    # Atualizar primeiro run com texto completo
                    first_run.clear()
                    if first_rpr is not None:
                        first_run.append(first_rpr)
                    
                    # Criar novo elemento de texto
                    new_t = ET.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')
                    new_t.text = full_text
                    first_run.append(new_t)
                    
                    print(f"  ✓ Unificado em 1 run: '{full_text.strip()}'")
                    unified = True
    
    return unified

def fix_template_docx(template_path):
    """Corrigir artefatos no template.docx"""
    
    if not os.path.exists(template_path):
        print(f"✗ Erro: {template_path} não encontrado")
        return False
    
    # Criar backup
    backup_path = template_path + '.backup_artifacts'
    if not os.path.exists(backup_path):
        with open(template_path, 'rb') as src:
            with open(backup_path, 'wb') as dst:
                dst.write(src.read())
        print(f"✓ Backup criado: {backup_path}\n")
    
    register_namespaces()
    
    # Extrair e processar document.xml
    doc_xml_bytes = None
    other_files = {}
    
    with zipfile.ZipFile(template_path, 'r') as zip_in:
        # Ler document.xml
        doc_xml_bytes = zip_in.read('word/document.xml')
        
        # Guardar todos os outros arquivos
        for item in zip_in.infolist():
            if item.filename != 'word/document.xml':
                other_files[item.filename] = (zip_in.read(item.filename), item)
    
    # Parser preservando a estrutura
    ET.register_namespace('', NAMESPACES['w'])
    ET.register_namespace('r', NAMESPACES['r'])
    ET.register_namespace('wp', NAMESPACES['wp'])
    
    root = ET.fromstring(doc_xml_bytes)
    
    # Aplicar correções
    print("Procurando artefatos...\n")
    
    removed_artifact = remove_artifact_text(root)
    unified_text = unify_engenheiro_responsavel(root)
    
    if removed_artifact or unified_text:
        # Salvar modificações em novo template
        new_doc_xml = ET.tostring(root, encoding='utf-8', xml_declaration=False)
        
        # Usar encoding correto
        new_doc_xml = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + new_doc_xml
        
        # Criar novo ZIP com o document.xml corrigido
        temp_path = template_path + '.tmp'
        
        with zipfile.ZipFile(temp_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            # Escrever document.xml corrigido
            zip_out.writestr('word/document.xml', new_doc_xml)
            
            # Escrever todos os outros arquivos
            for filename, (content, item) in other_files.items():
                zip_out.writestr(item, content)
        
        # Substituir arquivo original (fechar primeiro!)
        import time
        time.sleep(0.1)  # Pequena pausa para liberar arquivo
        
        try:
            os.remove(template_path)
            os.rename(temp_path, template_path)
        except Exception as e:
            print(f"✗ Erro ao salvar: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return False
        
        print(f"\n✓ Template corrigido: {template_path}")
        return True
    else:
        print("✗ Nenhum artefato encontrado")
        return False

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, '..', 'template', 'template.docx')
    template_path = os.path.abspath(template_path)
    
    print(f"Corrigindo artefatos em: {template_path}\n")
    
    if fix_template_docx(template_path):
        print("\n✓ Sucesso!")
        sys.exit(0)
    else:
        print("\n✗ Sem mudanças necessárias")
        sys.exit(0)

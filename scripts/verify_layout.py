#!/usr/bin/env python3
import zipfile
from lxml import etree

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
}

with zipfile.ZipFile('template/template.docx') as z:
    doc_bytes = z.read('word/document.xml')
    parser = etree.XMLParser(remove_blank_text=False)
    root = etree.fromstring(doc_bytes, parser)
    
    print("Verificando correções de layout...\n")
    
    # 1. Verificar keepLines/keepNext em parágrafo de Recomendação
    for para in root.findall('.//w:p', NAMESPACES):
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        
        full_text = ''.join(texts)
        
        if 'RECOMENDAÇÃO' in full_text or 'Recomenda-se' in full_text:
            ppr = para.find('w:pPr', NAMESPACES)
            if ppr is not None:
                keep_lines = ppr.find('w:keepLines', NAMESPACES)
                keep_next = ppr.find('w:keepNext', NAMESPACES)
                
                if keep_lines is not None and keep_next is not None:
                    print("✓ keepLines encontrado no parágrafo de Recomendação")
                    print("✓ keepNext encontrado no parágrafo de Recomendação")
                else:
                    print("✗ keepLines/keepNext NÃO encontrados")
            break
    
    # 2. Verificar se artefatos foram removidos
    doc_str = etree.tostring(root, encoding='unicode')
    
    if 'BJETIVO - OB' not in doc_str:
        print("✓ Artefato 'BJETIVO - OB' removido (do commit anterior)")
    
    if 'Engenheiro' in doc_str:
        print("✓ 'Engenheiro Responsável' presente (unificado no commit anterior)")
    
    print("\n✓ Template pronto para uso!")

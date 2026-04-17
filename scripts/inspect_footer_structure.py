#!/usr/bin/env python3
"""
Investigar estrutura exata de "de 5"
"""

import zipfile
import tempfile
import os
from lxml import etree

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
}

template_path = 'template/template.docx'

with tempfile.TemporaryDirectory() as temp_dir:
    with zipfile.ZipFile(template_path, 'r') as z:
        z.extractall(temp_dir)
    
    footer_path = os.path.join(temp_dir, 'word', 'footer1.xml')
    
    parser = etree.XMLParser(remove_blank_text=False)
    tree = etree.parse(footer_path, parser)
    root = tree.getroot()
    
    print("Procurando por 'de 5' no footer...\n")
    
    # Procurar parágrafos que contêm números
    for para in root.findall('.//w:p', NAMESPACES):
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        text = ''.join(texts)
        
        # Se tiver "Página" ou números
        if 'Página' in text or 'de' in text or any(c.isdigit() for c in text):
            if '5' in text or 'de' in text or 'Pá' in text:
                print(f"Parágrafo encontrado:")
                print(f"  Texto concatenado: {text[:80]}")
                
                # Mostrar estrutura XML deste parágrafo
                para_str = etree.tostring(para, encoding='unicode', pretty_print=True)
                lines = para_str.split('\n')
                
                # Mostrar linhas relevantes
                for line in lines:
                    if 'w:t' in line or 'fldChar' in line or 'instrText' in line or 'Página' in line or 'de 5' in line:
                        print(f"    {line.strip()[:100]}")
                
                print()

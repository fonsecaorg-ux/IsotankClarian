#!/usr/bin/env python3
"""
Verificar se NUMPAGES foi adicionado corretamente ao footer
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
    
    with open(footer_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print("Verificando footer...")
    print()
    
    if 'NUMPAGES' in content:
        print("✓ NUMPAGES encontrado no footer")
        # Mostrar contexto
        idx = content.find('NUMPAGES')
        print(f"Contexto:")
        print(content[idx-100:idx+100])
    else:
        print("✗ NUMPAGES NÃO encontrado")
    
    if 'PAGE' in content:
        print("\n✓ PAGE encontrado (número atual)")
    
    # Procurar por "Página"
    if 'Página' in content:
        print("✓ Texto 'Página' encontrado")

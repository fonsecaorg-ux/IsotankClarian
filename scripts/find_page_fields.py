#!/usr/bin/env python3
import zipfile
import tempfile
import os

with tempfile.TemporaryDirectory() as temp_dir:
    with zipfile.ZipFile('template/template.docx', 'r') as z:
        z.extractall(temp_dir)
    
    footer_path = os.path.join(temp_dir, 'word', 'footer1.xml')
    
    with open(footer_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Procurar por "de 5"
    if 'de 5' in content:
        idx = content.find('de 5')
        print('Encontrado "de 5":')
        print(content[max(0,idx-150):min(len(content),idx+150)])
        print('\n---')
    
    # Procurar por 'PAGE'
    if 'PAGE' in content:
        idx = content.find('PAGE')
        print('Encontrado PAGE:')
        print(content[max(0,idx-150):min(len(content),idx+150)])
        print('\n---')
    
    # Procurar por 'NUMPAGES'
    if 'NUMPAGES' in content:
        idx = content.find('NUMPAGES')
        print('Encontrado NUMPAGES:')
        print(content[max(0,idx-150):min(len(content),idx+150)])

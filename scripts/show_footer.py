#!/usr/bin/env python3
import zipfile
import tempfile
import os
from lxml import etree

with tempfile.TemporaryDirectory() as temp_dir:
    with zipfile.ZipFile('template/template.docx', 'r') as z:
        z.extractall(temp_dir)
    
    footer_path = os.path.join(temp_dir, 'word', 'footer1.xml')
    
    parser = etree.XMLParser(remove_blank_text=False)
    tree = etree.parse(footer_path, parser)
    root = tree.getroot()
    
    # Pretty print
    xml_str = etree.tostring(root, pretty_print=True, encoding='unicode')
    
    # Mostrar as primeiras linhas
    lines = xml_str.split('\n')
    for i, line in enumerate(lines[:100]):
        print(line)

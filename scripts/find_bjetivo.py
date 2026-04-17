#!/usr/bin/env python3
import zipfile
import re

with zipfile.ZipFile('template/template.docx') as z:
    doc = z.read('word/document.xml').decode('utf-8')
    
    # Procurar por "BJETIVO" com contexto
    matches = re.finditer(r'.{0,50}BJETIVO.{0,50}', doc, re.IGNORECASE)
    
    print("Buscando todas as ocorrências de 'BJETIVO':\n")
    count = 0
    for match in matches:
        count += 1
        print(f"[Ocorrência {count}]")
        print(f"  Contexto: ...{match.group().strip()}...")
        print()
    
    if count == 0:
        print("Nenhuma ocorrência encontrada (apenas a conferência falsa acima)")
    else:
        print(f"Total: {count} ocorrência(s)")

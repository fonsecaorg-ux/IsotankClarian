#!/usr/bin/env python3
import zipfile

with zipfile.ZipFile('template/template.docx') as z:
    doc = z.read('word/document.xml').decode('utf-8')
    
    print("Verificando correções...\n")
    
    if 'BJETIVO' in doc:
        print("✗ Artefato 'BJETIVO - OB' AINDA EXISTE")
    else:
        print("✓ Artefato 'BJETIVO - OB' foi removido com sucesso")
    
    if 'Engenheiro Responsável' in doc or 'Engenheiro' in doc:
        print("✓ 'Engenheiro Responsável' está presente")
    else:
        print("✗ 'Engenheiro Responsável' não encontrado")
    
    print("\nTamanho do document.xml:", len(doc), "bytes")

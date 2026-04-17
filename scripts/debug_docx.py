#!/usr/bin/env python3
import zipfile
import os

docx_path = 'template/template.docx'
size = os.path.getsize(docx_path)
print(f"Tamanho do arquivo: {size} bytes")

try:
    with zipfile.ZipFile(docx_path, 'r') as z:
        print(f"✓ ZIP válido")
        files = z.namelist()
        print(f"Total de arquivos: {len(files)}")
        
        print("\nPrimeiros 20 arquivos:")
        for f in sorted(files)[:20]:
            print(f"  {f}")
        
        # Verificar específico
        if 'word/document.xml' in files:
            print("\n✓ word/document.xml existe")
        else:
            print("\n✗ word/document.xml NÃO existe!")
            
except Exception as e:
    print(f"✗ Erro: {type(e).__name__}: {e}")

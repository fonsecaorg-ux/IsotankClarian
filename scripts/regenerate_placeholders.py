#!/usr/bin/env python3
"""
regenerate_placeholders.py
Regenera as imagens placeholder (1022 bytes cada) no template.docx.
Substitui image1.png até image10.png por placeholders vazios (400×300, cinza #CCCCCC).
"""

import zipfile
import io
from PIL import Image
import os
import sys

def generate_placeholder_png():
    """Gera uma imagem PNG placeholder (400×300, cor cinza #CCCCCC)."""
    img = Image.new('RGB', (400, 300), color=(204, 204, 204))
    png_bytes = io.BytesIO()
    img.save(png_bytes, format='PNG')
    return png_bytes.getvalue()

def regenerate_template_placeholders(template_path):
    """Substitui as imagens no template.docx por placeholders."""
    
    # Gerar placeholder PNG
    placeholder_png = generate_placeholder_png()
    print(f"Placeholder PNG gerado: {len(placeholder_png)} bytes")
    
    # Ler template.docx
    if not os.path.exists(template_path):
        print(f"Erro: {template_path} não encontrado")
        return False
    
    # Criar backup
    backup_path = template_path + '.backup'
    if not os.path.exists(backup_path):
        with open(template_path, 'rb') as src:
            with open(backup_path, 'wb') as dst:
                dst.write(src.read())
        print(f"Backup criado: {backup_path}")
    
    # Abrir ZIP do docx
    with zipfile.ZipFile(template_path, 'r') as zip_in:
        # Criar novo ZIP
        with zipfile.ZipFile(template_path + '.tmp', 'w', zipfile.ZIP_DEFLATED) as zip_out:
            # Copiar todos os arquivos
            for item in zip_in.infolist():
                # Substituir as 10 imagens por placeholders
                if item.filename.startswith('word/media/image') and item.filename.endswith('.png'):
                    match_num = None
                    try:
                        # Extrair número da imagem (image1.png → 1)
                        name_part = item.filename.split('/')[-1]  # image1.png
                        num_str = name_part.replace('image', '').replace('.png', '')
                        match_num = int(num_str)
                    except:
                        pass
                    
                    if match_num and 1 <= match_num <= 10:
                        print(f"  Substituindo {item.filename} por placeholder")
                        zip_out.writestr(item, placeholder_png)
                        continue
                
                # Copiar arquivo normalmente
                data = zip_in.read(item.filename)
                zip_out.writestr(item, data)
    
    # Substituir arquivo original
    os.remove(template_path)
    os.rename(template_path + '.tmp', template_path)
    print(f"\nTemplate atualizado: {template_path}")
    return True

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, '..', 'template', 'template.docx')
    template_path = os.path.abspath(template_path)
    
    print(f"Regenerando placeholders em: {template_path}")
    if regenerate_template_placeholders(template_path):
        print("✓ Sucesso!")
        sys.exit(0)
    else:
        print("✗ Falha!")
        sys.exit(1)

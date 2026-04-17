#!/usr/bin/env python3
"""
Generate gray placeholder images (400x300, #CCCCCC) for template.docx
Same functionality as prepare-template.js but in Python
"""

import zipfile
import shutil
from PIL import Image
from io import BytesIO

template_path = 'template/template.docx'
backup_path = template_path + '.backup_before_placeholders'

# Create backup
print(f"Criando backup: {backup_path}")
shutil.copy2(template_path, backup_path)

# Generate gray placeholder image
print("Gerando imagem placeholder cinza (400x300)...")
placeholder = Image.new('RGB', (400, 300), color=(204, 204, 204))

# Convert to PNG bytes
png_buffer = BytesIO()
placeholder.save(png_buffer, format='PNG')
placeholder_png = png_buffer.getvalue()

print(f"Tamanho da imagem placeholder: {len(placeholder_png)} bytes")

# Extract template, replace images, recompose
print("Extraindo template...")
with zipfile.ZipFile(template_path, 'r') as z:
    # Get all files except images
    other_files = {}
    for info in z.infolist():
        if not info.filename.startswith('word/media/image'):
            other_files[info.filename] = z.read(info.filename)

# Recompose ZIP with new images
print("Recompondo template com novos placeholders...")
with zipfile.ZipFile(template_path, 'w', zipfile.ZIP_DEFLATED) as z:
    # Write all non-image files
    for filename, content in other_files.items():
        z.writestr(filename, content)
    
    # Write new placeholder images
    for i in range(1, 11):
        z.writestr(f'word/media/image{i}.png', placeholder_png)
        print(f"  image{i}.png: {len(placeholder_png)} bytes ✓")

print("\n✓ Template atualizado com placeholders cinza!")

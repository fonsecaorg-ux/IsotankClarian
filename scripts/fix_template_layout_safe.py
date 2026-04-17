#!/usr/bin/env python3
import zipfile
import shutil
from lxml import etree
from io import BytesIO

NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

template_path = 'template/template.docx'
backup_path = template_path + '.backup_layout_safe'

# Criar backup
print(f"Criando backup: {backup_path}")
shutil.copy2(template_path, backup_path)

# Abrir o docx como ZIP
with zipfile.ZipFile(template_path, 'r') as zip_read:
    # Ler documento.xml
    doc_xml = zip_read.read('word/document.xml')
    
    # Parsear com lxml preservando namespaces
    parser = etree.XMLParser(remove_blank_text=False, ns_clean=False)
    root = etree.fromstring(doc_xml, parser)
    
    print("Procurando parágrafo de Recomendação...")
    
    found = False
    for para in root.findall('.//w:p', NAMESPACES):
        # Encontrar texto no parágrafo
        texts = []
        for t in para.findall('.//w:t', NAMESPACES):
            if t.text:
                texts.append(t.text)
        
        full_text = ''.join(texts)
        
        # Verificar se é o parágrafo de Recomendação
        if 'RECOMENDAÇÃO' in full_text or 'Recomenda-se' in full_text:
            print(f"  Encontrado: {full_text[:50]}...")
            
            # Obter ou criar pPr (paragraph properties)
            ppr = para.find('w:pPr', NAMESPACES)
            if ppr is None:
                ppr = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pPr')
                para.insert(0, ppr)
            
            # Verificar se já tem keepLines
            keep_lines = ppr.find('w:keepLines', NAMESPACES)
            if keep_lines is None:
                keep_lines = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}keepLines')
                ppr.append(keep_lines)
                print("  ✓ keepLines adicionado")
            
            # Verificar se já tem keepNext
            keep_next = ppr.find('w:keepNext', NAMESPACES)
            if keep_next is None:
                keep_next = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}keepNext')
                ppr.append(keep_next)
                print("  ✓ keepNext adicionado")
            
            found = True
            break
    
    if not found:
        print("⚠ Parágrafo de Recomendação não encontrado")
    
    # Converter de volta para bytes, preservando formatação
    new_doc_xml = etree.tostring(
        root,
        encoding='UTF-8',
        xml_declaration=True,
        standalone=True,
        pretty_print=False
    )
    
    # Recriar o ZIP mantendo todos os outros arquivos intactos
    with zipfile.ZipFile(template_path, 'w', zipfile.ZIP_DEFLATED) as zip_write:
        # Copiar todos os arquivos do ZIP original
        for item in zip_read.infolist():
            if item.filename == 'word/document.xml':
                # Escrever o documento.xml modificado
                zip_write.writestr(item, new_doc_xml)
                print(f"✓ {item.filename} atualizado")
            else:
                # Copiar outros arquivos sem modificação
                zip_write.writestr(item, zip_read.read(item.filename))

print("\n✓ Template atualizado com sucesso!")
print(f"✓ Backup criado: {backup_path}")

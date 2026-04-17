#!/usr/bin/env python3
"""
Analisa o arquivo DOCX gerado para verificar:
1. Se as imagens estão no ZIP (word/media/)
2. Se as referências estão em document.xml
3. Se há placeholders não substituídos
"""

import zipfile
import os
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

def analyze_docx(docx_path):
    """Analisa conteúdo do arquivo DOCX"""
    
    if not os.path.exists(docx_path):
        print(f"❌ Arquivo não encontrado: {docx_path}")
        return
    
    print(f"📄 Analisando: {docx_path}")
    print(f"📊 Tamanho: {os.path.getsize(docx_path)} bytes\n")
    
    try:
        with zipfile.ZipFile(docx_path, 'r') as z:
            # ---- Listar arquivos no ZIP ----
            print("📁 Estrutura do ZIP:")
            files = sorted(z.namelist())
            media_files = [f for f in files if f.startswith('word/media/')]
            
            print(f"\n🖼️  Imagens encontradas ({len(media_files)}):")
            for mf in media_files:
                info = z.getinfo(mf)
                print(f"   {mf} ({info.file_size} bytes)")
            
            if not media_files:
                print("   ❌ NENHUMA imagem encontrada no ZIP!")
            
            # ---- Analisar document.xml ----
            print(f"\n📋 Analisando document.xml:")
            doc_xml = z.read('word/document.xml').decode('utf-8')
            
            # Contar blips (referências de imagem)
            blip_count = doc_xml.count('<a:blip')
            print(f"   Blips encontrados: {blip_count}")
            
            # Procurar por "image" em relId
            image_refs = []
            import re
            for match in re.finditer(r'r:embed="(rId\d+)"', doc_xml):
                image_refs.append(match.group(1))
            
            print(f"   Referências rId de imagem: {len(set(image_refs))}")
            if image_refs:
                print(f"     rIds: {sorted(set(image_refs))}")
            
            # ---- Analisar relationships ----
            print(f"\n🔗 Analisando document.xml.rels:")
            rels_xml = z.read('word/_rels/document.xml.rels').decode('utf-8')
            
            # Extrair mapeamentos rId → Target
            image_mappings = []
            for match in re.finditer(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels_xml):
                rid, target = match.group(1), match.group(2)
                if 'media' in target:
                    image_mappings.append((rid, target))
                    print(f"   {rid} → {target}")
            
            if not image_mappings:
                print("   ❌ Nenhum mapeamento de imagem encontrado!")
            
            # ---- Verificar se há placeholders não substituídos ----
            print(f"\n🔍 Verificando placeholders:")
            placeholders = [
                '{{foto_frontal}}',
                '{{foto_traseira}}',
                '{{foto_lateral1}}',
                '{{foto_lateral2}}',
                '{{foto_superior}}',
                '{{foto_termometro}}',
                '{{foto_tampa_boca_visita}}',
                '{{foto_valvula_alivio}}',
                '{{foto_valvula_descarga}}',
                '{{foto_placa_identificacao}}',
            ]
            
            found_placeholders = []
            for ph in placeholders:
                if ph in doc_xml:
                    found_placeholders.append(ph)
            
            if found_placeholders:
                print(f"   ⚠️  Placeholders não substituídos:")
                for ph in found_placeholders:
                    print(f"      {ph}")
            else:
                print(f"   ✅ Nenhum placeholder encontrado (OK)")
            
            # ---- Resumo ----
            print(f"\n📈 RESUMO:")
            print(f"   Imagens no ZIP: {len(media_files)}")
            print(f"   Blips em document.xml: {blip_count}")
            print(f"   Mapeamentos document.xml.rels: {len(image_mappings)}")
            print(f"   Placeholders não substituídos: {len(found_placeholders)}")
            
            if len(media_files) == 0:
                print(f"\n❌ PROBLEMA: Nenhuma imagem foi injetada no ZIP!")
            elif blip_count == 0:
                print(f"\n⚠️  AVISO: document.xml não tem referências de imagem!")
            elif len(media_files) > 0 and blip_count > 0:
                print(f"\n✅ Aparentemente OK: Imagens estão no ZIP e há referências")
    
    except zipfile.BadZipFile:
        print(f"❌ Erro: {docx_path} não é um arquivo ZIP válido!")
    except Exception as e:
        print(f"❌ Erro ao analisar: {e}")

if __name__ == '__main__':
    # Analisar o arquivo gerado na raiz
    docx_file = 'LAUDO_SUTU345688-3.docx'
    
    if not os.path.exists(docx_file):
        print(f"❌ Arquivo {docx_file} não encontrado na raiz!")
        sys.exit(1)
    
    analyze_docx(docx_file)

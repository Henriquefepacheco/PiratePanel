import os
import json
import random
import requests
import time
import re
import urllib.parse
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Carrega varíaveis
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

# --- CONFIGURAÇÕES ---
CLR_G = " [92m"  # Verde
CLR_R = " [91m"  # Vermelho
CLR_Y = " [93m"  # Amarelo
CLR_C = " [96m"  # Ciano
CLR_B = " [94m"  # Azul
CLR_W = " [0m"  # Reset

def cyber_banner():
    print(f"{CLR_C}")
    print(r"  _____  ______ ______ _____    __          __ _____  _____  ")
    print(r" |  __ \|  ____|  ____|  __ \   \ \        / /|  __ \|  __ \ ")
    print(r" | |  | | |__  | |__  | |__) |   \ \  /\  / / | |__) | |__) |")
    print(r" | |  | |  __| |  __| |  ___/     \ \/  \/ /  |  ___/|  ___/ ")
    print(r" | |__| | |____| |____| |          \  /\  /   | |    | |     ")
    print(r" |_____/|______|______|_|           \/  \/    |_|    |_|     ")
    print(f"\n [ SYSTEM STATE: ACTIVE ] [ VERSION: 2.1.2-DEEP ]")
    print(f" [ MODULE: DEEP_WPP_HUNTER ]")
    print("-" * 65 + f"{CLR_W}")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
    "VITE_SUPABASE_SERVICE_ROLE_KEY"
)
BASE_URL = f"{supabase_url}/rest/v1"
headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}",
    "Content-Type": "application/json",
}


def extract_whatsapp(text):
    if not text:
        return None

    # 1. Procurar por links diretos (mais confiáveis)
    wpp_link = re.search(
        r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=|whatsapp\.com/send\?phone=)(\d{10,13})",
        text,
    )
    if wpp_link:
        return wpp_link.group(1)

    # 2. Procurar por padrões BR no texto limpo (apenas dígitos)
    # Mas fazemos isso linha a linha ou em blocos pequenos para evitar concatenar números distantes
    # Padrões comuns: (XX) 9XXXX-XXXX, XX 9XXXX-XXXX, 55XX9XXXXXXXX
    # Agora incluindo telefones fixos: (XX) XXXX-XXXX
    raw_phones = re.findall(
        r"(?:\+?55\s?)?\(?\d{2}\)?\s?[2-59]\d{3,4}[-\s]?\d{4}", text
    )
    for raw in raw_phones:
        clean = re.sub(r"[^\d]", "", raw)
        if len(clean) == 10 and not clean.startswith("55"):
            clean = "55" + clean  # Fixo sem 55
        if len(clean) == 11 and not clean.startswith("55"):
            clean = "55" + clean  # Celular sem 55
        if len(clean) == 12 and clean.startswith("55"):
            return clean  # 55 + 10 (Fixo)
        if len(clean) == 13 and clean.startswith("55"):
            return clean  # 55 + 11 (Celular)

    return None


def deep_search_wpp(handle):
    queries = [
        f'site:instagram.com "{handle}" whatsapp',
        f'"{handle}" contato instagram whatsapp',
    ]

    for query in queries:
        try:
            url = f"https://br.search.yahoo.com/search?p={urllib.parse.quote(query)}"
            resp = requests.get(
                url, headers={"User-Agent": random.choice(USER_AGENTS)}, timeout=10
            )
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                # Analisamos apenas os snippets de texto real
                containers = soup.find_all(
                    ["div", "p", "span"], class_=["compText", "fc-sub", "algo"]
                )
                for c in containers:
                    wpp = extract_whatsapp(c.text)
                    if wpp:
                        return wpp
            time.sleep(random.uniform(0.5, 1.0))  # Para buscas no mesmo lead
        except:
            continue
    return None


def run_deep_scan():
    print(f"{CLR_G}=== PROTOCOLO DEEP_WPP_HUNTER ATIVADO ==={CLR_W}")

    # Fases de Varredura
    # Fase 1: Qualified sem WhatsApp (Prioridade Máxima)
    # Fase 2: Discovered (Novos)
    # Fase 3: Lost (Recuperação)

    fases = [
        ("QUALIFIED", "current_state=eq.qualified&metadata->>whatsapp=is.null"),
        ("DISCOVERED", "current_state=eq.discovered"),
    ]

    total_encontrados = 0

    for nome_fase, query_fase in fases:
        print(f"\n{CLR_B}[ FASE: {nome_fase} ]{CLR_W}")
        try:
            res = requests.get(
                f"{BASE_URL}/leads?{query_fase}&select=*", headers=headers
            )
            leads = res.json()
            if not leads:
                continue

            print(f"[*] Analisando {len(leads)} leads...")

            for idx, lead in enumerate(leads, 1):
                handle = lead.get("handle")
                lead_id = lead.get("id")
                metadata = lead.get("metadata", {})

                print(f"[{idx}/{len(leads)}] SCANNING {handle}...", end=" ", flush=True)

                # Tenta primeiro no snippet já salvo
                wpp = extract_whatsapp(metadata.get("raw_snippet", ""))

                if not wpp:
                    wpp = deep_search_wpp(handle)

                if wpp:
                    print(f"{CLR_G}FOUND: {wpp}{CLR_W}")

                    niche = metadata.get("niche")
                    niche_str = niche if niche else "seu setor"
                    draft = f"Oi, tudo bem? Vi o perfil de {niche_str}... são vocês que gerenciam ou tem agência?"

                    metadata.update(
                        {
                            "whatsapp": wpp,
                            "whatsapp_ready": True,
                            "wpp_source": "deep_scan",
                            "whatsapp_draft": draft,
                        }
                    )
                    update_data = {"metadata": metadata}

                    # Se era discovered, talvez devêssemos rodar o qualificador junto?
                    # Por enquanto, apenas salvamos o WPP.
                    requests.patch(
                        f"{BASE_URL}/leads?id=eq.{lead_id}",
                        headers=headers,
                        json=update_data,
                    )
                    total_encontrados += 1
                else:
                    print(f"{CLR_R}NOT_FOUND{CLR_W}")

                # Delay para não ser bloqueado pelo Yahoo
                time.sleep(random.uniform(2, 5))

        except Exception as e:
            print(f"{CLR_R}ERRO NA FASE {nome_fase}: {e}{CLR_W}")

    print(
        f"\n{CLR_G}=== VARREDURA FINALIZADA: {total_encontrados} WHATSAPPS ENCONTRADOS ==={CLR_W}"
    )


if __name__ == "__main__":
    cyber_banner()
    run_deep_scan()

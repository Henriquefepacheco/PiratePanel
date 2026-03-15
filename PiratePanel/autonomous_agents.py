import os
import json
import random
import requests
import time
import re
import urllib.parse
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Carrega varíaveis do .env na pasta raiz do projeto para rodar localmente
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

# --- ROTATION_CONFIG ---
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/121.0.0.0 Safari/537.36",
]

# --- CONFIGURAÇÕES DE ESTÉTICA HACKER ---
CLR_G = "[92m"  # Verde
CLR_R = "[91m"  # Vermelho
CLR_Y = "[93m"  # Amarelo
CLR_C = "[96m"  # Ciano
CLR_B = "[94m"  # Azul
CLR_W = "[0m"  # Reset (Branco)


def cyber_banner():
    print(f"{CLR_G}")
    print(r"  _    _ _    _ _   _ _______ ______ _____  ")
    print(r" | |  | | |  | | \ | |__   __|  ____|  __ \ ")
    print(r" | |__| | |  | |  \| |  | |  | |__  | |__) |")
    print(r" |  __  | |  | | . ` |  | |  |  __| |  _  / ")
    print(r" | |  | | |__| | |\  |  | |  | |____| | \ \ ")
    print(r" |_|  |_|\____/|_| \_|  |_|  |______|_|  \_" + "\\")
    print(f"\n [ SYSTEM STATE: ACTIVE ] [ VERSION: 4.1.2-CYBER ]")
    print(f" [ MODULE: THE_HUNTER_GRID ]")
    print("-" * 50 + f"{CLR_W}")


# --- CONFIGURAÇÕES DO SUPABASE ---
supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
    "VITE_SUPABASE_SERVICE_ROLE_KEY"
)

if not supabase_url or not supabase_key:
    print(f"{CLR_R}[x] FATAL_ERROR: Supabase credentials not found!{CLR_W}")
    exit(1)

BASE_URL = f"{supabase_url}/rest/v1"

headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def run_hunter():
    print(
        f"{CLR_C}[-]{CLR_W} SEARCH_MODE: Scanning the grid for new nodes (Target: 500/cycle)..."
    )

    try:
        select_headers = headers.copy()
        select_headers.pop("Prefer", None)
        existing_res = requests.get(
            f"{BASE_URL}/leads?select=handle", headers=select_headers
        )
        if existing_res.status_code == 200:
            existing_handles = {lead["handle"] for lead in existing_res.json()}
        else:
            existing_handles = set()
    except Exception as e:
        print(f"{CLR_Y}WARNING: Anti-Spam check failed: {e}{CLR_W}")
        existing_handles = set()

    qnt_desejada = 500
    print(
        f"{CLR_B}[i]{CLR_W} GRID_STATUS: {len(existing_handles)} nodes recorded. Target: {qnt_desejada} new nodes."
    )

    niche_mapping = {
        "Dentista": "dentista",
        "Odontologia": "dentista",
        "Ortodontista": "dentista",
        "Advogado": "advogado",
        "Advocacia": "advogado",
        "Advogado trabalhista": "advogado",
        "Clínica": "clinica",
        "Estética": "clinica",
        "Dermatologista": "clinica",
        "Fisioterapeuta": "fisioterapeuta",
        "Psicólogo": "psicologo",
        "Nutricionista": "nutricionista",
        "Personal trainer": "personal",
        "Arquiteto": "arquiteto",
        "Médico": "medico",
        "Contador": "contador",
        "Corretor de imóveis": "corretor",
        "Fotógrafo": "fotografo",
    }
    locais = [
        "São Paulo",
        "Rio de Janeiro",
        "Belo Horizonte",
        "Curitiba",
        "Porto Alegre",
        "Brasília",
        "Goiânia",
        "Recife",
        "Fortaleza",
        "Salvador",
    ]

    queries = []
    for _ in range(50):
        n = random.choice(list(niche_mapping.keys()))
        l = random.choice(locais)
        queries.append((f"site:instagram.com {n} {l}", niche_mapping[n]))
    random.shuffle(queries)

    new_leads = []
    for query, niche in queries:
        if len(new_leads) >= qnt_desejada:
            break

        for page in range(3):
            if len(new_leads) >= qnt_desejada:
                break
            start = page * 10 + 1
            print(f"{CLR_C}[-]{CLR_W} SEARCHING: {query} [Page {page + 1}]...")
            try:
                search_url = f"https://br.search.yahoo.com/search?p={urllib.parse.quote(query)}&b={start}"
                headers_yahoo = {
                    "User-Agent": f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/{random.randint(110, 130)}.0"
                }
                resp = requests.get(search_url, headers=headers_yahoo, timeout=12)
                soup = BeautifulSoup(resp.text, "html.parser")
                results = soup.find_all("div", class_="dd algo") or soup.find_all(
                    "div", class_="algo"
                )

                found_on_page = 0
                for container in results:
                    link_tag = container.find("a")
                    if not link_tag:
                        continue
                    raw_url = link_tag.get("href", "")
                    if "RU=" in raw_url:
                        ru_match = re.search(r"RU=([^/&]+)", raw_url)
                        if ru_match:
                            raw_url = urllib.parse.unquote(ru_match.group(1))

                    match = re.search(r"instagram\.com/([^/?]+)", raw_url)
                    if match:
                        raw_handle = match.group(1).lower()
                        if raw_handle in [
                            "p",
                            "reel",
                            "explore",
                            "tags",
                            "reels",
                            "stories",
                            "tv",
                            "channel",
                            "about",
                            "accounts",
                            "directory",
                        ]:
                            continue
                        handle = f"@{raw_handle}"
                        if handle in existing_handles:
                            continue
                        existing_handles.add(handle)

                        snippet_tag = container.find(
                            "div", class_="compText"
                        ) or container.find("p")
                        snippet_text = snippet_tag.text if snippet_tag else ""

                        new_leads.append(
                            {
                                "handle": handle,
                                "platform": "instagram",
                                "current_state": "discovered",
                                "metadata": {
                                    "niche": niche,
                                    "source_url": raw_url,
                                    "raw_snippet": snippet_text,
                                },
                            }
                        )
                        found_on_page += 1
                if found_on_page == 0:
                    break
                time.sleep(random.uniform(1.0, 2.0))
            except:
                break

    # --- UPSERT DE LEADS (PROTOCOLO ANTI-DUPLICIDADE) ---
    if new_leads:
        sync_headers = headers.copy()
        sync_headers["Prefer"] = "resolution=ignore-duplicates"
        res = requests.post(f"{BASE_URL}/leads", headers=sync_headers, json=new_leads)
        if res.status_code >= 400:
            print(f"{CLR_R}[!] SYNC_ERROR: {res.text}{CLR_W}")
        else:
            print(
                f"{CLR_G}[+]{CLR_W} GRID_SYNC: {len(new_leads)} nodes synchronized to central vault."
            )
    else:
        print(f"{CLR_B}[i]{CLR_W} IDLE: No new nodes detected in this sector.")


def extract_metrics_from_text(text):
    """Deep Intelligence Extraction: Parsers search engine snippets for counts and contacts."""
    if not text:
        return None, None, None
    text_work = text.lower().replace(".", "").replace(",", "")

    followers = 0
    posts = 0
    whatsapp = None

    # --- METRICS EXTRACTION ---
    f_match = re.search(
        r"([\d.]+)\s*(?:mil|k|m)?\s*(?:seguidores|followers)", text_work
    )
    if f_match:
        val_str = f_match.group(1)
        mult = 1
        if (
            "mil" in text_work[max(0, f_match.start() - 5) : f_match.end() + 10]
            or "k" in text_work[max(0, f_match.start() - 5) : f_match.end() + 10]
        ):
            mult = 1000
        if (
            "m" in text_work[max(0, f_match.start() - 5) : f_match.end() + 10]
            and "mil" not in text_work
        ):
            mult = 1000000
        try:
            followers = int(float(val_str) * mult)
        except:
            pass

    p_match = re.search(r"([\d.]+)\s*(?:publicações|posts|publicacoes)", text_work)
    if p_match:
        try:
            posts = int(p_match.group(1))
        except:
            pass

    # --- WHATSAPP EXTRACTION (ULTRA-REGEX) ---
    # Patterns: wa.me/, api.whatsapp, linktr.ee, bit.ly, ou numeral direto
    # Link pattern
    wpp_link = re.search(
        r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=|whatsapp\.com/send\?phone=)(\d{10,13})",
        text,
    )
    if wpp_link:
        whatsapp = wpp_link.group(1)
    else:
        # Phone pattern (BR format: (XX) 9XXXX-XXXX or simple 55XXXXXXXXXXX)
        # We look for 10-11 digits that might be prefixed by 55
        phone_patterns = [
            r"55\d{10,11}",  # 5511988887777
            r"(?:\d{2})\s?9\d{8}",  # 11 988887777
            r"\d{11}",  # 11988887777
        ]
        for pat in phone_patterns:
            find = re.search(
                pat,
                text.replace(" ", "")
                .replace("-", "")
                .replace("(", "")
                .replace(")", ""),
            )
            if find:
                num = find.group(0)
                if len(num) == 11 and num.startswith("55"):
                    pass  # skip, already handled
                elif len(num) == 11:
                    num = "55" + num  # 119... -> 55119...
                elif len(num) == 10:
                    num = "55" + num  # 11... -> 5511...
                whatsapp = num
                break

    return followers, posts, whatsapp


def get_insta_metrics_deep_search(handle):
    """Contingency: Search for the handle to get its metadata snippet."""
    # Focamos em encontrar o link de contato explicitamente
    query = f'site:instagram.com "{handle}" whatsapp OR "api.whatsapp.com"'
    try:
        search_url = f"https://br.search.yahoo.com/search?p={urllib.parse.quote(query)}"
        resp = requests.get(
            search_url, headers={"User-Agent": random.choice(USER_AGENTS)}, timeout=10
        )
        if resp.status_code == 200:
            return extract_metrics_from_text(resp.text)
    except:
        pass
    return None, None, None


def run_qualifier():
    print(
        f"{CLR_Y}[>] INTELLIGENCE_MODE: Extracting metrics and contact protocols...{CLR_W}"
    )
    try:
        select_headers = headers.copy()
        select_headers.pop("Prefer", None)
        response = requests.get(
            f"{BASE_URL}/leads?current_state=eq.discovered&select=*",
            headers=select_headers,
        )
        response.raise_for_status()
        leads_brutos = response.json()

        if not leads_brutos:
            print(f"{CLR_B}[i]{CLR_W} IDLE: No nodes awaiting extraction.")
            return 0

        aprovados = 0
        aprovados_wpp = 0

        for idx, lead in enumerate(leads_brutos, 1):
            lead_id = lead.get("id")
            handle = lead.get("handle")
            metadata = lead.get("metadata", {})
            snippet = metadata.get("raw_snippet", "")

            print(
                f"{CLR_C}[{idx}/{len(leads_brutos)}]{CLR_W} EXTRACTING {handle}...",
                end=" ",
            )

            # Phase 1: Snippet Intelligence
            f_count, p_count, wpp = extract_metrics_from_text(snippet)
            source = "snippet_intelligence"

            # Phase 2: Deep Search if missing
            if not f_count or not p_count:
                print(f"{CLR_Y}DEEP_SCAN...{CLR_W}", end=" ")
                f_count, p_count, wpp_deep = get_insta_metrics_deep_search(handle)
                if wpp_deep:
                    wpp = wpp_deep
                source = "deep_search_intelligence"

            if f_count and p_count:
                if p_count >= 40 and f_count >= 2000:
                    metadata.update(
                        {
                            "followers": f_count,
                            "posts": p_count,
                            "qualifier_source": source,
                        }
                    )

                    if wpp:
                        metadata.update({"whatsapp": wpp, "whatsapp_ready": True})
                        aprovados_wpp += 1
                        print(
                            f"{CLR_G}PASS{CLR_W} [{f_count}f, {p_count}p] {CLR_Y}[WPP_FOUND: {wpp}]{CLR_W}"
                        )
                    else:
                        print(
                            f"{CLR_B}PASS{CLR_W} [{f_count}f, {p_count}p] {CLR_R}(No WPP){CLR_W}"
                        )

                    score = min(100, int(p_count) + (int(f_count) // 100))
                    patch_data = {
                        "current_state": "qualified",
                        "conversion_score": score,
                        "metadata": metadata,
                    }
                    aprovados += 1
                else:
                    print(f"{CLR_R}REJECTED{CLR_W} [{f_count}f, {p_count}p]")
                    patch_data = {
                        "current_state": "lost",
                        "metadata": {
                            **metadata,
                            "rejection_reason": f"Low authority ({f_count}f)",
                        },
                    }
            else:
                print(f"{CLR_R}RETRY_LATER{CLR_W}")
                continue

            requests.patch(
                f"{BASE_URL}/leads?id=eq.{lead_id}", headers=headers, json=patch_data
            )

        print(
            f"{CLR_G}[+]{CLR_W} GRID_STABILIZED: {aprovados} nodes stabilized ({aprovados_wpp} WPP direct)."
        )
        return aprovados_wpp
    except Exception as e:
        print(f"{CLR_R}QUALIFIER_FATAL: {e}{CLR_W}")
        return 0


def run_contactor():
    print(f"{CLR_Y}[>] DRAFT_MODE: Building response strings...{CLR_W}")
    try:
        select_headers = headers.copy()
        select_headers.pop("Prefer", None)
        response = requests.get(
            f"{BASE_URL}/leads?current_state=eq.qualified&metadata->>whatsapp_draft=is.null&select=*",
            headers=select_headers,
        )
        leads = response.json()

        if not leads:
            print(f"{CLR_B}[i]{CLR_W} IDLE: No nodes awaiting scripts.")
            return

        for lead in leads:
            lead_id = lead.get("id")
            handle = lead.get("handle")
            metadata = lead.get("metadata", {})
            niche = metadata.get("niche", "profissional")

            ig_templates = [
                f"Oi! Vi seu perfil de {niche} aqui e achei incrível. Teria um minuto para uma dúvida rápida?",
                f"Opa! Acabei de ver seu trabalho como {niche}. Posso te fazer uma pergunta rápida sobre o seu perfil?",
            ]
            wpp_templates = [
                f"Oi, tudo bem? Vi seu Instagram agora há pouco e resolvi te chamar por aqui. Tudo bem?"
            ]

            metadata.update(
                {
                    "instagram_draft": random.choice(ig_templates),
                    "whatsapp_draft": random.choice(wpp_templates),
                    "whatsapp_ready": bool(metadata.get("whatsapp")),
                }
            )

            requests.patch(
                f"{BASE_URL}/leads?id=eq.{lead_id}",
                headers=headers,
                json={"metadata": metadata},
            )
            print(f"{CLR_G}[+]{CLR_W} DRAFT_SECURED: {handle} copy deployed to CRM.")

        print(
            f"{CLR_G}[+]{CLR_W} BATCH_COMPLETE: All target nodes uploaded to ManyChat Outbox."
        )
    except Exception as e:
        print(f"{CLR_R}CONTACTOR_FATAL: {e}{CLR_W}")


META_WHATSAPP = 100

if __name__ == "__main__":
    cyber_banner()
    tentativa = 1
    total_local_wpp = 0

    while total_local_wpp < META_WHATSAPP:
        print(
            f"\n{CLR_G}[ CYCLE #{tentativa} ]{CLR_W} Progress: {total_local_wpp}/{META_WHATSAPP}"
        )
        run_hunter()
        total_local_wpp += run_qualifier()
        run_contactor()

        if total_local_wpp < META_WHATSAPP:
            tentativa += 1
            print(f"{CLR_Y}SYSTEM_COOLDOWN: Next scan in 15s...{CLR_W}")
            time.sleep(15)

    print(
        f"{CLR_G}GOAL_ACHIEVED: {total_local_wpp} WPP nodes secured for outreach.{CLR_W}"
    )

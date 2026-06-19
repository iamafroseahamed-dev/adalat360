"""Vercel serverless function: GET /api/todays-cause-list

Fast path  → read today's rows from Supabase (sub-second).
Slow path  → download XML from MHC, store in Supabase, return rows.
             Only runs once per day (first request) or after a forced refresh
             (?refresh=1 query parameter).
"""
from __future__ import annotations

import json
import os
import xml.etree.ElementTree as ET
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler
from typing import Any, Dict, List, Set, Tuple
from urllib.parse import parse_qs, urlparse

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ── Supabase config ────────────────────────────────────────────────────────────
# Loaded lazily inside do_GET so missing env vars return 503 instead of crashing
# the module at import time (which would cause Vercel to return 500).
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

def _sb_headers() -> dict:
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }

SB_TIMEOUT  = 30
BATCH_SIZE  = 500
MHC_XML_BASE = (
    'https://mhc.tn.gov.in/judis/clists/clists-madras/causelists/xml/cause_{date}.xml'
)


# ── Supabase helpers ───────────────────────────────────────────────────────────

def _sb_latest_date(up_to: str) -> str | None:
    """Return the most recent cause_date in Supabase that is <= up_to."""
    url = (
        f'{SUPABASE_URL}/rest/v1/daily_cause_list'
        f'?cause_date=lte.{up_to}'
        '&court_name=eq.Madras%20High%20Court'
        '&bench=eq.Chennai'
        '&select=cause_date'
        '&order=cause_date.desc'
        '&limit=1'
    )
    resp = requests.get(url, headers=_sb_headers(), timeout=SB_TIMEOUT)
    resp.raise_for_status()
    rows = resp.json() or []
    return rows[0]['cause_date'] if rows else None


def _sb_fetch_date(cause_date: str) -> List[Dict[str, Any]]:
    """Fetch ALL cause list rows for a specific date from Supabase (paginated).
    Only retrieves columns consumed by the frontend to reduce payload size.
    """
    # Columns used by TodaysCauseList + TodaysListings (omits raw_text, raw_data, source_url, etc.)
    COLS = 'cause_date,court_name,bench,court_hall,item_number,case_number,cnr_number,petitioner,respondent,party_names,judge_name,last_hearing_or_stage,counsel_name'
    all_rows: List[Dict[str, Any]] = []
    page_size = 1000  # Supabase default max per request
    offset = 0
    while True:
        url = (
            f'{SUPABASE_URL}/rest/v1/daily_cause_list'
            f'?cause_date=eq.{cause_date}'
            '&court_name=eq.Madras%20High%20Court'
            '&bench=eq.Chennai'
            f'&select={COLS}'
            '&order=court_hall.asc,item_number.asc'
            f'&limit={page_size}&offset={offset}'
        )
        resp = requests.get(url, headers=_sb_headers(), timeout=SB_TIMEOUT)
        resp.raise_for_status()
        page = resp.json() or []
        all_rows.extend(page)
        if len(page) < page_size:
            break  # last page
        offset += page_size
    return all_rows


def _sb_delete_today(cause_date: str) -> None:
    url = (
        f'{SUPABASE_URL}/rest/v1/daily_cause_list'
        f'?cause_date=eq.{cause_date}'
        '&court_name=eq.Madras%20High%20Court'
        '&bench=eq.Chennai'
    )
    resp = requests.delete(url, headers=_sb_headers(), timeout=SB_TIMEOUT)
    resp.raise_for_status()


def _sb_insert(rows: List[Dict[str, Any]]) -> None:
    url = f'{SUPABASE_URL}/rest/v1/daily_cause_list'
    headers = {**_sb_headers(), 'Prefer': 'return=minimal'}
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        resp = requests.post(url, headers=headers, json=batch, timeout=SB_TIMEOUT)
        resp.raise_for_status()


# ── XML parser ─────────────────────────────────────────────────────────────────


def _parse_mhc_xml(xml_bytes: bytes, cause_date_str: str, xml_url: str) -> List[Dict[str, Any]]:
    root = ET.fromstring(xml_bytes)
    seen: Set[Tuple[str, str, str, str]] = set()
    rows: List[Dict[str, Any]] = []

    for court in root.iter('court'):
        court_hall = court.findtext('courtno') or ''
        judge_name = court.findtext('judge1') or ''

        for stage in court.iter('stage'):
            stage_name = stage.findtext('stagename') or ''

            for case in stage.iter('casedetails'):
                case_type = case.findtext('mcasetype') or ''
                case_no = case.findtext('mcaseno') or ''
                case_year = case.findtext('mcaseyr') or ''
                case_number = f'{case_type}/{case_no}/{case_year}'
                petitioner = case.findtext('pname') or ''
                respondent = case.findtext('rname') or ''
                item_number = case.findtext('serial_no') or ''
                counsel_name = case.findtext('mpadv') or ''

                dedup_key = (cause_date_str, court_hall, item_number, case_number)
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                party_names = ' | '.join(filter(None, [petitioner, respondent]))

                rows.append({
                    'cause_date': cause_date_str,
                    'source_type': 'xml',
                    'source_url': xml_url,
                    'court_name': 'Madras High Court',
                    'bench': 'Chennai',
                    'court_hall': court_hall,
                    'item_number': item_number,
                    'case_number': case_number,
                    'cnr_number': None,
                    'petitioner': petitioner,
                    'respondent': respondent,
                    'party_names': party_names,
                    'judge_name': judge_name,
                    'section': None,
                    'district': None,
                    'prayer': None,
                    'last_hearing_or_stage': stage_name,
                    'counsel_name': counsel_name,
                    'raw_text': None,
                    'raw_data': None,
                    'import_status': 'parsed',
                    'updated_at': datetime.utcnow().isoformat(),
                })

    return rows


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        # Guard: fail fast with 503 if Supabase credentials are not configured
        if not SUPABASE_URL or not SUPABASE_KEY:
            self._json({
                'detail': (
                    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are not set. '
                    'Add them in the Vercel project settings → Environment Variables.'
                )
            }, 503)
            return

        today      = date.today()
        cause_date = today.isoformat()
        qs         = parse_qs(urlparse(self.path).query)
        force      = qs.get('refresh', ['0'])[0] == '1'

        print(f'[cause-list] {datetime.utcnow().isoformat()} | date={cause_date} | force={force}')

        # ── Fast path: Supabase ────────────────────────────────────────────────
        if not force:
            try:
                # Find most recent available date (today or earlier)
                latest = _sb_latest_date(cause_date)
                if latest:
                    rows = _sb_fetch_date(latest)
                    if rows:
                        print(f'[cause-list] Supabase hit: {len(rows)} rows for {latest}')
                        self._json(rows)
                        return
                print('[cause-list] Supabase empty — fetching from MHC')
            except Exception as exc:
                print(f'[cause-list] Supabase read failed ({exc}) — falling back to MHC')
        else:
            print('[cause-list] Force refresh — skipping Supabase cache')

        # ── Slow path: download XML from MHC ──────────────────────────────────
        xml_url = MHC_XML_BASE.format(date=today.strftime('%d%m%Y'))
        print(f'[cause-list] Downloading: {xml_url}')

        try:
            xml_resp = requests.get(xml_url, timeout=(10, 55), verify=False)
            xml_resp.raise_for_status()
            print(f'[cause-list] HTTP {xml_resp.status_code}')
        except requests.exceptions.Timeout as exc:
            self._json({'detail': f"MHC XML timed out: {exc}"}, 504)
            return
        except requests.RequestException as exc:
            self._json({'detail': f"MHC XML unavailable: {exc}"}, 503)
            return

        try:
            parsed_rows = _parse_mhc_xml(xml_resp.content, cause_date, xml_url)
        except ET.ParseError as exc:
            preview = xml_resp.content[:200].decode('utf-8', errors='replace')
            self._json({'detail': f'XML malformed: {exc} | preview: {preview}'}, 502)
            return
        except Exception as exc:
            self._json({'detail': f'XML parse error: {exc}'}, 502)
            return

        if not parsed_rows:
            self._json({'detail': "No records found in today's cause list."}, 404)
            return

        print(f'[cause-list] Parsed {len(parsed_rows)} rows — storing in Supabase')

        # ── Store in Supabase (errors are non-fatal) ──────────────────────────
        try:
            if force:
                _sb_delete_today(cause_date)
            _sb_insert(parsed_rows)
            print('[cause-list] Supabase write OK')
        except Exception as exc:
            print(f'[cause-list] Supabase write failed ({exc}) — returning data anyway')

        self._json(parsed_rows)

    def _json(self, data: Any, status: int = 200) -> None:
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt: str, *args: Any) -> None:  # suppress default access logs
        pass

"""Vercel serverless function: POST /api/case-details/search

Proxies the eCourtsIndia partner search API. Keeps ECOURTS_API_TOKEN
server-side (never exposed to the browser) and performs the automatic
fallback search when the typed case-type does not match the eCourts taxonomy.

Payload: { "caseNo": "4232", "caseYear": "2024", "caseTypes": "WP_C" }

Returns: {
  "success": true,
  "totalHits": <int>,
  "caseData": <first result | null>,
  "usedFallback": <bool>
}
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler
from typing import Any, Dict, Optional

import requests

ECOURTS_SEARCH = 'https://webapi.ecourtsindia.com/api/partner/search'
COURT_CODES    = 'HCMA01'


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        try:
            self._handle()
        except Exception as exc:  # noqa: BLE001 - surface as JSON error
            self._json({'success': False, 'message': f'Unexpected error: {exc}'}, 500)

    def _handle(self) -> None:
        token = os.environ.get('ECOURTS_API_TOKEN', '').strip()
        if not token:
            self._json({'success': False, 'message': 'ECOURTS_API_TOKEN is not configured on the server.'}, 500)
            return

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._json({'success': False, 'message': 'Invalid JSON body.'}, 400)
            return

        case_no   = str(body.get('caseNo') or '').strip()
        case_year = str(body.get('caseYear') or '').strip()
        case_types = str(body.get('caseTypes') or '').strip()

        if not case_no or not case_year:
            self._json({'success': False, 'message': 'caseNo and caseYear are required.'}, 400)
            return

        headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json',
        }
        query = f'/{case_no}/{case_year}'

        # Primary search (with caseTypes filter)
        primary = self._search(headers, query, case_types)
        if primary is None:
            self._json({'success': False, 'message': 'Could not reach the eCourts server. Please try again later.'}, 503)
            return

        total_hits = int(primary.get('totalHits') or 0)
        results = primary.get('results') or []
        used_fallback = False

        # Fallback: drop the caseTypes filter when nothing matched the taxonomy
        if total_hits == 0 and case_types:
            fallback = self._search(headers, query, None)
            if fallback is not None:
                total_hits = int(fallback.get('totalHits') or 0)
                results = fallback.get('results') or []
                used_fallback = True

        self._json({
            'success': True,
            'totalHits': total_hits,
            'caseData': results[0] if results else None,
            'usedFallback': used_fallback,
        })

    def _search(
        self,
        headers: Dict[str, str],
        query: str,
        case_types: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        params: Dict[str, str] = {'query': query, 'courtCodes': COURT_CODES}
        if case_types:
            params['caseTypes'] = case_types
        try:
            resp = requests.get(
                ECOURTS_SEARCH,
                params=params,
                headers=headers,
                timeout=(15, 25),
            )
            resp.raise_for_status()
            payload = resp.json()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            return None
        except requests.RequestException:
            return None
        except Exception:
            return None

        # The upstream wraps the useful fields under "data" in some deployments.
        data = payload.get('data') if isinstance(payload, dict) and 'data' in payload else payload
        if not isinstance(data, dict):
            return {'totalHits': 0, 'results': []}
        return {
            'totalHits': data.get('totalHits', 0),
            'results': data.get('results', []),
        }

    def _json(self, data: Any, status: int = 200) -> None:
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

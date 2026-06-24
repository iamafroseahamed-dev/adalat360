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
        if primary.get('rateLimited'):
            self._json({'success': False, 'rateLimited': True, 'message': 'eCourts rate limit reached. Please retry shortly.'}, 429)
            return
        if primary.get('error'):
            self._json({'success': False, 'message': 'Could not reach the eCourts server. Please try again later.'}, 503)
            return

        total_hits = int(primary.get('totalHits') or 0)
        results = primary.get('results') or []
        request_id = primary.get('requestId')
        used_fallback = False

        # Fallback: drop the caseTypes filter when nothing matched the taxonomy
        if total_hits == 0 and case_types:
            fallback = self._search(headers, query, None)
            if fallback.get('rateLimited'):
                self._json({'success': False, 'rateLimited': True, 'message': 'eCourts rate limit reached. Please retry shortly.'}, 429)
                return
            if not fallback.get('error'):
                total_hits = int(fallback.get('totalHits') or 0)
                results = fallback.get('results') or []
                request_id = fallback.get('requestId') or request_id
                used_fallback = True

        self._json({
            'success': True,
            'totalHits': total_hits,
            'caseData': results[0] if results else None,
            'usedFallback': used_fallback,
            'requestId': request_id,
        })

    def _search(
        self,
        headers: Dict[str, str],
        query: str,
        case_types: Optional[str],
    ) -> Dict[str, Any]:
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
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            return {'error': 'unreachable'}
        except requests.RequestException:
            return {'error': 'unreachable'}

        # Surface 429 so the client can apply exponential backoff
        if resp.status_code == 429:
            return {'rateLimited': True}

        try:
            resp.raise_for_status()
            payload = resp.json()
        except Exception:
            return {'error': 'unreachable'}

        # The upstream wraps the useful fields under "data" in some deployments.
        data = payload.get('data') if isinstance(payload, dict) and 'data' in payload else payload
        if not isinstance(data, dict):
            return {'totalHits': 0, 'results': [], 'requestId': None}

        # request_id may live under top-level meta or nested data.meta
        meta = (payload.get('meta') if isinstance(payload, dict) else None) or data.get('meta') or {}
        request_id = meta.get('request_id') if isinstance(meta, dict) else None

        return {
            'totalHits': data.get('totalHits', 0),
            'results': data.get('results', []),
            'requestId': request_id,
        }

    def _json(self, data: Any, status: int = 200) -> None:
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

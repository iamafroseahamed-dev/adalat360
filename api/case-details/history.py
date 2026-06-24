"""Vercel serverless function: GET /api/case-details/history?cnr=<CNR>

Proxies the eCourtsIndia partner *case* API (full litigation history by CNR).
Keeps ECOURTS_API_TOKEN server-side (never exposed to the browser).

    GET https://webapi.ecourtsindia.com/api/partner/case/{cnr_number}
    Authorization: Bearer {ECOURTS_API_TOKEN}

Query: ?cnr=HCMA010118052024

Returns: {
  "success": true,
  "data": { ...courtCaseData + arrays... },
  "requestId": <str | null>
}
"""
from __future__ import annotations

import json
import os
import re
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.parse import urlparse, parse_qs

import requests

ECOURTS_CASE = 'https://webapi.ecourtsindia.com/api/partner/case'


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        try:
            self._handle()
        except Exception as exc:  # noqa: BLE001 - surface as JSON error
            self._json({'success': False, 'message': f'Unexpected error: {exc}'}, 500)

    def _handle(self) -> None:
        token = os.environ.get('ECOURTS_API_TOKEN', '').strip()
        if not token:
            self._json({'success': False, 'message': 'ECOURTS_API_TOKEN is not configured on the server.'}, 500)
            return

        qs = parse_qs(urlparse(self.path).query)
        cnr = (qs.get('cnr', [''])[0] or '').strip()
        # CNR is alphanumeric only — guard against path traversal / injection.
        cnr = re.sub(r'[^A-Za-z0-9]', '', cnr)
        if not cnr:
            self._json({'success': False, 'message': 'cnr is required.'}, 400)
            return

        headers = {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/json',
        }
        try:
            resp = requests.get(f'{ECOURTS_CASE}/{cnr}', headers=headers, timeout=(15, 30))
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            self._json({'success': False, 'message': 'Could not reach the eCourts server. Please try again later.'}, 503)
            return
        except requests.RequestException:
            self._json({'success': False, 'message': 'Could not reach the eCourts server. Please try again later.'}, 503)
            return

        if resp.status_code == 429:
            self._json({'success': False, 'rateLimited': True, 'message': 'eCourts rate limit reached. Please retry shortly.'}, 429)
            return
        if resp.status_code == 404:
            self._json({'success': True, 'data': None, 'requestId': None})
            return

        try:
            resp.raise_for_status()
            payload = resp.json()
        except Exception:
            self._json({'success': False, 'message': 'Unable to retrieve case history from eCourts.'}, 502)
            return

        # Upstream wraps the useful fields under "data" in some deployments.
        data = payload.get('data') if isinstance(payload, dict) and 'data' in payload else payload
        meta = (payload.get('meta') if isinstance(payload, dict) else None) or \
               (data.get('meta') if isinstance(data, dict) else None) or {}
        request_id = meta.get('request_id') if isinstance(meta, dict) else None

        self._json({'success': True, 'data': data, 'requestId': request_id})

    def _json(self, data: Any, status: int = 200) -> None:
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

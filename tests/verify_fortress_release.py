#!/usr/bin/env python3
"""Read-only verification. --http fails until the TEST sites serve these candidates."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
from urllib.parse import urlsplit
import zipfile

RACE = 'https://rc-drive-test-ipoower.pages.dev'
VAULT = 'https://cv-drive-test-ipoower.pages.dev'
EXPECTED = [
    ('race-final.zip', RACE, '7e5cd990f7f736ab77220bb2b35fad643407e672', '5ceae635579aadf2383c0700685d0485ad01947e1826f611123281ae9473993e', 'ea1fe1399127a48e26a358c1bf9710503457fc40756c7e9e8a393ad5fefedd87', 24),
    ('vault-final.zip', VAULT, '51031e8d1a4b69565bc36830f6ef8efbfd986ca3', '73c7eaf61474acda4c880c83ebd92d118e8f7421895a7d90aa201f84a99c3731', 'd862fe70e3760134c50bff7b9b2681ec29c4d335e51aa71185f5f36cd1e540a8', 16),
]
def sha(data):
    return hashlib.sha256(data).hexdigest()

class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, origin):
        self.origin = origin
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        u = urlsplit(newurl)
        if u.scheme != 'https' or (u.scheme + '://' + u.netloc) != self.origin:
            raise ValueError('External redirect refused')
        return super().redirect_request(request, fp, code, msg, headers, newurl)

def check(root, http):
    receipts = []
    for name, origin, source, zip_sha, manifest_sha, count in EXPECTED:
        data = (root / name).read_bytes()
        if sha(data) != zip_sha:
            raise ValueError(name + ': GitHub ZIP SHA mismatch')
        with zipfile.ZipFile(root / name) as archive:
            raw = archive.read('fixture-manifest.json')
            if sha(raw) != manifest_sha:
                raise ValueError(name + ': external manifest anchor mismatch')
            manifest = json.loads(raw)
            if manifest.get('sourceSha') != source or manifest.get('fixtureOnly') is not True or manifest.get('environment') != 'isolated-test':
                raise ValueError(name + ': provenance mismatch')
            if manifest.get('raceOrigin') != RACE or manifest.get('vaultOrigin') != VAULT:
                raise ValueError(name + ': TEST origins mismatch')
            files = manifest['files']
            if len(files) != count or set(archive.namelist()) != set(files) | {'fixture-manifest.json'}:
                raise ValueError(name + ': unexpected file inventory')
            for path, digest in files.items():
                if path.startswith('/') or '..' in path.split('/') or sha(archive.read(path)) != digest:
                    raise ValueError(name + ': resource mismatch ' + path)
            config = json.loads(archive.read('drive-config.json'))
            if not config or config.get('raceOrigin') != RACE or config.get('vaultOrigin') != VAULT:
                raise ValueError(name + ': public Google TEST destination mismatch')
            if http:
                opener = urllib.request.build_opener(SameOriginRedirect(origin))
                def get(path):
                    with opener.open(origin + '/' + path, timeout=25) as response:
                        body = response.read(5 * 1024 * 1024 + 1)
                        if len(body) > 5 * 1024 * 1024:
                            raise ValueError('HTTP resource oversized')
                        return body
                if sha(get('fixture-manifest.json')) != manifest_sha:
                    raise ValueError(origin + ': candidate not served; NO GO')
                for path, digest in files.items():
                    if path in ('_headers', '_redirects'):
                        continue
                    if sha(get(path)) != digest:
                        raise ValueError(origin + ': HTTP bytes mismatch ' + path)
            receipts.append({'name': name, 'sourceSha': source, 'files': count, 'zipSha256': zip_sha, 'manifestSha256': manifest_sha, 'httpChecked': http, 'status': 'CONFIRME'})
    return receipts

def check_http_only():
    """Read-only HTTP checks anchored in independently pinned ZIP manifest digests.

    This mode does not claim to inspect ZIP bytes; archive checks are run separately.
    """
    receipts = []
    for name, origin, source, zip_sha, manifest_sha, count in EXPECTED:
        opener = urllib.request.build_opener(SameOriginRedirect(origin))
        def get(path):
            with opener.open(origin + '/' + path, timeout=25) as response:
                body = response.read(5 * 1024 * 1024 + 1)
                if len(body) > 5 * 1024 * 1024:
                    raise ValueError('HTTP resource oversized')
                return body
        raw = get('fixture-manifest.json')
        if sha(raw) != manifest_sha:
            raise ValueError(origin + ': external manifest anchor mismatch')
        manifest = json.loads(raw)
        if (manifest.get('sourceSha') != source or manifest.get('fixtureOnly') is not True
                or manifest.get('environment') != 'isolated-test'):
            raise ValueError(origin + ': provenance mismatch')
        if manifest.get('raceOrigin') != RACE or manifest.get('vaultOrigin') != VAULT:
            raise ValueError(origin + ': TEST origins mismatch')
        files = manifest['files']
        if not isinstance(files, dict) or len(files) != count:
            raise ValueError(origin + ': unexpected file inventory')
        checked = []
        for path, digest in files.items():
            if (not isinstance(path, str) or path.startswith('/') or '..' in path.split('/')
                    or not all(c.isascii() and (c.isalnum() or c in '_./-') for c in path)
                    or not isinstance(digest, str) or len(digest) != 64
                    or any(c not in '0123456789abcdef' for c in digest)):
                raise ValueError(origin + ': invalid file entry')
            if path in ('_headers', '_redirects'):
                continue
            data = get(path)
            if sha(data) != digest:
                raise ValueError(origin + ': HTTP bytes mismatch ' + path)
            checked.append({'path': path, 'sha256': digest, 'size': len(data)})
            if path == 'drive-config.json':
                config = json.loads(data)
                if config.get('raceOrigin') != RACE or config.get('vaultOrigin') != VAULT:
                    raise ValueError(origin + ': public Google TEST destination mismatch')
        receipts.append({'name': name, 'sourceSha': source, 'manifestSha256': manifest_sha,
                         'filesListed': count, 'filesHttpChecked': checked,
                         'archiveZipSha256Expected': zip_sha, 'zipChecked': False,
                         'httpChecked': True, 'status': 'CONFIRME'})
    return receipts

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, default=Path(__file__).resolve().parent / 'artifacts')
    parser.add_argument('--http', action='store_true')
    parser.add_argument('--http-only', action='store_true', help='Check published bytes only; ZIP validation is separate')
    args = parser.parse_args()
    if args.http_only and args.http:
        parser.error('Choose --http or --http-only')
    try:
        print(json.dumps(check_http_only() if args.http_only else check(args.artifacts, args.http), indent=2))
    except Exception as error:
        print(json.dumps({'status': 'ECHEC', 'reason': str(error)}))
        raise SystemExit(1)

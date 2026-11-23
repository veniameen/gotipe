#!/usr/bin/env python3
"""Collect unmodified notices for modules linked into the Cloud binary.

Run with --check to verify checked-in files against the current Go module cache.
The source graph comes from go list, not an assumed list of direct dependencies.

The notice directory is generated exclusively from that graph. A run without --check
removes every entry the graph does not produce (notices of module versions that are no
longer linked), and --check fails on such entries, listing their names.
"""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
DESTINATION = ROOT / 'apps/cloud/licenses'
# Names the collector never reports and never removes: Finder metadata, which git and Docker
# already ignore. A file GoTipe maintains by hand in the directory would be listed here
# explicitly; any other entry the graph does not produce is a stale notice.
KEPT = frozenset({'.DS_Store'})


def go(*arguments):
    return subprocess.check_output(['go', *arguments], cwd=ROOT / 'apps/cloud', text=True,
                                   env={**os.environ, 'GOOS': 'linux', 'CGO_ENABLED': '0'})


def objects(text):
    decoder = json.JSONDecoder()
    while text.strip():
        text = text.lstrip()
        value, consumed = decoder.raw_decode(text)
        yield value
        text = text[consumed:]


def collect():
    modules = {}
    for package in objects(go('list', '-deps', '-json', './cmd/api')):
        module = package.get('Module')
        if module and not module.get('Main'):
            modules[module['Path']] = module
    files = {}
    inventory = []
    for name, module in sorted(modules.items()):
        directory = pathlib.Path(module['Dir'])
        notices = sorted(path for path in directory.iterdir()
                         if path.is_file() and path.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE')))
        if not notices:
            raise RuntimeError(f'No root license notice found for {name}; inspect its distribution')
        records = []
        for notice in notices:
            filename = name.replace('/', '__') + '@' + module['Version'] + '-' + notice.name
            data = notice.read_bytes()
            files[filename] = data
            records.append({'file': filename, 'source': notice.name,
                            'sha256': hashlib.sha256(data).hexdigest()})
        inventory.append({'module': name, 'version': module['Version'], 'notices': records})
    files['Go-LICENSE'] = (pathlib.Path(go('env', 'GOROOT').strip()) / 'LICENSE').read_bytes()
    files['inventory.json'] = (json.dumps(inventory, ensure_ascii=False, indent=2) + '\n').encode()
    return files


def stale(files):
    """Entries of the notice directory that the current graph does not produce."""
    if not DESTINATION.is_dir():
        return []
    return sorted(entry.name for entry in DESTINATION.iterdir()
                  if entry.name not in files and entry.name not in KEPT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    options = parser.parse_args()
    files = collect()
    extra = stale(files)
    if options.check:
        mismatches = [name for name, data in files.items()
                      if not (DESTINATION / name).is_file() or (DESTINATION / name).read_bytes() != data]
        problems = []
        if mismatches:
            problems.append('Cloud license inventory differs: ' + ', '.join(mismatches))
        if extra:
            problems.append('Cloud license directory has files the linked module graph does not produce: '
                            + ', '.join(extra) + '; run scripts/collect-cloud-licenses.py to remove them')
        if problems:
            raise SystemExit('\n'.join(problems))
    else:
        directories = [name for name in extra
                       if (DESTINATION / name).is_dir() and not (DESTINATION / name).is_symlink()]
        if directories:
            raise SystemExit('Cloud license directory has directories the collector does not remove; '
                             'delete them by hand: ' + ', '.join(directories))
        DESTINATION.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (DESTINATION / name).write_bytes(data)
        for name in extra:
            (DESTINATION / name).unlink()
            print(f'Removed stale notice: {name}')
    print(f'Cloud linked-module notices verified: {len(files) - 1} license/notice files')


if __name__ == '__main__':
    main()

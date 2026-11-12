#!/usr/bin/env python3
"""Copy original Cargo notices for each WASM module's normal/build dependency graph."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
UPSTREAM = json.loads((ROOT / 'config/rust-upstream-notices.json').read_text())


def cargo(*arguments):
    return subprocess.check_output(['cargo', *arguments], cwd=ROOT, text=True)


def collect(crate, metadata):
    tree = cargo('tree', '--locked', '--target', 'wasm32-unknown-unknown', '-p', crate,
                 '-e', 'normal,build', '--prefix', 'none', '--format', '{p}')
    linked = set()
    for line in tree.splitlines():
        if match := re.match(r'^(\S+) v(\S+)', line):
            linked.add(match.groups())
    files, inventory = {}, []
    for package in sorted(metadata['packages'], key=lambda item: (item['name'], item['version'])):
        name, version = package['name'], package['version']
        if (name, version) not in linked or package['source'] is None:
            continue
        directory = pathlib.Path(package['manifest_path']).parent
        notices = [path for path in sorted(directory.iterdir())
                   if path.is_file() and path.name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE'))]
        if package.get('license_file'):
            explicit = directory / package['license_file']
            if explicit not in notices:
                notices.append(explicit)
        upstream = UPSTREAM.get(f'{name}@{version}')
        if not notices and upstream:
            vcs = json.loads((directory / '.cargo_vcs_info.json').read_text())
            if vcs['git']['sha1'] != upstream['revision']:
                raise RuntimeError(f'Upstream notice revision changed for {name} {version}')
            for item in upstream['notices']:
                notice = ROOT / item['path']
                if hashlib.sha256(notice.read_bytes()).hexdigest() != item['sha256']:
                    raise RuntimeError(f'Upstream notice hash changed: {notice}')
                notices.append(notice)
        if not notices:
            raise RuntimeError(f'No notices found for {name} {version}; review its distribution')
        records = []
        for notice in notices:
            filename = notice.name if notice.is_relative_to(ROOT) else f'{name}-{version}-{notice.name}'
            data = notice.read_bytes()
            files[filename] = data
            records.append({'file': filename, 'sha256': hashlib.sha256(data).hexdigest()})
        inventory.append({'name': name, 'version': version, 'license': package['license'],
                          'source': package.get('repository'), 'resolved_source': package['source'], 'notices': records})
    files['inventory.json'] = (json.dumps(inventory, indent=2) + '\n').encode()
    return files


def font_notices():
    assets = ROOT / 'crates/gotipe-export/assets'
    inventory = json.loads((assets / 'inventory.json').read_text())
    for item in inventory['files']:
        if hashlib.sha256((assets / item['file']).read_bytes()).hexdigest() != item['sha256']:
            raise RuntimeError(f'Bundled font asset changed: {item["file"]}')
    emoji = inventory['notoEmoji']
    for filename, digest in [(emoji['file'], emoji['sha256']),
                             (emoji['licenseFile'], emoji['licenseSha256'])]:
        if hashlib.sha256((assets / filename).read_bytes()).hexdigest() != digest:
            raise RuntimeError(f'Bundled emoji asset changed: {filename}')
    return {name: (assets / name).read_bytes() for name in
            ['typst-assets-LICENSE', 'typst-assets-NOTICE', 'NotoEmoji-OFL.txt', 'inventory.json']}


def dependency_summary(files):
    inventory = json.loads(files['inventory.json'])
    lines = ['# Optional exporter dependencies', '',
             'Generated from the locked normal/build WASM graph. GoTipe owns document layout',
             'and PDF/OOXML rendering; font and format libraries retain their original terms.',
             'Original texts and hashes are in `cargo/`; bundled font provenance is in `fonts/`.', '',
             '| Crate | Version | License |', '|---|---|---|']
    lines.extend(f'| {item["name"]} | {item["version"]} | {item["license"]} |'
                 for item in inventory)
    return ('\n'.join(lines) + '\n').encode()


def synchronize(target, files, check):
    existing = {path.name for path in target.iterdir() if path.is_file()} if target.exists() else set()
    if check:
        mismatches = [name for name, data in files.items()
                      if not (target / name).is_file() or (target / name).read_bytes() != data]
        unexpected = sorted(existing - files.keys())
        if mismatches or unexpected:
            raise SystemExit(f'{target.relative_to(ROOT)} notices differ: '
                             + ', '.join(mismatches + unexpected))
        return
    target.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (target / name).write_bytes(data)
    # This directory is generated exclusively from the resolved dependency graph.
    for name in existing - files.keys():
        (target / name).unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    arguments = parser.parse_args()
    metadata = json.loads(cargo('metadata', '--locked', '--format-version', '1'))
    for crate, destination in [('gotipe-wasm', 'packages/wasm/licenses/cargo'),
                               ('gotipe-export-wasm', 'packages/export-wasm/licenses/cargo')]:
        files = collect(crate, metadata)
        target = ROOT / destination
        synchronize(target, files, arguments.check)
        print(f'{crate}: {len(files) - 1} original notices verified')
        if crate == 'gotipe-export-wasm':
            synchronize(ROOT / 'packages/export-wasm/licenses',
                        {'dependencies.md': dependency_summary(files)}, arguments.check)
    synchronize(ROOT / 'packages/export-wasm/licenses/fonts', font_notices(), arguments.check)
    print('Export font bytes and original notices verified')


if __name__ == '__main__':
    main()

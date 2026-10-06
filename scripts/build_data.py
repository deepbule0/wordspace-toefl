"""Build factual headword/meaning/pronunciation data; exclude book examples/mnemonics."""
import collections
import argparse
import html
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.sources'
PUBLIC = ROOT / 'public'
PUBLIC.mkdir(exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--deck', type=Path, default=SOURCE / 'TOEFL.apkg', help='Anki deck you are authorized to use; source downloads are not included.')
args = parser.parse_args()

def normalize(word):
    return ''.join(c for c in unicodedata.normalize('NFD', word.lower()) if not unicodedata.combining(c))

def clean(value):
    value = re.sub(r'<br\s*/?>', '; ', value, flags=re.I)
    return html.unescape(re.sub(r'<[^>]+>', '', value)).strip()

raw = json.loads((SOURCE / 'public_headwords.json').read_text(encoding='utf-8'))
anki_order = json.loads((SOURCE / 'anki_headwords.json').read_text(encoding='utf-8'))
fixes = {'marve': 'marvel', 'shove': 'shovel', 'anqiosperm': 'angiosperm', 'VOW': 'vow'}
rows = [dict(r, word=fixes.get(r['word'], r['word'])) for r in raw if r['word'] not in ('b', 'p')]
rows.extend([{'list': 26, 'line': 2655, 'word': 'divorce'}, {'list': 42, 'line': 4331, 'word': 'stun'}])
for word in ('diversity', 'roost', 'curl'):
    target = next(r for r in anki_order if r['word'] == word)
    group = [r for r in anki_order if r['list'] == target['list']]
    index = next(i for i, r in enumerate(group) if r['word'] == word)
    lookup = {normalize(r['word']): r for r in rows if r['list'] == target['list']}
    before = next(lookup[normalize(r['word'])] for r in reversed(group[:index]) if normalize(r['word']) in lookup)
    after = next(lookup[normalize(r['word'])] for r in group[index + 1:] if normalize(r['word']) in lookup)
    rows.append({'list': target['list'], 'line': (before['line'] + after['line']) / 2, 'word': word})
rows.sort(key=lambda r: (r['list'], r['line']))
assert len(rows) == len({normalize(r['word']) for r in rows}) == 4264

dictionary = {}
for line in (SOURCE / 'dictionary.jsonl').read_text(encoding='utf-8').splitlines():
    record = json.loads(line)
    dictionary[normalize(record['word'])] = record
supplement_path = SOURCE / 'meaning_supplement.json'
supplement = json.loads(supplement_path.read_text(encoding='utf-8')) if supplement_path.exists() else {}

deck_path = args.deck
deck = {}
audio_dir = PUBLIC / 'audio'
audio_dir.mkdir(exist_ok=True)
with zipfile.ZipFile(deck_path) as archive:
    db = sqlite3.connect(':memory:')
    db.deserialize(archive.read('collection.anki2'))
    models = json.loads(db.execute('select models from col').fetchone()[0])
    media = json.loads(archive.read('media'))
    media_lookup = {name: key for key, name in media.items()}
    for mid, flds in db.execute('select mid, flds from notes order by id'):
        names = [f['name'] for f in models[str(mid)]['flds']]
        record = dict(zip(names, flds.split('\x1f')))
        deck[normalize(clean(record['word']))] = record

    result = []
    missing = []
    for i, row in enumerate(rows):
        word = row['word']
        key = normalize(word)
        record = deck.get(key, {})
        fallback = supplement.get(key, dictionary.get(key, {}))
        definition = clean(record.get('definition', ''))
        # Strip source-specific English gloss annotations; retain ordinary Chinese meanings.
        definition = re.sub(r'[（(][^）)]*[＊*][^）)]*[）)]', '', definition)
        definition = re.sub(r'[（(][^（）()\u4e00-\u9fff]*[A-Za-z][^（）()\u4e00-\u9fff]*[）)]', '', definition)
        parts = re.split(r'(?<![A-Za-z])(adj\.|adv\.|vt\.|vi\.|v\.|n\.|a\.|ad\.|prep\.|conj\.|pron\.|num\.|interj\.|int\.|aux\.|art\.)\s*', definition)
        meanings = []
        pending_pos = []
        for j in range(1, len(parts) - 1, 2):
            pos = {'a.': 'adj.', 'ad.': 'adv.', 'int.': 'interj.'}.get(parts[j], parts[j])
            pending_pos.append(pos)
            text = parts[j + 1].strip(' ;；')
            if not text or re.fullmatch(r'[/&、，,和兼\s]+', text):
                continue
            meanings.append({'pos': ' / '.join(pending_pos), 'text': text})
            pending_pos = []
        if not meanings:
            meanings = [{'pos': (t.get('type', '') + '.').replace('..', '.'), 'text': t['translation']} for t in fallback.get('translations', [])]
        if not meanings:
            missing.append(word)
        phonetic = clean(record.get('pos', '')) or fallback.get('us', '') or fallback.get('uk', '')
        phonetic = phonetic.strip('[]/')
        match = re.search(r'\[sound:([^]]+)\]', record.get('audio', ''))
        audio = None
        if match and match.group(1) in media_lookup:
            # Stable neutral filename; no arbitrary paths from a downloaded archive.
            original = match.group(1)
            filename = f'{i + 1:04d}{Path(original).suffix.lower()}'
            assert Path(filename).suffix in ('.mp3', '.ogg', '.wav')
            (audio_dir / filename).write_bytes(archive.read(media_lookup[original]))
            audio = f'audio/{filename}'
        result.append({'id': i + 1, 'word': word, 'list': row['list'], 'phonetic': phonetic, 'meanings': meanings, 'audio': audio})

payload = {'version': 1, 'total': len(result), 'listCount': 48, 'audioCount': sum(bool(r['audio']) for r in result), 'words': result}
(PUBLIC / 'vocabulary.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
report = {'words': len(result), 'audio': payload['audioCount'], 'missingMeanings': missing, 'missingPhonetics': [r['word'] for r in result if not r['phonetic']], 'lists': dict(sorted(collections.Counter(r['list'] for r in result).items()))}
(SOURCE / 'data_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))

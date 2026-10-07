# Builds vendor/unicode-names.js for The Toolbox glyph browser from UnicodeData.txt + Blocks.txt.
# Format: DATA is one line per character: optional "~hex;" when the code point does not follow the
# previous one, then one char giving how many leading characters to reuse from the previous name
# (chr(32 + n)), then the rest of the name.
import re, sys, json
ucd, out = sys.argv[1], sys.argv[2]
WANT = """Basic Latin|Latin-1 Supplement|Latin Extended-A|Latin Extended-B|IPA Extensions|Spacing Modifier Letters|Combining Diacritical Marks|Greek and Coptic|Cyrillic|Cyrillic Supplement|Hebrew|Arabic|Arabic Supplement|Arabic Extended-A|Devanagari|Tamil|Thai|Latin Extended Additional|Greek Extended|General Punctuation|Superscripts and Subscripts|Currency Symbols|Letterlike Symbols|Number Forms|Arrows|Mathematical Operators|Miscellaneous Technical|Control Pictures|Enclosed Alphanumerics|Box Drawing|Block Elements|Geometric Shapes|Miscellaneous Symbols|Dingbats|Miscellaneous Mathematical Symbols-A|Supplemental Arrows-A|Braille Patterns|Supplemental Arrows-B|Miscellaneous Mathematical Symbols-B|Supplemental Mathematical Operators|Miscellaneous Symbols and Arrows|CJK Symbols and Punctuation|Hiragana|Katakana|Alphabetic Presentation Forms|Arabic Presentation Forms-A|Arabic Presentation Forms-B|Halfwidth and Fullwidth Forms|Specials|Musical Symbols|Mathematical Alphanumeric Symbols|Playing Cards|Enclosed Alphanumeric Supplement|Miscellaneous Symbols and Pictographs|Emoticons|Transport and Map Symbols|Geometric Shapes Extended|Supplemental Arrows-C|Supplemental Symbols and Pictographs|Chess Symbols|Symbols and Pictographs Extended-A|Symbols for Legacy Computing""".split('|')
blocks = []
ver = ''
for l in open(ucd + '/Blocks.txt'):
    if l.startswith('# Blocks-'): ver = l[9:].strip().replace('.txt', '')
    m = re.match(r'([0-9A-F]+)\.\.([0-9A-F]+); (.+)', l)
    if m and m[3].strip() in WANT: blocks.append([int(m[1], 16), int(m[2], 16), m[3].strip()])
names = {}
for l in open(ucd + '/UnicodeData.txt'):
    f = l.split(';')
    if f[1].startswith('<'): continue
    names[int(f[0], 16)] = f[1]
lines, prev_cp, prev = [], -2, ''
for s, e, _ in blocks:
    for cp in range(s, e + 1):
        if cp not in names: continue
        n = names[cp]
        k = 0
        while k < min(len(n), len(prev), 90) and n[k] == prev[k]: k += 1
        lines.append(('' if cp == prev_cp + 1 else '~%x;' % cp) + chr(32 + k) + n[k:])
        prev_cp, prev = cp, n
data = '\n'.join(lines)
with open(out, 'w') as o:
    o.write('// Unicode character names for a subset of blocks, from the Unicode Character Database\n')
    o.write(f'// (UnicodeData.txt and Blocks.txt, version {ver}). © Unicode, Inc. — Unicode License v3\n')
    o.write('// (https://www.unicode.org/license.txt), a permissive licence. Built by the Text & type drawer;\n')
    o.write('// see js/lib/type-glyphs.js for the format (prefix-shared names, one per line).\n')
    o.write('export const VERSION = ' + json.dumps(ver) + ';\n')
    o.write('export const BLOCKS = ' + json.dumps(blocks, separators=(',', ':')) + ';\n')
    o.write('export const DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n')
print(len(lines), 'names')

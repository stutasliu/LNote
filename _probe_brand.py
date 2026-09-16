# -*- coding: utf-8 -*-
"""临时探针：定位「提交的 60 页」里出现的 Inkpad 字样及其所属源文件/行号。"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import _gen_src_pdf as G

FONT_NAME = "SimSun"
pdfmetrics.registerFont(TTFont(FONT_NAME, r"C:\Windows\Fonts\simsun.ttc", subfontIndex=0))
FS = G.FONT_SIZE
_wc = {}


def char_w(ch):
    w = _wc.get(ch)
    if w is None:
        w = pdfmetrics.stringWidth(ch, FONT_NAME, FS)
        _wc[ch] = w
    return w


def sanitize(line):
    out = []
    for ch in line:
        if ch == "\t":
            out.append("    ")
            continue
        o = ord(ch)
        if o < 32:
            continue
        out.append(ch)
    return "".join(out).rstrip()


max_w = G.PW - 2 * G.MARGIN_X


def wrap(line):
    if not line:
        return [""]
    pieces = []
    cur = ""
    cur_w = 0.0
    last_space = -1
    for ch in line:
        w = char_w(ch)
        if cur_w + w > max_w and cur:
            if last_space > len(cur) * 0.6:
                pieces.append(cur[:last_space].rstrip())
                cur = cur[last_space + 1:] + ch
            else:
                pieces.append(cur)
                cur = ch
            cur_w = sum(char_w(c) for c in cur)
            last_space = cur.rfind(" ")
            continue
        cur += ch
        cur_w += w
        if ch == " ":
            last_space = len(cur) - 1
    pieces.append(cur)
    return pieces


files = G.collect_files()

records = []
wrapped = []
for title, rel, path in files:
    sep = G.comment_prefix(rel) + "=" * 20 + " " + rel + " " + "=" * 20 + G.comment_suffix(rel)
    s0 = len(wrapped)
    wrapped.extend(wrap(sanitize(sep)))
    for i, ln in enumerate(G.read_lines(path), start=1):
        body = sanitize(ln)
        if not body:
            continue
        a = len(wrapped)
        wrapped.extend(wrap(body))
        records.append((rel, i, ln, a, len(wrapped)))

total = len(wrapped)
front_span = G.FRONT_PAGES * G.LINES_PER_PAGE
back_span = G.BACK_PAGES * G.LINES_PER_PAGE
back_lo = total - back_span

print("物理行总数：%d  前段 1-%d  后段 %d-%d" % (total, front_span, back_lo + 1, total))
print()

in_page = []
out_page = []
for rel, i, ln, a, b in records:
    if "inkpad" not in ln.lower():
        continue
    front = a < front_span
    back = b > back_lo
    (in_page if (front or back) else out_page).append((rel, i, ln.strip(), a + 1, b))

print("=== 落在提交 60 页内的 Inkpad 行：%d ===" % len(in_page))
cur = None
for rel, i, ln, a, b in in_page:
    if rel != cur:
        cur = rel
        print("\n[%s]" % rel)
    zone = "前" if a <= front_span else "后"
    print("  L%-5d (%s段 行%d-%d) %s" % (i, zone, a, b, ln[:150]))

print()
print("=== 落在提交页之外的 Inkpad 行：%d（按文件计数） ===" % len(out_page))
from collections import Counter
c = Counter(rel for rel, *_ in out_page)
for rel, n in c.most_common():
    print("  %-40s %d" % (rel, n))

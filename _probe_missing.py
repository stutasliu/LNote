# -*- coding: utf-8 -*-
"""临时探针 v2：精确统计「提交的 60 页」里 ? 的来源与候选字体覆盖。"""

import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import _gen_src_pdf as G

CANDS = [
    ("SimSun", r"C:\Windows\Fonts\simsun.ttc", 0),
    ("MSYaHei", r"C:\Windows\Fonts\msyh.ttc", 0),
    ("SegoeSym", r"C:\Windows\Fonts\seguisym.ttf", 0),
    ("SegoeEmj", r"C:\Windows\Fonts\seguiemj.ttf", 0),
]

gmaps = {}
for name, path, idx in CANDS:
    try:
        pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
        face = pdfmetrics.getFont(name).face
        gmaps[name] = set((getattr(face, "charToGlyph", None) or {}).keys())
    except Exception as exc:  # noqa: BLE001
        print("注册失败 %s: %s" % (name, exc))

base = gmaps["SimSun"]
FONT_NAME = "SimSun"
FS = G.FONT_SIZE

width_cache = {}


def char_w(ch):
    w = width_cache.get(ch)
    if w is None:
        w = pdfmetrics.stringWidth(ch, FONT_NAME, FS)
        width_cache[ch] = w
    return w


files = G.collect_files()
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


spans = []
wrapped = []
subs_all = collections.Counter()
genuine_all = collections.Counter()

for title, rel, path in files:
    subs = collections.Counter()
    gen = 0
    lines = []
    lines.append(G.comment_prefix(rel) + "=" * 20 + " " + rel + " " + "=" * 20 + G.comment_suffix(rel))
    for ln in G.read_lines(path):
        out = []
        for ch in ln:
            if ch == "\t":
                out.append("    ")
                continue
            o = ord(ch)
            if o < 32:
                continue
            if o not in base:
                subs[ch] += 1
                out.append("?")
                continue
            if ch == "?":
                gen += 1
            out.append(ch)
        body = "".join(out).rstrip()
        if not body:
            continue
        lines.append(body)
    start = len(wrapped)
    for ln in lines:
        wrapped.extend(wrap(ln))
    spans.append((rel, start, len(wrapped), subs, gen))
    subs_all.update(subs)
    if gen:
        genuine_all[rel] += gen

front_span = G.FRONT_PAGES * G.LINES_PER_PAGE
back_span = G.BACK_PAGES * G.LINES_PER_PAGE
total = len(wrapped)
front_lo, front_hi = 0, front_span
back_lo, back_hi = total - back_span, total

sel_subs = collections.Counter()
sel_gen = collections.Counter()
sel_files = []
for rel, s, e, subs, gen in spans:
    if s < front_hi or e > back_lo:
        sel_files.append((rel, max(s, front_lo), min(e, front_hi), max(s, back_lo), min(e, back_hi)))
        sel_subs.update(subs)
        if gen:
            sel_gen[rel] += gen

print()
print("全量物理行：%d，提交行：%d" % (total, len(spans) and len(wrapped[:front_span]) + len(wrapped[back_lo:])))
print("提交行（前段）行号 1 - %d，提交行（后段）行号 %d - %d" % (front_hi, back_lo + 1, back_hi))
print()
print("提交页涉及的源文件：")
for rel, fs, fe, bs, be in sel_files:
    tag = []
    if fe > fs:
        tag.append("前段 %d 行" % (fe - fs))
    if be > bs:
        tag.append("后段 %d 行" % (be - bs))
    print("   %-34s %s" % (rel, " / ".join(tag)))
print()
print("【提交页里】替换产生的 ? 合计：%d" % sum(sel_subs.values()))
print("【全量】替换产生的 ? 合计：%d（仅作对照）" % sum(subs_all.values()))
print()
print("提交页缺失字形字符：")
print("%-6s %-9s %-6s %s" % ("字符", "码点", "次数", "可用字体"))
for ch, n in sel_subs.most_common():
    o = ord(ch)
    cover = [k for k, v in gmaps.items() if o in v]
    sys.stdout.write("%-6s U+%-7X %-6d %s\n" % (ch, o, n, ",".join(cover) or "无"))
print()
print("提交页里源文件本来就有的半角 ? ：")
if sel_gen:
    for rel, n in sel_gen.most_common():
        print("   %-40s %d" % (rel, n))
else:
    print("   无")
print()
only = [ch for ch in sel_subs if ord(ch) not in gmaps["MSYaHei"] and ord(ch) not in gmaps["SegoeSym"]]
print("提交页中「仅 SegoeEmj 可覆盖」的字符：%s"
      % (" ".join("%s(U+%04X)" % (c, ord(c)) for c in only) or "无"))

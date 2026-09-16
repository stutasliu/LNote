# -*- coding: utf-8 -*-
"""软著申请 - 源程序鉴别材料 PDF 生成器（临时脚本）

一般交存：提交源程序连续的前 30 页 + 连续的后 30 页，每页不少于 50 行。
页眉：软件全称 + 版本号 + 页码。
"""

import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "docs", "软著材料")
OUT_PDF = os.path.join(OUT_DIR, "源程序.pdf")

SOFT_NAME = "L.Note本地笔记编辑软件"
SOFT_VERSION = "V1.0.0"
OWNER = "刘云杰"

PAGE = A4
PW, PH = PAGE
MARGIN_X = 36.0
FONT_SIZE = 8.0
LEADING = 13.5
LINES_PER_PAGE = 50
FRONT_PAGES = 30
BACK_PAGES = 30

FONT_CANDIDATES = [
    ("SimSun", r"C:\Windows\Fonts\simsun.ttc", 0),
    ("SimSun", r"C:\Windows\Fonts\SimSun.ttc", 0),
    ("NSimSun", r"C:\Windows\Fonts\simsun.ttc", 1),
    ("MicrosoftYaHei", r"C:\Windows\Fonts\msyh.ttc", 0),
    ("SimHei", r"C:\Windows\Fonts\simhei.ttf", 0),
]

# 中文字体不含 ✓/✗ 等符号字形，用系统符号字体做逐字回退，避免落成 "?"
SYMBOL_FONT_CANDIDATES = [
    ("SegoeUISymbol", r"C:\Windows\Fonts\seguisym.ttf", 0),
    ("SegoeUIEmoji", r"C:\Windows\Fonts\seguiemj.ttf", 0),
]

JS_EXCLUDE = {"app.js", "pdf.worker.min.js"}


def pick_symbol_font(needed):
    """为基准字体缺字形、但符号字体可覆盖的码点挑选回退字体。"""
    if not needed:
        return None, {}
    best = (None, {})
    best_cover = 0
    for name, path, idx in SYMBOL_FONT_CANDIDATES:
        if not os.path.isfile(path):
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
            glyphs = getattr(pdfmetrics.getFont(name).face, "charToGlyph", None) or {}
        except Exception as exc:  # noqa: BLE001
            print("  符号字体尝试失败 %s: %s" % (path, exc))
            continue
        cover = sum(1 for o in needed if o in glyphs)
        if cover > best_cover:
            best = (name, glyphs)
            best_cover = cover
    return best


def pick_font():
    for name, path, idx in FONT_CANDIDATES:
        if not os.path.isfile(path):
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
            face = pdfmetrics.getFont(name).face
            glyphs = getattr(face, "charToGlyph", None)
            if glyphs and 0x4E2D not in glyphs:
                continue
            return name
        except Exception as exc:  # noqa: BLE001
            print("  字体尝试失败 %s: %s" % (path, exc))
    raise SystemExit("未找到可用中文字体")


def comment_prefix(rel):
    ext = os.path.splitext(rel)[1].lower()
    if ext in (".py", ".sh", ".ps1", ".iss"):
        return "# "
    if ext == ".bat":
        return "REM "
    if ext == ".js" or ext == ".mjs":
        return "// "
    if ext == ".css":
        return "/* "
    if ext in (".html", ".htm"):
        return "<!-- "
    return "# "


def comment_suffix(rel):
    ext = os.path.splitext(rel)[1].lower()
    if ext == ".css":
        return " */"
    if ext in (".html", ".htm"):
        return " -->"
    return ""


def collect_files():
    groups = []

    def add_group(title, rels):
        if rels:
            groups.append((title, rels))

    add_group("入口与桌面外壳", ["main.py"])

    src_app = sorted(
        f for f in os.listdir(os.path.join(ROOT, "src-app"))
        if f.endswith(".js") and os.path.isfile(os.path.join(ROOT, "src-app", f))
    )
    add_group("前端应用模块", ["src-app/" + f for f in src_app])

    add_group("界面结构", ["app.html"])

    css = sorted(
        f for f in os.listdir(os.path.join(ROOT, "css"))
        if f.endswith(".css")
    )
    add_group("界面样式", ["css/" + f for f in css])

    js_dir = os.path.join(ROOT, "js")
    js_files = sorted(
        f for f in os.listdir(js_dir)
        if f.endswith(".js")
        and os.path.isfile(os.path.join(js_dir, f))
        and f not in JS_EXCLUDE
        and not f.startswith("vendor-")
    )
    add_group("前端功能库", ["js/" + f for f in js_files])

    tools_dir = os.path.join(ROOT, "tools")
    tools = sorted(
        f for f in os.listdir(tools_dir)
        if f.endswith((".js", ".mjs", ".py"))
        and os.path.isfile(os.path.join(tools_dir, f))
        and not f.startswith("_")
    )
    add_group("构建与发布工具", ["tools/" + f for f in tools])

    add_group("安装与打包配置", [
        "installer/LNote.iss",
        "LNote.spec",
        "LNoteMac.spec",
        "LNoteDebug.spec",
        "register-file-assoc.ps1",
        "register-file-assoc.bat",
        "build_mac.sh",
    ])

    files = []
    for title, rels in groups:
        for rel in rels:
            p = os.path.join(ROOT, rel.replace("/", os.sep))
            if os.path.isfile(p):
                files.append((title, rel, p))
    return files


def read_lines(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf-8", errors="replace")
    return text.split("\n")


def main():
    font_name = pick_font()
    print("使用字体：%s" % font_name)

    files = collect_files()
    if not files:
        raise SystemExit("未收集到任何源文件")

    glyphs = getattr(pdfmetrics.getFont(font_name).face, "charToGlyph", {}) or {}
    width_cache = {}
    missing = set()
    sym_font = None
    sym_glyphs = {}

    def base_font_for(ch):
        if glyphs and ord(ch) not in glyphs and sym_font and ord(ch) in sym_glyphs:
            return sym_font
        return font_name

    def char_w(ch):
        w = width_cache.get(ch)
        if w is None:
            w = pdfmetrics.stringWidth(ch, base_font_for(ch), FONT_SIZE)
            width_cache[ch] = w
        return w

    def sanitize(text):
        out = []
        for ch in text:
            if ch == "\t":
                out.append("    ")
                continue
            o = ord(ch)
            if o < 32:
                continue
            if glyphs and o not in glyphs:
                missing.add(o)
            out.append(ch)
        return "".join(out).rstrip()

    max_w = PW - 2 * MARGIN_X

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
                    rest = cur[last_space + 1:] + ch
                    cur = rest
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

    logical_lines = 0
    printed = []
    blank_removed = 0
    for title, rel, path in files:
        sep = comment_prefix(rel) + "=" * 20 + " " + rel + " " + "=" * 20 + comment_suffix(rel)
        printed.append(sanitize(sep))
        src = read_lines(path)
        logical_lines += len(src)
        for ln in src:
            body = sanitize(ln)
            if not body:
                blank_removed += 1
                continue
            printed.append(body)

    sym_font, sym_glyphs = pick_symbol_font(missing)
    unresolved = set(o for o in missing if o not in sym_glyphs)
    if missing:
        print("缺字形字符：%d 种，回退字体：%s" % (len(missing), sym_font or "无"))
        if unresolved:
            print("  仍无字形（保留为 ?）：%s"
                  % ", ".join("U+%04X" % o for o in sorted(unresolved)))
            printed = [
                "".join("?" if ord(ch) in unresolved else ch for ch in s)
                for s in printed
            ]
        else:
            print("  已全部由回退字体覆盖，? 占位：0")

    wrapped = []
    for ln in printed:
        wrapped.extend(wrap(ln))

    total_printed = len(wrapped)
    front_span = FRONT_PAGES * LINES_PER_PAGE
    back_span = BACK_PAGES * LINES_PER_PAGE
    if total_printed < front_span + back_span:
        raise SystemExit("源程序不足 %d 行（实际 %d 行）" % (front_span + back_span, total_printed))

    head = wrapped[:front_span]
    tail = wrapped[total_printed - back_span:]
    selected = [
        head[i:i + LINES_PER_PAGE] for i in range(0, front_span, LINES_PER_PAGE)
    ] + [
        tail[i:i + LINES_PER_PAGE] for i in range(0, back_span, LINES_PER_PAGE)
    ]

    total_pages = (total_printed + LINES_PER_PAGE - 1) // LINES_PER_PAGE
    print("源文件数：%d" % len(files))
    print("源程序逻辑行：%d" % logical_lines)
    print("剔除空白行：%d" % blank_removed)
    print("排版后物理行：%d" % total_printed)
    print("源程序总页数：约 %d 页（每页 %d 行）" % (total_pages, LINES_PER_PAGE))
    print("提交页数：%d（前 %d 页 + 后 %d 页，均为满 %d 行）"
          % (len(selected), FRONT_PAGES, BACK_PAGES, LINES_PER_PAGE))
    print("前段起止行：1 - %d" % front_span)
    print("后段起止行：%d - %d" % (total_printed - back_span + 1, total_printed))

    os.makedirs(OUT_DIR, exist_ok=True)
    c = canvas.Canvas(OUT_PDF, pagesize=PAGE)
    c.setTitle("%s %s 源程序" % (SOFT_NAME, SOFT_VERSION))
    c.setAuthor(OWNER)
    c.setSubject("计算机软件著作权登记 - 源程序鉴别材料（一般交存）")

    header_font = 9.0
    total_out = len(selected)
    first_y = PH - 62.0

    def draw_line(x, y, line):
        """按字形覆盖率把一行拆成 run，逐段切换基准 / 符号回退字体绘制。"""
        if not sym_font:
            c.drawString(x, y, line)
            return
        runs = []
        for ch in line:
            f = base_font_for(ch)
            if runs and runs[-1][0] == f:
                runs[-1][1].append(ch)
            else:
                runs.append((f, [ch]))
        t = c.beginText(x, y)
        for f, chars in runs:
            t.setFont(f, FONT_SIZE)
            t.textOut("".join(chars))
        c.drawText(t)

    for idx, page_lines in enumerate(selected, start=1):
        c.setFont(font_name, header_font)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(MARGIN_X, PH - 38.0, "%s %s" % (SOFT_NAME, SOFT_VERSION))
        c.setFont(font_name, 8.0)
        c.drawRightString(PW - MARGIN_X, PH - 38.0, "第 %d 页 / 共 %d 页" % (idx, total_out))
        c.setStrokeColorRGB(0.55, 0.55, 0.55)
        c.setLineWidth(0.5)
        c.line(MARGIN_X, PH - 44.0, PW - MARGIN_X, PH - 44.0)

        c.setFillColorRGB(0.05, 0.05, 0.05)
        c.setFont(font_name, FONT_SIZE)
        y = first_y
        for ln in page_lines:
            draw_line(MARGIN_X, y, ln)
            y -= LEADING

        c.showPage()

    c.save()
    size = os.path.getsize(OUT_PDF)
    print("已生成：%s（%.1f KB）" % (OUT_PDF, size / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())

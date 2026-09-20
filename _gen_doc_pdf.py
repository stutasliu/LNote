# -*- coding: utf-8 -*-
"""生成软著申请「操作说明书」PDF。

内容源：docs/15-软著申请-操作说明书.md
产出：docs/软著材料/操作说明书.pdf

排版规格（依据说明书「填写说明」第 3 条）：
  - 正文满 60 页（生成器自动标定字号/行距以达到 60 页）
  - 每页页眉统一为「软件全称 + 版本号 + 页码」
  - 页码连续

实现要点：
  - 自研 Markdown -> reportlab 渲染（环境中无 markdown / mistune / weasyprint）
  - 复用 _gen_src_pdf.py 的字体回退思路：逐字探测字形，缺失则回退符号字体
  - 【截图：…】标记替换为对应界面截图；缺素材者输出「待补充」占位框
"""

import io
import os
import re

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas

ROOT = os.path.dirname(os.path.abspath(__file__))
DOC_MD = os.path.join(ROOT, "docs", "15-软著申请-操作说明书.md")
OUT_DIR = os.path.join(ROOT, "docs", "软著材料")
OUT_PDF = os.path.join(OUT_DIR, "操作说明书.pdf")

SOFT_NAME = "L.Note本地笔记编辑软件"
SOFT_SHORT = "L.Note"
SOFT_VERSION = "V1.0.0"
OWNER = "刘云杰"
DONE_DATE = "2026-09-01"

DOC_TITLE = "操作说明书"
TARGET_BODY_PAGES = 60
FRONT_PAGES = 2  # 封面 1 页 + 目录 1 页

PAGE = A4
PW, PH = PAGE
MARGIN_X = 62.0
CONTENT_W = PW - 2 * MARGIN_X
HEADER_Y = PH - 40.0
RULE_Y = PH - 48.0
TOP_Y = PH - 76.0
BOTTOM_Y = 66.0

SHOT_RE = re.compile(r"【截图：([^】]+)】")

FIG_SCALE = 0.68
FIG_MAX_H = 340.0

SHOT_DIR = os.path.join(ROOT, "screenshots")
SOFT_SHOT_DIR = os.path.join(SHOT_DIR, "soft-v1")

SHOT_MAP = {
    "安装向导-选择附加任务": os.path.join(SOFT_SHOT_DIR, "shot-03-01-wizard-tasks.png"),
    "安装向导-准备安装": os.path.join(SOFT_SHOT_DIR, "shot-03-02-wizard-ready.png"),
    "安装向导-安装进度": os.path.join(SOFT_SHOT_DIR, "shot-03-03-wizard-installing.png"),
    "安装向导-完成页": os.path.join(SOFT_SHOT_DIR, "shot-03-04-wizard-finish.png"),
    "卸载确认对话框": os.path.join(SOFT_SHOT_DIR, "shot-03-05-uninstall-confirm.png"),
    "首次启动主界面": os.path.join(SOFT_SHOT_DIR, "shot-03-06-first-run.png"),
    "主界面整体，建议分区标注图": os.path.join(SOFT_SHOT_DIR, "shot-04-01-main.png"),
    "侧栏视图切换": os.path.join(SOFT_SHOT_DIR, "shot-04-02-sidebar.png"),
    "新建菜单": os.path.join(SOFT_SHOT_DIR, "shot-05-01-new-menu.png"),
    "导出/另存为入口": os.path.join(SOFT_SHOT_DIR, "shot-05-02-export-menu.png"),
    "文档三点菜单": os.path.join(SOFT_SHOT_DIR, "shot-05-03-doc-menu.png"),
    "标签编辑浮层": os.path.join(SOFT_SHOT_DIR, "shot-05-04-tag-modal.png"),
    "便签集区域": os.path.join(SOFT_SHOT_DIR, "shot-05-05-sticky.png"),
    "批量模式": os.path.join(SOFT_SHOT_DIR, "shot-05-06-batch.png"),
    "回收站视图": os.path.join(SOFT_SHOT_DIR, "shot-05-07-recycle.png"),
    "语言下拉与高亮效果": os.path.join(SOFT_SHOT_DIR, "shot-06-01-lang-highlight.png"),
    "文档地图": os.path.join(SOFT_SHOT_DIR, "shot-06-02-doc-map.png"),
    "查找替换浮层": os.path.join(SOFT_SHOT_DIR, "shot-07-01-find-replace.png"),
    "Markdown 实时预览": os.path.join(SOFT_SHOT_DIR, "shot-08-01-md-preview.png"),
    "数学公式与代码高亮": os.path.join(SOFT_SHOT_DIR, "shot-08-02-math-code.png"),
    "图表渲染": os.path.join(SOFT_SHOT_DIR, "shot-08-03-mermaid.png"),
    "流程图画布": os.path.join(SOFT_SHOT_DIR, "shot-09-01-flow-canvas.png"),
    "泳道效果": os.path.join(SOFT_SHOT_DIR, "shot-09-02-flow-lanes.png"),
    "样式设置面板": os.path.join(SOFT_SHOT_DIR, "shot-09-03-style-panel.png"),
    "思维导图右键菜单": os.path.join(SOFT_SHOT_DIR, "shot-10-01-mind-ctx.png"),
    "主题网格": os.path.join(SOFT_SHOT_DIR, "shot-10-02-mind-theme.png"),
    "便利贴卡片": os.path.join(SOFT_SHOT_DIR, "shot-05-05-sticky.png"),
    "富文档块编辑": os.path.join(SHOT_DIR, "rich.png"),
    "大纲面板": os.path.join(SOFT_SHOT_DIR, "shot-11-01-outline.png"),
    "提醒设置与提醒弹窗": [
        os.path.join(SOFT_SHOT_DIR, "shot-12-01-reminder-edit.png"),
        os.path.join(SOFT_SHOT_DIR, "shot-12-02-reminder-popup.png"),
    ],
    "图片编辑窗口": os.path.join(SOFT_SHOT_DIR, "shot-13-01-image-editor.png"),
    "JSON 工具面板": os.path.join(SOFT_SHOT_DIR, "shot-14-01-json-tools.png"),
    "文件比较窗口": os.path.join(SOFT_SHOT_DIR, "shot-15-01-compare.png"),
    "设置-通用": os.path.join(SOFT_SHOT_DIR, "shot-16-01-settings-general.png"),
    "设置-快捷键": os.path.join(SOFT_SHOT_DIR, "shot-16-02-settings-keys.png"),
    "设置-AI": os.path.join(SOFT_SHOT_DIR, "shot-16-03-settings-ai.png"),
    "AI 助手入口菜单": os.path.join(SOFT_SHOT_DIR, "shot-17-01-ai-ctx-menu.png"),
    "AI 助手面板": os.path.join(SOFT_SHOT_DIR, "shot-17-02-ai-panel.png"),
    "AI 图表描述输入框": os.path.join(SOFT_SHOT_DIR, "shot-17-03-ai-diagram-prompt.png"),
    "AI 图表面板": os.path.join(SOFT_SHOT_DIR, "shot-17-04-ai-diagram-panel.png"),
    "关于窗口": os.path.join(SOFT_SHOT_DIR, "shot-18-01-about.png"),
    "更新提示窗": os.path.join(SOFT_SHOT_DIR, "shot-18-02-update.png"),
}

FONT_CANDIDATES = [
    ("LNSimSun", r"C:\Windows\Fonts\simsun.ttc", 0),
    ("LNSimHei", r"C:\Windows\Fonts\simhei.ttf", 0),
    ("LNConsolas", r"C:\Windows\Fonts\consola.ttf", 0),
]
SYMBOL_CANDIDATES = [
    ("LNSym", r"C:\Windows\Fonts\seguisym.ttf", 0),
]

BODY_FONT = "Helvetica"
HEAD_FONT = "Helvetica-Bold"
CODE_FONT = "Courier"
SYM_FONT = None
GLYPH = {}
WIDTH_CACHE = {}


def register_fonts():
    global BODY_FONT, HEAD_FONT, CODE_FONT, SYM_FONT
    ok = {}
    for name, path, idx in FONT_CANDIDATES:
        try:
            pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
            ok[name] = True
        except Exception as exc:  # pragma: no cover
            print("[warn] 字体注册失败 %s: %s" % (name, exc))
    if ok.get("LNSimSun"):
        BODY_FONT = "LNSimSun"
    if ok.get("LNSimHei"):
        HEAD_FONT = "LNSimHei"
    elif ok.get("LNSimSun"):
        HEAD_FONT = "LNSimSun"
    if ok.get("LNConsolas"):
        CODE_FONT = "LNConsolas"
    for name, path, idx in SYMBOL_CANDIDATES:
        try:
            pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
            SYM_FONT = name
            break
        except Exception as exc:  # pragma: no cover
            print("[warn] 符号字体注册失败 %s: %s" % (name, exc))
    for name in {BODY_FONT, HEAD_FONT, CODE_FONT, SYM_FONT}:
        if not name:
            continue
        try:
            GLYPH[name] = pdfmetrics.getFont(name).face.charToGlyph
        except Exception:  # pragma: no cover
            GLYPH[name] = {}
    print("[font] body=%s head=%s code=%s symbol=%s" % (BODY_FONT, HEAD_FONT, CODE_FONT, SYM_FONT))


def pick(ch, style):
    o = ord(ch)
    if style == "code":
        if o in GLYPH.get(CODE_FONT, {}):
            return CODE_FONT
        if o in GLYPH.get(BODY_FONT, {}):
            return BODY_FONT
    else:
        primary = HEAD_FONT if style == "head" else BODY_FONT
        if o in GLYPH.get(primary, {}):
            return primary
    if o in GLYPH.get(BODY_FONT, {}):
        return BODY_FONT
    if SYM_FONT and o in GLYPH.get(SYM_FONT, {}):
        return SYM_FONT
    return BODY_FONT


def char_w(ch, style, size):
    key = (ch, style, size)
    w = WIDTH_CACHE.get(key)
    if w is None:
        w = pdfmetrics.stringWidth(ch, pick(ch, style), size)
        WIDTH_CACHE[key] = w
    return w


def inline_runs(text):
    t = text.replace("\\`", "\x00")
    t = re.sub(r"\\([\\*_{}\[\]()#+\-.!~`])", r"\1", t)
    parts = t.split("`")
    runs = []
    for idx, part in enumerate(parts):
        style = "code" if idx % 2 == 1 else "body"
        part = part.replace("\x00", "`")
        for ch in part:
            runs.append((ch, style))
    return runs


def runs_width(runs, size):
    return sum(char_w(ch, style, size) for ch, style in runs)


def wrap_runs(runs, size, max_w):
    lines = []
    cur = []
    curw = 0.0
    last_sp = -1
    for ch, style in runs:
        w = char_w(ch, style, size)
        if cur and curw + w > max_w:
            if last_sp >= 0 and last_sp >= len(cur) - 14:
                lines.append(cur[:last_sp])
                rest = cur[last_sp + 1:]
                curw = runs_width(rest, size)
                cur = rest
                last_sp = -1
            else:
                lines.append(cur)
                cur = []
                curw = 0.0
                last_sp = -1
        cur.append((ch, style))
        curw += w
        if ch == " ":
            last_sp = len(cur) - 1
    if cur:
        lines.append(cur)
    return lines


def draw_runs(c, x, y, runs, size, color=(0, 0, 0)):
    c.setFillColorRGB(*color)
    t = c.beginText(x, y)
    cf = None
    for ch, style in runs:
        f = pick(ch, style)
        if f != cf:
            t.setFont(f, size)
            cf = f
        t.textOut(ch)
    c.drawText(t)


class Renderer(object):
    def __init__(self, c, body_size, leading, total_label):
        self.c = c
        self.body_size = body_size
        self.leading = leading
        self.total_label = total_label
        self.pageno = 0
        self.y = TOP_Y
        self.chapter_pages = {}
        self.used = []
        self.missing = []

    # ---------- page plumbing ----------
    def draw_header(self):
        c = self.c
        c.setFillColorRGB(0, 0, 0)
        c.setFont(BODY_FONT, 9.5)
        c.drawString(MARGIN_X, HEADER_Y, "%s %s" % (SOFT_NAME, SOFT_VERSION))
        c.setFont(BODY_FONT, 9.0)
        c.drawRightString(PW - MARGIN_X, HEADER_Y, "第 %d 页 / 共 %s 页" % (self.pageno, self.total_label))
        c.setStrokeColorRGB(0.6, 0.6, 0.6)
        c.setLineWidth(0.5)
        c.line(MARGIN_X, RULE_Y, PW - MARGIN_X, RULE_Y)

    def new_page(self):
        if self.pageno > 0:
            self.c.showPage()
        self.pageno += 1
        self.y = TOP_Y
        self.draw_header()

    def ensure(self, h):
        if self.y - h < BOTTOM_Y:
            self.new_page()

    def draw_centered(self, text, y, size, color=(0, 0, 0), style="head"):
        runs = inline_runs(text)
        w = runs_width(runs, size)
        draw_runs(self.c, (PW - w) / 2.0, y, runs, size, color)

    # ---------- front matter ----------
    def draw_cover(self, meta):
        self.new_page()
        c = self.c
        y = PH - 175
        self.draw_centered(SOFT_NAME, y, 23, (0.05, 0.12, 0.30))
        y -= 38
        self.draw_centered(DOC_TITLE, y, 20, (0.05, 0.12, 0.30))
        y -= 26
        c.setStrokeColorRGB(0.20, 0.32, 0.52)
        c.setLineWidth(1.2)
        c.line(MARGIN_X + 60, y, PW - MARGIN_X - 60, y)

        y = PH - 360
        for key, val in meta:
            line = "%s：%s" % (key, val)
            runs = inline_runs(line)
            w = runs_width(runs, 13.0)
            draw_runs(c, (PW - w) / 2.0, y, runs, 13.0, (0.10, 0.10, 0.10))
            y -= 30

        y = 150
        self.draw_centered("二〇二六年九月", y, 12.5, (0.25, 0.25, 0.25))

    def draw_toc(self, entries):
        self.new_page()
        self.draw_centered("目　　录", PH - 130, 19, (0.05, 0.12, 0.30))
        y = PH - 175
        size = 12.0
        for title, pno in entries:
            y -= 24.5
            runs = inline_runs(title)
            draw_runs(self.c, MARGIN_X + 34, y, runs, size, (0.10, 0.10, 0.10))
            w = runs_width(runs, size)
            num = str(pno)
            numw = runs_width(inline_runs(num), size)
            x_start = MARGIN_X + 34 + w + 5
            x_end = PW - MARGIN_X - numw - 5
            dotw = char_w("·", "body", size)
            n = int((x_end - x_start) / dotw)
            if n > 0:
                draw_runs(self.c, x_start, y, [("·", "body")] * n, size, (0.62, 0.62, 0.62))
            draw_runs(self.c, PW - MARGIN_X - numw, y, inline_runs(num), size, (0.10, 0.10, 0.10))

    # ---------- block renderers ----------
    def draw_chapter(self, title):
        self.new_page()
        self.chapter_pages[title] = self.pageno
        size = self.body_size + 4.5
        self.y -= 4
        self.y -= size * 1.7
        draw_runs(self.c, MARGIN_X, self.y, inline_runs(title), size, (0.05, 0.12, 0.30), )
        self.y -= 8
        self.c.setStrokeColorRGB(0.20, 0.32, 0.52)
        self.c.setLineWidth(1.0)
        self.c.line(MARGIN_X, self.y, PW - MARGIN_X, self.y)
        self.y -= 16

    def draw_section(self, title):
        size = self.body_size + 1.5
        self.ensure(size * 2.2 + 26)
        self.y -= 14
        self.y -= size * 1.35
        draw_runs(self.c, MARGIN_X, self.y, inline_runs(title), size, (0.08, 0.18, 0.36))
        self.y -= 12

    def draw_hr(self):
        self.ensure(24)
        self.y -= 14
        self.c.setStrokeColorRGB(0.7, 0.7, 0.7)
        self.c.setLineWidth(0.6)
        self.c.line(MARGIN_X, self.y, PW - MARGIN_X, self.y)
        self.y -= 14

    def draw_paragraph(self, text, indent=0.0, space_before=6.0, space_after=9.0,
                       size=None, color=(0.10, 0.10, 0.10)):
        size = size or self.body_size
        leading = self.leading if size == self.body_size else round(size * 1.6, 1)
        markers = SHOT_RE.findall(text)
        text = SHOT_RE.sub("", text).strip()
        if text:
            runs = inline_runs(text)
            lines = wrap_runs(runs, size, CONTENT_W - indent)
            self.ensure(leading * len(lines) + space_before + space_after)
            self.y -= space_before
            for ln in lines:
                self.y -= leading
                draw_runs(self.c, MARGIN_X + indent, self.y, ln, size, color)
            self.y -= space_after
        for m in markers:
            self.draw_figure(m)

    def draw_list_item(self, line, ordered):
        m = re.match(r"^(\s*)(?:(\d+)\.|-)\s+(.*)$", line)
        if not m:
            return
        level = 0 if len(m.group(1)) == 0 else 1
        body = m.group(3)
        marker = (m.group(2) + ".") if m.group(2) else "·"
        indent = level * 20.0
        hang = 24.0
        size = self.body_size
        markers = SHOT_RE.findall(body)
        body = SHOT_RE.sub("", body).strip()
        lines = wrap_runs(inline_runs(body), size, CONTENT_W - indent - hang)
        self.ensure(self.leading * len(lines) + 14)
        self.y -= 4
        first_y = self.y - self.leading
        draw_runs(self.c, MARGIN_X + indent, first_y, inline_runs(marker), size, (0.08, 0.18, 0.36))
        self.y = first_y
        for ln in lines:
            draw_runs(self.c, MARGIN_X + indent + hang, self.y, ln, size, (0.10, 0.10, 0.10))
            self.y -= self.leading
        self.y += self.leading
        self.y -= 6
        for mk in markers:
            self.draw_figure(mk)

    def draw_table(self, rows):
        grid = []
        for raw in rows:
            cells = [c.strip() for c in raw.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c or "-") for c in cells):
                continue
            grid.append(cells)
        if not grid:
            return
        ncol = max(len(r) for r in grid)
        grid = [r + [""] * (ncol - len(r)) for r in grid]
        size = max(9.5, self.body_size - 3.5)
        leading = round(size * 1.55, 1)
        pad = 5.0
        widths = []
        for ci in range(ncol):
            mx = max(runs_width(inline_runs(r[ci]), size) for r in grid)
            widths.append(mx)
        total = sum(widths) or 1.0
        avail = CONTENT_W - 0
        widths = [max(46.0, w / total * avail) for w in widths]
        scale = avail / sum(widths)
        widths = [w * scale for w in widths]

        wrapped = []
        for r in grid:
            cell_lines = []
            for ci, cell in enumerate(r):
                cell_lines.append(wrap_runs(inline_runs(cell), size, widths[ci] - 2 * pad))
            wrapped.append(cell_lines)
        row_h = [max(len(cl) for cl in r) * leading + 2 * pad for r in wrapped]
        self.ensure(sum(row_h) + 20)
        self.y -= 12
        for ri, row in enumerate(wrapped):
            h = row_h[ri]
            self.y -= h
            if ri == 0:
                self.c.setFillColorRGB(0.90, 0.92, 0.95)
                self.c.rect(MARGIN_X, self.y, sum(widths), h, stroke=0, fill=1)
            x = MARGIN_X
            for ci, cell_lines in enumerate(row):
                ty = self.y + h - pad - leading * 0.85
                for ln in cell_lines:
                    draw_runs(self.c, x + pad, ty, ln, size, (0.10, 0.10, 0.10))
                    ty -= leading
                x += widths[ci]
            self.c.setStrokeColorRGB(0.60, 0.60, 0.60)
            self.c.setLineWidth(0.5)
            self.c.line(MARGIN_X, self.y, MARGIN_X + sum(widths), self.y)
        x = MARGIN_X
        self.c.setStrokeColorRGB(0.60, 0.60, 0.60)
        self.c.setLineWidth(0.5)
        for w in widths:
            self.c.line(x, self.y, x, self.y + sum(row_h))
            x += w
        self.c.line(x, self.y, x, self.y + sum(row_h))
        self.y -= 14

    def draw_figure(self, marker):
        entry = SHOT_MAP.get(marker)
        if isinstance(entry, str):
            paths = [entry]
        elif isinstance(entry, (list, tuple)):
            paths = list(entry)
        else:
            paths = []
        paths = [p for p in paths if p and os.path.exists(p)]
        if paths:
            n = len(paths)
            for idx, path in enumerate(paths, 1):
                iw, ih = ImageReader(path).getSize()
                w = CONTENT_W * FIG_SCALE
                h = w * float(ih) / float(iw)
                if h > FIG_MAX_H:
                    h = FIG_MAX_H
                    w = h * float(iw) / float(ih)
                fx = MARGIN_X + (CONTENT_W - w) / 2.0
                self.ensure(h + 44)
                self.y -= 8
                self.y -= h
                self.c.drawImage(path, fx, self.y, width=w, height=h,
                                 preserveAspectRatio=True, anchor="c")
                self.y -= 16
                cap = "图：" + marker
                if n > 1:
                    cap += "（%d/%d）" % (idx, n)
                self.draw_centered(cap, self.y, 9.5, (0.30, 0.30, 0.30))
                self.y -= 16
            self.used.append(marker)
        else:
            h = 118.0
            self.ensure(h + 44)
            self.y -= 8
            self.y -= h
            self.c.setStrokeColorRGB(0.78, 0.40, 0.40)
            self.c.setLineWidth(0.8)
            self.c.setDash(3, 3)
            self.c.rect(MARGIN_X, self.y, CONTENT_W, h, stroke=1, fill=0)
            self.c.setDash()
            self.draw_centered("【待补充截图】" + marker, self.y + h / 2.0 + 4, 12.0, (0.70, 0.20, 0.20))
            self.draw_centered("请插入对应的界面截图后重新生成", self.y + h / 2.0 - 18, 10.0, (0.55, 0.30, 0.30))
            self.y -= 16
            self.draw_centered("图：" + marker, self.y, 9.5, (0.30, 0.30, 0.30))
            self.y -= 16
            self.missing.append(marker)


def parse_document():
    with io.open(DOC_MD, "r", encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    body_start = None
    for i, ln in enumerate(lines):
        if ln.startswith("## 1 "):
            body_start = i
            break
    if body_start is None:
        raise RuntimeError("未找到正文起始章节（## 1 软件概述）")
    return lines[body_start:]


def collect_chapters(body_lines):
    out = []
    for ln in body_lines:
        if ln.startswith("## "):
            out.append(ln[3:].strip())
    return out


def draw_body(r, body_lines):
    i = 0
    n = len(body_lines)
    while i < n:
        line = body_lines[i].rstrip()
        s = line.strip()
        if not s:
            i += 1
            continue
        if s.startswith("### "):
            r.draw_section(s[4:].strip())
            i += 1
            continue
        if s.startswith("## "):
            r.draw_chapter(s[3:].strip())
            i += 1
            continue
        if s == "***":
            r.draw_hr()
            i += 1
            continue
        if s.startswith("|"):
            tbl = []
            while i < n and body_lines[i].strip().startswith("|"):
                tbl.append(body_lines[i].strip())
                i += 1
            r.draw_table(tbl)
            continue
        if re.match(r"^\s*(\d+\.|-)\s+", line):
            r.draw_list_item(line, bool(re.match(r"^\s*\d+\.\s+", line)))
            i += 1
            continue
        r.draw_paragraph(s)
        i += 1


def render(body_size, leading, toc_entries, total_label, out):
    c = rl_canvas.Canvas(out, pagesize=PAGE)
    c.setTitle("%s %s %s" % (SOFT_NAME, DOC_TITLE, SOFT_VERSION))
    c.setAuthor(OWNER)
    c.setSubject("%s %s 软件著作权登记材料" % (SOFT_NAME, DOC_TITLE))
    r = Renderer(c, body_size, leading, total_label)
    meta = [
        ("软件全称（登记名）", SOFT_NAME),
        ("软件简称", SOFT_SHORT),
        ("登记版本号", SOFT_VERSION),
        ("著作权人", OWNER),
        ("开发完成日期", DONE_DATE),
        ("文档名称", DOC_TITLE),
    ]
    r.draw_cover(meta)
    if toc_entries is not None:
        r.draw_toc(toc_entries)
    else:
        r.new_page()
    draw_body(r, BODY_LINES)
    c.save()
    return r


def dry_render(body_size, leading):
    buf = io.BytesIO()
    r = render(body_size, leading, None, "--", buf)
    return r


def main():
    global BODY_LINES, CHAPTER_TITLES
    register_fonts()
    BODY_LINES = parse_document()
    CHAPTER_TITLES = collect_chapters(BODY_LINES)
    print("[doc] 正文章节数=%d，正文行数=%d" % (len(CHAPTER_TITLES), len(BODY_LINES)))

    chosen = None
    size = 14.0
    while size <= 22.01:
        leading = round(size * 2.05, 1)
        r = dry_render(size, leading)
        body_pages = r.pageno - FRONT_PAGES
        print("[fit] size=%.1f leading=%.1f -> 正文 %d 页（总 %d 页）" % (size, leading, body_pages, r.pageno))
        if body_pages >= TARGET_BODY_PAGES:
            chosen = (size, leading, body_pages)
            break
        size += 0.5
    if chosen is None:
        raise RuntimeError("在字号 22pt 内仍无法达到 %d 页正文" % TARGET_BODY_PAGES)

    base_size = chosen[0]
    lo = round(base_size * 0.95, 1)
    hi = round(base_size * 2.60, 1)

    def pages_at(lead):
        rr = dry_render(base_size, lead)
        return rr.pageno - FRONT_PAGES

    best = None
    lead = lo
    while lead <= hi:
        p = pages_at(lead)
        print("[fit] 微调 size=%.1f leading=%.1f -> 正文 %d 页" % (base_size, lead, p))
        if p >= TARGET_BODY_PAGES:
            best = (base_size, lead, p)
            break
        lead = round(lead + 0.5, 1)
    if best is None:
        best = chosen
    else:
        coarse_lead = best[1]
        fine = round(max(lo, coarse_lead - 0.5), 1)
        while fine < coarse_lead:
            fine = round(fine + 0.1, 1)
            p = pages_at(fine)
            print("[fit] 细化 size=%.1f leading=%.1f -> 正文 %d 页" % (base_size, fine, p))
            if p >= TARGET_BODY_PAGES:
                best = (base_size, fine, p)
                break

    body_size, leading, body_pages = best
    print("[fit] 采用 size=%.1f leading=%.1f 正文=%d 页" % (body_size, leading, body_pages))

    probe = dry_render(body_size, leading)
    total_pages = probe.pageno
    toc = [(t, probe.chapter_pages.get(t, 0)) for t in CHAPTER_TITLES]

    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    r = render(body_size, leading, toc, str(total_pages), OUT_PDF)
    print("[out] %s" % OUT_PDF)
    print("[out] 总页数=%d 正文页数=%d 已插入截图=%d 待补充截图=%d"
          % (r.pageno, r.pageno - FRONT_PAGES, len(r.used), len(r.missing)))
    if r.missing:
        print("[missing] 待补充截图清单：")
        for m in r.missing:
            print("  - %s" % m)


if __name__ == "__main__":
    BODY_LINES = []
    CHAPTER_TITLES = []
    main()

# -*- coding: utf-8 -*-
"""把源码中残留的 Inkpad 内部标识符 / 文件名统一改名为 L.Note 命名（一次性迁移脚本）。

替换采用「整词精确替换」，逐条登记命中次数，支持 --dry-run。
兼容红线（localStorage 键、剪贴板 MIME、富文档内容标记、欢迎文档匹配源）一律不动。
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

MAPPING = [
    # ---- 标识符（IPC 回调 / 原生 API 类）----
    ("InkpadApi", "LNoteApi"),
    ("__inkpadOpenExternalFiles", "__lnoteOpenExternalFiles"),
    ("__inkpadTranslateCb", "__lnoteTranslateCb"),
    ("__inkpadAiTestCb", "__lnoteAiTestCb"),
    ("__inkpadAiChatCb", "__lnoteAiChatCb"),
    ("__inkpadAiDiagramCb", "__lnoteAiDiagramCb"),
    ("__inkpadUpdateCb", "__lnoteUpdateCb"),
    ("__inkpadDataUriFold", "__lnoteDataUriFold"),
    # ---- 文件名（spec / 构建插件 / 样式）----
    ("InkpadMac.spec", "LNoteMac.spec"),
    ("InkpadDebug.spec", "LNoteDebug.spec"),
    ("Inkpad.spec", "LNote.spec"),
    ("vite-plugin-inkpad", "vite-plugin-lnote"),
    ("inkpad-rich.css", "lnote-rich.css"),
    # ---- 构建插件内部品牌 ----
    ("inkpadPlugin", "lNotePlugin"),
    ("inkpad-build", "lnote-build"),
    ("[inkpad]", "[L.Note]"),
]

EXTS = {".js", ".mjs", ".py", ".html", ".css", ".json", ".md", ".ps1", ".bat", ".sh", ".iss", ".spec", ".txt"}

SKIP_DIRS = {
    ".git", "node_modules", "dist", "dist-web", "release", "screenshots",
    "cmaps", "standard_fonts", "_vfy", "build", "__pycache__",
}
SKIP_REL_DIRS = {
    os.path.join("docs", "软著材料"),
}
SKIP_FILES = {"js/app.js", "_brand_rename.py"}

# 兼容红线：这些 token 属于「已落盘用户数据 / 剪贴板互通 / 旧文档迁移匹配源」，不得改名
KEEP_TOKENS = (
    "inkpad.docs.v1", "inkpad.content.", "inkpad.active.v1", "inkpad.cursor.",
    "inkpad.tagmeta.v1", "inkpad.fontsize", "inkpad.collections.v1",
    "inkpad.settings.v1", "inkpad.docmap.v1", "inkpad.fr.v1", "inkpad.clip.v1",
    "inkpad.sortgroup", "application/x-inkpad-mind", "_inkpad_mind_copy",
    "<!-- inkpad:rich -->",
)


def should_skip(rel):
    for d in SKIP_REL_DIRS:
        if rel.startswith(d + os.sep) or rel.startswith(d + "/"):
            return True
    return False


def iter_targets():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in EXTS:
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT)
            if rel.replace("\\", "/") in SKIP_FILES:
                continue
            if should_skip(rel):
                continue
            yield rel, full


def census(dry):
    """统计仍然残留的 inkpad 字样（排除兼容红线 token）。"""
    pat = re.compile(r"inkpad", re.IGNORECASE)
    hits = {}
    for rel, full in iter_targets():
        try:
            with open(full, "r", encoding="utf-8") as fh:
                lines = fh.readlines()
        except (UnicodeDecodeError, OSError):
            continue
        for i, line in enumerate(lines, 1):
            if not pat.search(line):
                continue
            probe = line
            for keep in KEEP_TOKENS:
                probe = probe.replace(keep, "")
            if not pat.search(probe):
                continue
            hits.setdefault(rel, []).append(i)
    print("=== 品牌残留普查（已排除 %d 个兼容红线 token）===" % len(KEEP_TOKENS))
    total = 0
    for rel in sorted(hits):
        total += len(hits[rel])
        linenos = ",".join(str(n) for n in hits[rel][:14])
        more = "" if len(hits[rel]) <= 14 else " ..."
        print("%-52s %d 行: %s%s" % (rel, len(hits[rel]), linenos, more))
    print("-" * 72)
    print("残留行数合计：%d" % total)
    return total


def main():
    dry = "--dry-run" in sys.argv
    if "--census" in sys.argv:
        census(dry)
        return 0

    total = {src: 0 for src, _ in MAPPING}
    touched = []
    for rel, full in iter_targets():
        try:
            with open(full, "r", encoding="utf-8") as fh:
                text = fh.read()
        except (UnicodeDecodeError, OSError):
            continue
        hits = {src: text.count(src) for src, _ in MAPPING}
        hits = {k: v for k, v in hits.items() if v}
        if not hits:
            continue
        new = text
        for src, dst in MAPPING:
            new = new.replace(src, dst)
        for k, v in hits.items():
            total[k] += v
        touched.append((rel, hits))
        if not dry:
            with open(full, "w", encoding="utf-8", newline="") as fh:
                fh.write(new)

    for rel, hits in sorted(touched):
        detail = ", ".join("%s x%d" % (k, v) for k, v in sorted(hits.items()))
        print("%-52s %s" % (rel, detail))
    print("-" * 72)
    print("涉及文件：%d 个；替换次数：" % len(touched))
    for src, dst in MAPPING:
        print("  %-26s -> %-26s %d" % (src, dst, total[src]))
    print("模式：%s" % ("DRY-RUN（未写盘）" if dry else "已写盘"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

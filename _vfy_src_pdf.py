# -*- coding: utf-8 -*-
import os
import re

from pypdf import PdfReader

PDF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "软著材料", "源程序.pdf")
r = PdfReader(PDF)
print("PDF 页数：%d" % len(r.pages))

counts = []
for i, p in enumerate(r.pages):
    t = p.extract_text(extraction_mode="layout") or ""
    lines = [x for x in t.split("\n") if x.strip()]
    counts.append(len(lines))

print("每页排版行数：min=%d max=%d" % (min(counts), max(counts)))
short = [(i + 1, n) for i, n in enumerate(counts) if n < 50]
print("不足 50 行的页：%s" % (short if short else "无"))

t1 = r.pages[0].extract_text() or ""
t60 = r.pages[-1].extract_text() or ""
print("P1 含软件全称+版本号：%s" % ("L.Note本地笔记编辑软件 V1.0.0" in t1))
print("P1 含页码：%s" % ("第 1 页 / 共 60 页" in t1))
print("P60 含页码：%s" % ("第 60 页 / 共 60 页" in t60))

allt = "".join((p.extract_text() or "") for p in r.pages)
print("中文抽取正常：%s" % ("桌面外壳" in allt or "文件" in allt))
print("问号占位数量：%d" % allt.count("?"))
print("品牌串污染检查（Notion/Inkpad 品牌署名）：%s"
      % ("有" if re.search(r"Notion|Inkpad", allt) else "无"))
print("P1 前 6 行：")
for ln in (t1.split("\n")[:6]):
    print("   |" + ln)
print("P60 前 6 行：")
for ln in (t60.split("\n")[:6]):
    print("   |" + ln)

print("提交 60 页涵盖的源文件分隔标记：")
for i, p in enumerate(r.pages):
    for ln in (p.extract_text() or "").split("\n"):
        if "====" in ln and ln.count("=") >= 20:
            print("   P%-3d %s" % (i + 1, ln.strip()))

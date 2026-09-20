# -*- coding: utf-8 -*-
"""复验软著申请「操作说明书」PDF 的排版合规性。

校验项（依据说明书「填写说明」第 3、4 条）：
  - 正文满 60 页
  - 每页页眉统一为「软件全称 + 版本号」
  - 页码连续、总数一致
  - 中文抽取正常、无问号占位泛滥
  - 无历史品牌串（Notion / Inkpad）污染
"""

import os
import re

from pypdf import PdfReader

ROOT = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(ROOT, "docs", "软著材料", "操作说明书.pdf")

SOFT_NAME = "L.Note本地笔记编辑软件"
SOFT_VERSION = "V1.0.0"
OWNER = "刘云杰"
DONE_DATE = "2026-09-01"
TARGET_BODY_PAGES = 60
FRONT_PAGES = 2  # 封面 1 页 + 目录 1 页

r = PdfReader(PDF)
total = len(r.pages)
body_pages = total - FRONT_PAGES
print("PDF 总页数：%d" % total)
print("正文页数：%d（目标 >= %d）%s"
      % (body_pages, TARGET_BODY_PAGES, "PASS" if body_pages >= TARGET_BODY_PAGES else "FAIL"))

texts = [(p.extract_text() or "") for p in r.pages]
layouts = [(p.extract_text(extraction_mode="layout") or "") for p in r.pages]

head_ok = []
head_miss = []
pageno_ok = []
pageno_bad = []
for i, t in enumerate(texts):
    n = i + 1
    head = "%s %s" % (SOFT_NAME, SOFT_VERSION)
    if head in t:
        head_ok.append(n)
    else:
        head_miss.append(n)
    exp = "第 %d 页 / 共 %d 页" % (n, total)
    if exp in t:
        pageno_ok.append(n)
    else:
        pageno_bad.append(n)

print("页眉含「%s」的页数：%d/%d %s"
      % ("%s %s" % (SOFT_NAME, SOFT_VERSION), len(head_ok), total,
         "PASS" if not head_miss else "FAIL"))
if head_miss:
    print("  缺页眉的页：%s" % head_miss)

print("页码连续的页数：%d/%d %s"
      % (len(pageno_ok), total, "PASS" if not pageno_bad else "FAIL"))
if pageno_bad:
    print("  页码异常的页：%s" % pageno_bad)

t1 = texts[0]
t2 = texts[1]
print("封面含软件全称：%s" % (SOFT_NAME in t1))
print("封面含登记版本号：%s" % (SOFT_VERSION in t1))
print("封面含著作权人：%s" % (OWNER in t1))
print("封面含开发完成日期：%s" % (DONE_DATE in t1))
print("封面含文档名称（操作说明书）：%s" % ("操作说明书" in t1))
print("第 2 页为目录页：%s" % ("目" in t2 and "录" in t2))

allt = "".join(texts)
print("中文抽取正常：%s" % ("文档" in allt and "编辑" in allt))
print("问号占位数量：%d" % allt.count("?"))
print("品牌串污染检查（Notion/Inkpad 品牌署名）：%s"
      % ("有" if re.search(r"Notion|Inkpad", allt) else "无"))

used = len(re.findall(r"图：", allt))
ph = len(re.findall(r"待补充截图", allt))
print("已插入截图题注数量：%d" % used)
print("待补充截图占位数：%d %s" % (ph, "PASS（无缺口）" if ph == 0 else "（存在素材缺口）"))

print("封面前 12 行：")
for ln in t1.split("\n")[:12]:
    print("   |" + ln)
print("目录页前 12 行：")
for ln in t2.split("\n")[:12]:
    print("   |" + ln)

print("正文首页（P3）前 8 行：")
for ln in texts[2].split("\n")[:8]:
    print("   |" + ln)

empty = [i + 1 for i, l in enumerate(layouts) if len(l.strip()) < 30]
print("内容异常稀疏的页：%s" % (empty if empty else "无"))

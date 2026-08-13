#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 L.NOTE 方案 C 图标的多尺寸 PNG + Windows .ico。

配色对齐应用内按钮主色：左上 #3370FF -> 右下 #2860E1（品牌蓝对角渐变）；
L 笔画为白色，墨点为白色实心圆 #FFFFFF（还原方案 C 原版）。
"""
import os
import numpy as np
from PIL import Image, ImageDraw

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
SIZES = [1024, 512, 256, 128, 64, 32]
ICO_SIZES = [256, 128, 64, 48, 32, 16]

# 对角渐变端点（品牌蓝，与页面按钮 #3370FF / hover #2860E1 一致）
BLUE_A = np.array([51, 112, 255], dtype=np.float32)    # #3370FF（左上，offset 0）
BLUE_B = np.array([40, 96, 225], dtype=np.float32)     # #2860E1（右下，offset 1）

# 基准画布 1024 坐标系下的图形定义（与 icon-L.NOTE.svg 一致）
BG_MARGIN = 64
BG_RX = 200
L_VERT = (300, 290, 450, 760)   # 竖笔 x0,y0,x1,y1
L_HORZ = (300, 620, 730, 760)   # 横笔
L_RX = 62
DOT = (742, 298, 74)            # cx, cy, r
DOT_COLOR = (255, 255, 255)     # #FFFFFF 白色墨点（还原方案 C 原版）


def build(size):
    k = size / 1024.0
    # 1) 对角线性渐变背景
    yy, xx = np.mgrid[0:size, 0:size]
    t = (xx + yy) / (2.0 * size)          # 0..1 对角
    t = np.clip(t, 0.0, 1.0)
    buf = (BLUE_A[None, None, :] * (1 - t[..., None]) +
           BLUE_B[None, None, :] * t[..., None])
    img = Image.fromarray(buf.astype(np.uint8), 'RGB').convert('RGBA')

    # 2) 圆角矩形遮罩（底板外透明）
    mask = Image.new('L', (size, size), 0)
    md = ImageDraw.Draw(mask)
    m0 = int(round(BG_MARGIN * k))
    m1 = int(round((1024 - BG_MARGIN) * k))
    rad = max(1, int(round(BG_RX * k)))
    md.rounded_rectangle([m0, m0, m1, m1], radius=rad, fill=255)
    img.putalpha(mask)

    # 3) L 笔画（白）+ 墨点（深红莓）
    d = ImageDraw.Draw(img)

    def rc(box):
        return [int(round(v * k)) for v in box]

    d.rounded_rectangle(rc(L_VERT), radius=max(1, int(round(L_RX * k))), fill='white')
    d.rounded_rectangle(rc(L_HORZ), radius=max(1, int(round(L_RX * k))), fill='white')
    cx, cy, r = DOT
    d.ellipse([int(round((cx - r) * k)), int(round((cy - r) * k)),
               int(round((cx + r) * k)), int(round((cy + r) * k))], fill=DOT_COLOR)
    return img


def main():
    for s in SIZES:
        im = build(s)
        fn = os.path.join(OUT_DIR, 'icon-L.NOTE-%dx%d.png' % (s, s))
        im.save(fn, 'PNG')
        print('saved', fn, im.size)

    # Windows .ico 多尺寸（从 256 源图生成 16~256 嵌入）
    src = build(256)
    ico_path = os.path.join(OUT_DIR, 'icon-L.NOTE.ico')
    src.save(ico_path, format='ICO', sizes=[(s, s) for s in ICO_SIZES])
    print('saved', ico_path)


if __name__ == '__main__':
    main()

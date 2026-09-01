# -*- coding: utf-8 -*-
"""
Inkpad 桌面版入口
用 pywebview（Edge WebView2 内核）加载本地编辑器页面，
并通过 js_api 向前端暴露原生文件保存对话框。
"""
import os
import sys
import time
import threading
import base64
import json
import struct
import re
import html as _html

import webview

# 供文件比较窗口读取的待比较数据
pending_compare = None

# 供图片查看器窗口读取的待查看图片
pending_image = None

# 供主编辑器窗口读取的「打开方式」传入的非图片文件
pending_open_file = None

# 版本号（与 js/app.js 页脚保持一致）
APP_VERSION = "0.21.10"


def resource_path(rel: str) -> str:
    """兼容开发运行与 PyInstaller 打包后的资源路径。"""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


def _debug_log(msg: str):
    """写入调试日志（%LOCALAPPDATA%/L.Note/debug.log），用于排查「打开方式」传参问题。"""
    try:
        log_dir = os.path.join(
            os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "L.Note"
        )
        os.makedirs(log_dir, exist_ok=True)
        with open(os.path.join(log_dir, "debug.log"), "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S") + "  " + msg + "\n")
    except Exception:
        pass


def _parse_clx_pieces(clx: bytes, wd: bytes):
    """解析 CLX（Prc/Pcdt 块）中的 piece table，返回文本片段列表。

    PCD 的 fc 最高位（0x40000000）表示压缩 ANSI（cp1252）piece，
    否则为 UTF-16LE（fc 为字节偏移）。
    """
    out = []
    pos = 0
    n = len(clx)
    while pos < n:
        tag = clx[pos]
        if tag == 0x01:  # Prc：跳过属性
            lcb = struct.unpack_from("<I", clx, pos + 1)[0]
            pos += 5 + lcb
        elif tag == 0x02:  # Pcdt：piece table
            lcb = struct.unpack_from("<I", clx, pos + 1)[0]
            pcdt = clx[pos + 5: pos + 5 + lcb]
            plen = len(pcdt)
            if plen < 4:
                break
            ncp = (plen - 4) // 12
            if ncp <= 0:
                break
            cps = struct.unpack_from("<%dI" % (ncp + 1), pcdt, 0)
            for i in range(ncp):
                pcd_off = 4 * (ncp + 1) + i * 8
                fc = struct.unpack_from("<I", pcdt, pcd_off)[0]
                nchars = cps[i + 1] - cps[i]
                if nchars <= 0:
                    continue
                if fc & 0x40000000:
                    fpos = (fc & 0x3FFFFFFF) // 2
                    raw = wd[fpos: fpos + nchars]
                    piece = raw.decode("cp1252", errors="surrogateescape")
                    out.append(_fix_mojibake(piece))
                else:
                    fpos = fc & 0x3FFFFFFF
                    raw = wd[fpos: fpos + nchars * 2]
                    out.append(raw.decode("utf-16-le", errors="replace"))
            break
        else:
            break
    return out


def _decode_text_loose(data: bytes) -> str:
    """按常见编码尝试解码文本，全部失败时用替换字符兜底。"""
    for enc in ("utf-8", "utf-16", "gbk", "cp1252"):
        try:
            return data.decode(enc)
        except Exception:
            continue
    return data.decode("utf-8", errors="replace")


def _fix_mojibake(text: str) -> str:
    """还原被 CP1252 误解码的 UTF-8/GBK 文本（mojibake）。

    规则：文本重新按 CP1252 编码回字节（surrogateescape 无损还原 cp1252
    未定义字节），再依次尝试按 UTF-8 / GBK 解码；仅当结果含中日韩字符且
    与原文本不同才采用，避免误伤正常 cp1252 文本。无法还原的残留代理
    字符转为 U+FFFD，保证输出可安全序列化。
    """
    if not text:
        return text
    try:
        raw = text.encode("cp1252", errors="surrogateescape")
    except Exception:
        return text
    for enc in ("utf-8", "gbk"):
        try:
            fixed = raw.decode(enc)
        except Exception:
            continue
        if fixed != text and re.search(r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]", fixed):
            return fixed
    if re.search(r"[\udc80-\udcff]", text):
        return re.sub(r"[\udc80-\udcff]", "\ufffd", text)
    return text


def _extract_rtf_text(data: bytes) -> str:
    """简易 RTF 文本提取：剥离控制字与分组，支持 \\uN、\\'xx 转义。

    覆盖 Word/WPS 导出的常见 RTF；不支持的属性控制字一律忽略。
    """
    s = data.decode("latin-1", errors="replace")
    out = []
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            i += 1
            if i < n and s[i] in "{}":
                out.append(s[i])
                i += 1
                continue
            if i < n and s[i] == "'":
                try:
                    out.append(chr(int(s[i + 1:i + 3], 16)))
                    i += 3
                except Exception:
                    i += 1
                continue
            j = i
            while j < n and s[j].isalpha():
                j += 1
            word = s[i:j]
            k = j
            neg = False
            if k < n and s[k] == "-":
                neg = True
                k += 1
            d = k
            while d < n and s[d].isdigit():
                d += 1
            param = s[k:d]
            i2 = d
            if word != "u" and i2 < n and s[i2] == " ":
                i2 += 1
            if word == "u" and param:
                v = int(("-" if neg else "") + param)
                if v < 0:
                    v += 0x10000
                out.append(chr(v))
                if i2 < n and s[i2] not in "\\{}":
                    i2 += 1
                i = i2
            elif word in ("par", "line", "cr"):
                out.append("\n")
                i = i2
            elif word == "tab":
                out.append("\t")
                i = i2
            elif word in ("emspace", "enspace", "qmspace"):
                out.append(" ")
                i = i2
            else:
                i = i2
        elif c in "{}":
            i += 1
        elif c in "\r\n":
            out.append("\n")
            i += 1
        else:
            out.append(c)
            i += 1
    lines = "".join(out).split("\n")
    return "\n".join(ln.strip() for ln in lines).strip("\n")


def _extract_zip_doc_text(path_or_data) -> str:
    """ZIP 容器：可能是 .docx/.odt 改名，读 document.xml 提取文本。

    参数可以是文件路径或已读入的字节（用于 UTF-8 化二进制还原后的解析）。
    """
    import io
    import zipfile
    if isinstance(path_or_data, (bytes, bytearray)):
        zf = zipfile.ZipFile(io.BytesIO(bytes(path_or_data)))
    else:
        zf = zipfile.ZipFile(path_or_data)
    with zf as z:
        name = None
        for cand in ("word/document.xml", "content.xml"):
            if cand in z.namelist():
                name = cand
                break
        if not name:
            raise ValueError("是 ZIP/OOXML 文档，但缺少正文流（word/document.xml）")
        xml = z.read(name).decode("utf-8", errors="replace")
    xml = re.sub(r"<(w:p|text:p)[ >]", "\n", xml)
    xml = re.sub(r"<[^>]+>", "", xml)
    return _html.unescape(xml).strip()


def _strip_html_text(s: str) -> str:
    """剥离 HTML 标签与脚本，保留段落换行。"""
    s = re.sub(r"(?is)<(head|script|style)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</(p|div|tr)[^>]*>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"[ \t\u00a0]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n\n", s)
    return _html.unescape(s).strip()


def _extract_html_text(data: bytes) -> str:
    """HTML 伪装的 .doc：按页面声明编码解码后剥离标签，保留段落换行。"""
    head = data[:4096].lower()
    if b"charset=gb2312" in head or b"charset=gbk" in head or b"charset=gb18030" in head:
        s = data.decode("gb18030", errors="replace")
    else:
        s = data.decode("utf-8", errors="replace")
    return _strip_html_text(s)


def _find_html_body(data: bytes) -> int:
    """全文件扫描 HTML 正文起点；HTML 标记可能位于文件深处，返回 -1 表示未找到。"""
    lower = data.lower()
    pos = -1
    for marker in (b"<!doctype html", b"<html", b"<head", b"<body", b"<meta"):
        idx = lower.find(marker)
        if idx >= 0 and (pos < 0 or idx < pos):
            pos = idx
    return pos


def _looks_like_real_html(text: str) -> bool:
    """粗略判断 HTML 剥离结果是否像真实文档内容（拦截误判）。"""
    if not text:
        return False
    bad = sum(1 for ch in text if ord(ch) < 32 and ch not in "\n\r\t")
    if bad > max(8, len(text) * 0.05):
        return False
    if text.count("\ufffd") > max(8, len(text) * 0.1):
        return False
    return True


def _post_process_doc_text(text: str) -> str:
    """对已提取的文档文本统一后处理：还原 mojibake、若含 HTML 则剥离标签。"""
    if not text:
        return text
    text = _fix_mojibake(text)
    if re.search(r"(?i)<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]", text):
        text = _strip_html_text(text)
    return text.strip()


def _extract_ole_doc_text(path_or_data) -> str:
    """用 olefile 从旧版 .doc（Word 97-2003 OLE2 复合文档）提取纯文本。

    WordDocument 流 FIB（fibRgLw）中：ccpText 在偏移 96，fcClx 在 120，lcbClx 在 124；
    CLX 位于表流（1Table/0Table）的 fcClx 处。
    参数可以是文件路径或已读入的字节（用于 UTF-8 化二进制还原后的解析）。
    """
    import io
    import olefile

    if isinstance(path_or_data, (bytes, bytearray)):
        ole = olefile.OleFileIO(io.BytesIO(bytes(path_or_data)))
    else:
        ole = olefile.OleFileIO(path_or_data)
    try:
        if not ole.exists("WordDocument"):
            raise ValueError("不是有效的 .doc 文件（缺少 WordDocument 流）")
        wd = ole.openstream("WordDocument").read()
        if len(wd) < 128:
            raise ValueError("不是有效的 .doc 文件（WordDocument 流过短）")
        ccp_text = struct.unpack_from("<I", wd, 96)[0]
        if ccp_text <= 0:
            return ""
        fc_clx, lcb_clx = struct.unpack_from("<II", wd, 120)
        if ole.exists("1Table"):
            table_name = "1Table"
        elif ole.exists("0Table"):
            table_name = "0Table"
        else:
            raise ValueError("不是有效的 .doc 文件（缺少表流）")
        table = ole.openstream(table_name).read()
        clx = table[fc_clx: fc_clx + lcb_clx]
        text = "".join(_parse_clx_pieces(clx, wd))
        return text[:ccp_text]
    finally:
        ole.close()


def _try_restore_utf8_wrapped_bytes(data: bytes):
    """检测"UTF-8 化二进制"并还原真实字节。

    某些环境保存 .doc 时会把二进制当作 latin-1/cp1252 文本读出，再整体以
    UTF-8 编码写入，典型特征：OLE2 头 D0 CF 11 E0 A1 B1 1A E1 变成
    C3 90 C3 8F 11 C3 A0 C2 A1 C2 B1 1A C3 A1。此时文件整体是合法 UTF-8，
    解码后用 latin-1 回编（0x00-0xFF 全部无损）即可还原原始二进制。

    仅当还原字节匹配已知格式签名（OLE2/RTF/ZIP/HTML）才返回，避免误伤
    正常 UTF-8 纯文本（中文文本无法以 latin-1 回编，天然被排除）。
    """
    try:
        text = data.decode("utf-8")
    except Exception:
        return None
    try:
        raw = text.encode("latin-1")
    except Exception:
        return None
    if len(raw) < 8:
        return None
    if raw[:8] == b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1":
        return raw
    stripped = raw.lstrip(b"\xef\xbb\xbf\x00 \t\r\n")
    if (
        stripped[:5].upper() == b"{\\RTF"
        or raw[:4] == b"PK\x03\x04"
        or stripped[:4] == b"PK\x03\x04"
    ):
        return raw
    if _find_html_body(raw) >= 0:
        return raw
    return None


def _extract_doc_core(data: bytes) -> str:
    """文档解析核心：data 为原始或已还原的真实字节。"""
    head = data[:8]
    if head == b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1":
        try:
            return _post_process_doc_text(_extract_ole_doc_text(data))
        except Exception:
            pass  # 伪 OLE2（签名匹配但结构损坏）：降级走 HTML/文本兜底
    stripped = data.lstrip(b"\xef\xbb\xbf\x00 \t\r\n")
    if stripped[:5].upper() == b"{\\RTF":
        return _extract_rtf_text(data)
    if data[:4] == b"PK\x03\x04" or stripped[:4] == b"PK\x03\x04":
        return _extract_zip_doc_text(data)
    idx = _find_html_body(data)
    if idx >= 0:
        text = _extract_html_text(data[idx:])
        if _looks_like_real_html(text):
            return text
    txt = _fix_mojibake(_decode_text_loose(data))
    control = sum(1 for ch in txt if ord(ch) < 9 or 13 < ord(ch) < 32)
    if txt and control > max(8, len(txt) * 0.05):
        raise ValueError("无法识别的文档格式（已尝试 OLE2/RTF/HTML/ZIP/文本解析）")
    return txt.strip()


def _extract_doc_text(path: str) -> str:
    """从 .doc 提取纯文本：自动识别 OLE2 / RTF / ZIP(OOXML) / HTML / 纯文本。

    旧版 .doc 在 Windows 生态中常见伪装格式（RTF/HTML/文本），Word 能打开，
    因此除了 OLE2 复合文档还做多格式兜底，保证尽量展示内容。
    另处理"UTF-8 化二进制"：二进制被当作 latin-1 文本保存后整体再以
    UTF-8 编码（文件头形如 C3 90 C3 8F ...），需先还原字节再解析。
    """
    with open(path, "rb") as f:
        data = f.read()
    restored = _try_restore_utf8_wrapped_bytes(data)
    if restored is not None:
        data = restored
    return _extract_doc_core(data)


class CmpApi:
    """文件比较窗口的 API：取回主窗口传入的数据，并支持窗口内加载文件。"""

    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def get_data(self):
        return pending_compare

    def pick_file(self):
        if not self._window:
            return None
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG, file_types=("所有文件 (*.*)",)
        )
        if isinstance(result, (list, tuple)):
            return result[0] if result else None
        if isinstance(result, str):
            return result
        return None

    def read_file(self, path: str, encoding=None):
        return _read_text_file(path, encoding)


class ImvApi:
    """图片查看/编辑窗口的 API：取回图片数据，并提供覆盖保存与另存为。"""

    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def get_image(self):
        """返回待查看/编辑的图片。单图编辑模式下从磁盘读取并转 data URI。"""
        p = pending_image or {}
        src = p.get("src") or ""
        path = p.get("path") or ""
        name = p.get("name") or "图片"
        if not src and path and os.path.isfile(path):
            mime = _guess_mime(path)
            try:
                with open(path, "rb") as f:
                    raw = f.read()
                src = "data:%s;base64,%s" % (mime, base64.b64encode(raw).decode("ascii"))
            except Exception:
                src = ""
        return {
            "src": src,
            "name": name,
            "path": path,
            "mime": _guess_mime(path) if path else "",
        }

    def save_image_file(self, path: str, content_b64: str):
        """把编辑结果（base64，含 data: 前缀会被自动忽略）覆盖写回磁盘文件。"""
        if not path:
            return {"error": "目标路径为空"}
        try:
            raw = base64.b64decode(content_b64.split(",", 1)[-1])
            with open(path, "wb") as f:
                f.write(raw)
            return {"ok": True, "path": path}
        except Exception as e:
            return {"error": str(e)}

    def close_window(self):
        """关闭图片编辑窗口。"""
        if self._window:
            self._window.destroy()
        return {"ok": True}

    def resize_window(self, width: int, height: int):
        """调整窗口尺寸。"""
        if self._window:
            self._window.resize(int(width), int(height))
        return {"ok": True}

    def save_image_as(self, content_b64: str, filename: str):
        """弹出「另存为」保存编辑结果。返回保存路径或 None。"""
        if not self._window:
            return {"error": "窗口未就绪"}
        ext = os.path.splitext(filename or "")[1].lower() or ".png"
        file_types = (
            "图片 (*%s)" % ext,
            "所有文件 (*.*)",
        )
        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=filename or "image.png",
            file_types=file_types,
        )
        if isinstance(result, (list, tuple)):
            result = result[0] if result else None
        if not result:
            return None
        try:
            raw = base64.b64decode(content_b64.split(",", 1)[-1])
            with open(result, "wb") as f:
                f.write(raw)
            return result
        except Exception as e:
            return {"error": str(e)}


def _read_text_file(path: str, encoding=None):
    """读取文本文件并探测编码（供两个 API 类共用）。"""
    with open(path, "rb") as f:
        raw = f.read()
    enc = encoding if encoding else InkpadApi._detect_encoding(raw)
    try:
        content = raw.decode(enc)
    except (UnicodeDecodeError, LookupError):
        content = raw.decode("utf-8", errors="replace")
    return {
        "content": content,
        "encoding": InkpadApi._ui_enc(enc),
        "size": len(raw),
    }


class InkpadApi:
    """暴露给前端 window.pywebview.api 的原生能力。"""

    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def get_pending_open_file(self):
        """返回右键「打开方式」传入、待主编辑器打开的非图片文件。

        返回 {"path": 绝对路径, "name": 文件名}；无传入文件时返回 None。
        前端在启动完成后调用，用于自动打开用户选中的文档。
        """
        _debug_log("[api] get_pending_open_file -> " + repr(pending_open_file))
        return pending_open_file

    def debug_log(self, msg):
        """供前端写入调试日志，排查「打开方式」自动打开链路。"""
        _debug_log("[js] " + str(msg))
        return True

    def save_file(self, filename: str, content: str, file_types=None):
        """弹出原生「另存为」对话框，保存文本文件。返回保存路径或 None。
        file_types 可选；为 None 时给「所有文件」单过滤器。"""
        path = self._ask_save_path(filename, file_types)
        if not path:
            return None
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def save_file_binary(self, filename: str, content_b64: str, file_types=None):
        """保存二进制文件（前端传 base64）。返回保存路径或 None。
        file_types 可选；为 None 时给「所有文件」单过滤器。"""
        path = self._ask_save_path(filename, file_types)
        if not path:
            return None
        with open(path, "wb") as f:
            f.write(base64.b64decode(content_b64))
        return path

    def read_file_b64(self, path: str):
        """读取任意二进制文件（图片等）为 base64，用于预览内联 / 图片查看器。"""
        if not os.path.isfile(path):
            return {"error": "文件不存在: " + str(path)}
        try:
            with open(path, "rb") as f:
                data = f.read()
            return {"b64": base64.b64encode(data).decode("ascii"), "mime": _guess_mime(path)}
        except Exception as e:
            return {"error": str(e)}

    def copy_image_to_assets(self, dirpath: str, srcpath: str, subdir: str = "assets"):
        """把图片 srcpath 复制到 dirpath/subdir/ 下，返回最终写入的绝对路径（正斜杠）。"""
        if not dirpath or not os.path.isdir(dirpath):
            return {"error": "目标目录无效: " + str(dirpath)}
        if not os.path.isfile(srcpath):
            return {"error": "源图片不存在: " + str(srcpath)}
        try:
            dest_dir = os.path.join(dirpath, subdir)
            os.makedirs(dest_dir, exist_ok=True)
            base = os.path.basename(srcpath)
            name, ext = os.path.splitext(base)
            dest = os.path.join(dest_dir, base)
            n = 1
            while os.path.exists(dest):
                dest = os.path.join(dest_dir, "%s_%d%s" % (name, n, ext))
                n += 1
            import shutil
            shutil.copyfile(srcpath, dest)
            rel = (subdir + "/" + os.path.basename(dest)).replace("\\", "/")
            return {"path": dest.replace("\\", "/"), "rel": rel}
        except Exception as e:
            return {"error": str(e)}

    def save_image_binary(self, dirpath: str, filename: str, content_b64: str, subdir: str = "assets"):
        """把 base64 图片保存到 dirpath/subdir/ 下，返回写入的绝对路径（正斜杠）。"""
        if not dirpath or not os.path.isdir(dirpath):
            return {"error": "目标目录无效: " + str(dirpath)}
        try:
            dest_dir = os.path.join(dirpath, subdir)
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, filename)
            base, ext = os.path.splitext(filename)
            n = 1
            while os.path.exists(dest):
                dest = os.path.join(dest_dir, "%s_%d%s" % (base, n, ext))
                n += 1
            with open(dest, "wb") as f:
                f.write(base64.b64decode(content_b64))
            rel = (subdir + "/" + os.path.basename(dest)).replace("\\", "/")
            return {"path": dest.replace("\\", "/"), "rel": rel}
        except Exception as e:
            return {"error": str(e)}

    def save_file_encoded(self, filename: str, content: str, encoding: str = "utf-8", file_types=None):
        """以指定编码弹出「另存为」，返回保存路径或 None。
        file_types 可选；为 None 时给「所有文件」单过滤器。"""
        path = self._ask_save_path(filename, file_types)
        if not path:
            return None
        data = self._encode_text(content, encoding)
        with open(path, "wb") as f:
            f.write(data)
        return path

    def get_rich_dir(self):
        """返回富文档（块编辑器）的自动存储目录，首次调用时创建。

        富文档可能内嵌多张 base64 图片，体积远超 localStorage 的 ~5MB 上限，
        因此统一自动落盘到该目录（JSON 文件），避免内容丢失。
        """
        import os
        candidates = [
            os.path.join(os.path.expanduser("~"), "Documents", "InkpadRich"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "InkpadRich"),
        ]
        for base in candidates:
            try:
                os.makedirs(base, exist_ok=True)
                return base
            except Exception:
                continue
        return None

    def move_rich_file(self, src: str, dst: str):
        """把富文档的磁盘文件移动到新位置（用于「标题改名 → 文件名跟着变」）。

        同盘走 os.replace（O(1)）；跨盘降级为 copy + remove。
        父目录不存在会自动创建。**目标若已存在则直接拒绝**（避免误覆盖其它富文档）。
        返回 {path: 新绝对路径（正斜杠）} 或 {error: ...}。
        """
        if not src or not dst:
            return {"error": "源或目标路径为空"}
        if not os.path.isfile(src):
            return {"error": "源文件不存在: " + str(src)}
        try:
            parent = os.path.dirname(dst)
            if parent:
                os.makedirs(parent, exist_ok=True)
            # 目标已存在 → 拒绝覆盖（前端 computeRichFilePath 已尽量避让，
            # 这里再兜底防同盘/竞态）
            if os.path.abspath(src) == os.path.abspath(dst):
                return {"path": dst.replace("\\", "/")}
            if os.path.exists(dst):
                return {"error": "目标已存在，拒绝覆盖: " + str(dst)}
            try:
                os.replace(src, dst)
            except OSError:
                import shutil
                shutil.copyfile(src, dst)
                os.remove(src)
            return {"path": dst.replace("\\", "/")}
        except Exception as e:
            return {"error": str(e)}

    def delete_rich_file(self, path: str):
        """删除富文档磁盘文件（用于标题改名时清理旧路径）。

        若文件不存在静默成功。返回 {"ok": True} 或 {"error": ...}。
        """
        if not path:
            return {"error": "路径为空"}
        try:
            if os.path.isfile(path):
                try:
                    os.remove(path)
                except OSError:
                    # 跨盘 / 权限 → 视作失败但不抛
                    return {"error": "无法删除: " + str(path)}
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    def list_rich_orphans(self):
        """列出 InkpadRich 目录下未被 docs 注册占用的 .json 文件（orphan）。

        返回 {"files": ["绝对路径1", ...]} ；无目录/无 API 时返回 {"files": []}。
        JS 端会在启动时拿这个列表跟 docs 里的 diskPath 比对，清理掉孤儿文件。
        """
        if not self._window:
            return {"files": []}
        try:
            base = self.get_rich_dir() if hasattr(self, 'get_rich_dir') else None
        except Exception:
            base = None
        if not base:
            return {"files": []}
        try:
            if not os.path.isdir(base):
                return {"files": []}
            files = []
            for name in os.listdir(base):
                if not name.lower().endswith('.json'):
                    continue
                full = os.path.join(base, name).replace("\\", "/")
                # 排除旧版本文件名格式 "rich_<id>.json" 之外的「特殊前缀」文件
                # —— 当前实现全部 .json 都视为可能 orphan，由 JS 决定
                files.append(full)
            return {"files": files}
        except Exception:
            return {"files": []}

    def cleanup_rich_orphans(self, occupied_paths=None):
        """清理 InkpadRich 目录下「不在 JS 传过来的占用列表里」的 .json orphan 文件。

        v0.17 标题跟随功能有竞态 bug，会在改标题过程中残留多份同内容副本。
        启动时调用这个函数可一次清理掉它们。
        安全策略：只删「内容长得像富文档 + JS 端不认」的文件，
        避免误删用户手动放进该目录的其它 .json。

        返回 {deleted: [...], skipped: [...]}。
        """
        base = self.get_rich_dir() if hasattr(self, 'get_rich_dir') else None
        if not base or not os.path.isdir(base):
            return {"deleted": [], "skipped": []}
        occupied = set((p or '').replace("\\", "/") for p in (occupied_paths or []) if p)
        # 把 src/dst 都规范化，便于比较
        normalized_occupied = set(os.path.normpath(p).replace("\\", "/") for p in occupied)
        deleted = []
        skipped = []
        try:
            RICH_TYPES = {'text', 'h1', 'h2', 'h3', 'quote', 'todo', 'code', 'table',
                          'image', 'mermaid', 'math', 'callout', 'hr', 'cols',
                          'ulist', 'olist', 'link'}
            for name in os.listdir(base):
                if not name.lower().endswith('.json'):
                    continue
                full = os.path.join(base, name)
                full_norm = os.path.normpath(full).replace("\\", "/")
                if full_norm in normalized_occupied:
                    continue
                # 嗅探内容，只删符合富文档格式的
                try:
                    with open(full, 'r', encoding='utf-8', errors='ignore') as f:
                        raw = f.read().strip()
                    if not (raw.startswith('[') and raw.endswith(']')):
                        skipped.append(name)
                        continue
                    arr = json.loads(raw)
                    if not isinstance(arr, list) or not arr:
                        skipped.append(name)
                        continue
                    first = arr[0]
                    if not (isinstance(first, dict)
                            and isinstance(first.get('id'), str)
                            and isinstance(first.get('type'), str)
                            and first.get('type') in RICH_TYPES):
                        skipped.append(name)
                        continue
                except Exception:
                    skipped.append(name)
                    continue
                # 通过嗅探 → 安全删除
                try:
                    os.remove(full)
                    deleted.append(name)
                except Exception:
                    skipped.append(name)
            return {"deleted": deleted, "skipped": skipped}
        except Exception as e:
            return {"deleted": deleted, "skipped": skipped, "error": str(e)}

    # ---------- 磁盘文件 API（打开文件夹 / 编码转换 / 文件比较） ----------

    def pick_folder(self):
        """选择文件夹。返回路径或 None。"""
        if not self._window:
            return None
        result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        return self._first(result)

    def pick_file(self):
        """选择单个文件。返回路径或 None。"""
        if not self._window:
            return None
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG, file_types=("所有文件 (*.*)",)
        )
        return self._first(result)

    def pick_files(self):
        """多选文件。返回路径列表。"""
        if not self._window:
            return []
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=True, file_types=("所有文件 (*.*)",)
        )
        if isinstance(result, (list, tuple)):
            return [p for p in result if p]
        if isinstance(result, str):
            return [result]
        return []

    def open_compare_window(self, text_a: str, name_a: str, text_b: str, name_b: str):
        """在独立原生窗口中打开文件比较（左右分栏、差异高亮）。"""
        global pending_compare
        pending_compare = {
            "a": text_a, "aName": name_a,
            "b": text_b, "bName": name_b,
        }
        try:
            threading.Timer(0.2, self._spawn_compare_window).start()
            return True
        except Exception:
            return False

    def _spawn_compare_window(self):
        try:
            cmp_api = CmpApi()
            win = webview.create_window(
                "Inkpad 文件比较",
                resource_path("compare.html"),
                js_api=cmp_api,
                width=1180,
                height=780,
                min_size=(760, 460),
            )
            cmp_api.set_window(win)
        except Exception:
            pass

    def open_image_viewer_window(self, src: str, name: str = ""):
        """在独立原生窗口中打开图片查看器（可放大缩小、拖拽平移）。

        src 为已解析的图片地址：data: URI 或绝对/相对 file:// 路径；
        前端传入 img.src 即可（与页面内渲染用的是同一份）。
        """
        global pending_image
        if not src:
            return False
        pending_image = {"src": src, "name": name or "图片"}
        try:
            threading.Timer(0.15, self._spawn_image_viewer_window).start()
            return True
        except Exception:
            return False

    def _spawn_image_viewer_window(self):
        try:
            imv_api = ImvApi()
            win = webview.create_window(
                "Inkpad 图片查看器",
                resource_path("image_viewer.html"),
                js_api=imv_api,
                width=1000,
                height=760,
                min_size=(520, 420),
                private_mode=False,
            )
            imv_api.set_window(win)
        except Exception:
            pass

    def _first(self, result):
        if isinstance(result, (list, tuple)):
            return result[0] if result else None
        if isinstance(result, str):
            return result
        return None

    def list_dir(self, path: str):
        """列出目录直接子项。返回 [{name, path, isDir, size}] 或 {error}。"""
        out = []
        try:
            entries = os.listdir(path)
        except Exception as e:
            return {"error": str(e)}
        for name in entries:
            full = os.path.join(path, name)
            try:
                is_dir = os.path.isdir(full)
                size = 0 if is_dir else os.path.getsize(full)
            except Exception:
                continue
            out.append({"name": name, "path": full, "isDir": is_dir, "size": size})
        out.sort(key=lambda x: (not x["isDir"], x["name"].lower()))
        return out

    def read_text_file(self, path: str, encoding=None):
        """读取文本文件并探测编码。返回 {content, encoding, size}。"""
        return _read_text_file(path, encoding)

    def read_doc_text(self, path: str):
        """用 olefile 读取旧版 .doc（Word 97-2003）的纯文本。

        返回 {"text": 提取文本} 或 {"error": 原因}。
        """
        if not os.path.isfile(path):
            return {"error": "文件不存在: " + str(path)}
        try:
            return {"text": _extract_doc_text(path)}
        except Exception as e:
            return {"error": str(e)}

    def write_text_file(self, path: str, content: str, encoding: str = "utf-8"):
        """以指定编码写回磁盘文件。自动创建父目录。返回 True。"""
        import os
        # PDF / Word 只读保护：拒绝任何对 .pdf/.doc/.docx 路径的文本写入（返回 False，不抛错）
        if path.lower().endswith((".pdf", ".doc", ".docx")):
            return False
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        data = self._encode_text(content, encoding)
        with open(path, "wb") as f:
            f.write(data)
        return True

    def show_in_folder(self, path: str):
        """在系统文件管理器中打开 path 所在文件夹，并选中该文件/文件夹。

        Windows 用 explorer /select（打开所在文件夹并选中目标）；
        macOS 用 open -R（Finder 中显示）；其它平台打开所在目录。
        返回 {"ok": True} 或 {"error": ...}。
        """
        import subprocess
        if not path:
            return {"error": "路径为空"}
        try:
            if sys.platform.startswith("win"):
                subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-R", path])
            else:
                target = path if os.path.isdir(path) else os.path.dirname(path)
                subprocess.Popen(["xdg-open", target])
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    # ---------- 在线翻译 ----------

    def translate(self, text: str, target: str = "auto"):
        """翻译文本（在线，需联网）。立即返回 {"started": True}，不阻塞 UI；
        结果由 worker 线程通过 evaluate_js 调用 window.__inkpadTranslateCb 回调推送。
        target 取 "zh"/"en"/"ja"/"ko" 等，缺省 "auto" 按文本内容自动判断。"""
        if not text or not str(text).strip():
            return {"error": "没有可翻译的内容"}
        text = str(text).strip()
        if len(text) > 1500:
            return {"error": "单次最多翻译 1500 字符"}
        if target == "auto":
            target = "zh" if _looks_chinese(text) else "en"

        def worker():
            result = _do_translate(text, target)
            js = "if (window.__inkpadTranslateCb) window.__inkpadTranslateCb(%s);" % json.dumps(result, ensure_ascii=False)
            try:
                if self._window:
                    self._window.evaluate_js(js)
            except Exception:
                pass

        threading.Thread(target=worker, daemon=True).start()
        return {"started": True}

    # ---------- 关于 / 检查更新 ----------

    def get_version(self):
        """返回当前应用版本号（与前端页脚保持一致）。"""
        return {"version": APP_VERSION}

    def open_external(self, url: str):
        """在系统默认浏览器中打开外部链接（更新日志 / 仓库页 / 下载页）。"""
        import webbrowser
        try:
            webbrowser.open(url)
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    def check_update(self):
        """检查最新版本（需联网）。优先 GitHub Releases API，失败回退 Gitee API。

        返回 {"ok": True, "latest": "vX.Y.Z", "url": 发布页, "source": "github"|"gitee",
        "current": 当前版本, "update_available": bool}；异常返回 {"error": ...}。"""
        import urllib.request

        def fetch_latest():
            sources = (
                ("github", "https://api.github.com/repos/stutasliu/LNote/releases/latest"),
                ("gitee", "https://gitee.com/api/v5/repos/x_xiansheng/l.-note/releases/latest"),
            )
            fallback_pages = {
                "github": "https://github.com/stutasliu/LNote/releases",
                "gitee": "https://gitee.com/x_xiansheng/l.-note/releases",
            }
            last = None
            for name, url in sources:
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req, timeout=6) as resp:
                        data = json.loads(resp.read().decode("utf-8", errors="replace"))
                    tag = str(data.get("tag_name") or "").strip()
                    if not tag:
                        raise ValueError("未找到版本号")
                    page = str(data.get("html_url") or "").strip() or fallback_pages.get(name, url)
                    return {"ok": True, "latest": tag, "url": page, "source": name}
                except Exception as e:
                    last = e
            return {"error": "无法连接更新服务器：%s" % last}

        result = fetch_latest()
        if result.get("ok"):
            result["current"] = APP_VERSION
            result["update_available"] = _version_greater(result["latest"], APP_VERSION)
        return result

    # ---------- 编码工具 ----------

    _UI_ENCS = {
        "utf-8": "UTF-8",
        "utf-8-sig": "UTF-8 (BOM)",
        "utf-16-le": "UTF-16LE",
        "utf-16-be": "UTF-16BE",
        "gb18030": "GB18030",
        "big5": "BIG5",
    }

    @staticmethod
    def _ui_enc(codec: str) -> str:
        return InkpadApi._UI_ENCS.get(codec, codec)

    @staticmethod
    def _codec_from_ui(ui: str) -> str:
        for codec, label in InkpadApi._UI_ENCS.items():
            if label == ui or codec == ui:
                return codec
        return "utf-8"

    def _encode_text(self, content: str, encoding: str) -> bytes:
        codec = self._codec_from_ui(encoding)
        return content.encode(codec, errors="replace")

    @staticmethod
    def _detect_encoding(raw: bytes) -> str:
        if raw.startswith(b"\xef\xbb\xbf"):
            return "utf-8-sig"
        if raw.startswith(b"\xff\xfe\x00\x00"):
            return "utf-32-le"
        if raw.startswith(b"\x00\x00\xfe\xff"):
            return "utf-32-be"
        if raw.startswith(b"\xff\xfe"):
            return "utf-16-le"
        if raw.startswith(b"\xfe\xff"):
            return "utf-16-be"
        try:
            raw.decode("utf-8")
            return "utf-8"
        except UnicodeDecodeError:
            pass
        try:
            raw.decode("gb18030")
            return "gb18030"
        except UnicodeDecodeError:
            pass
        return "latin-1"

    def _ask_save_path(self, filename: str, file_types=None):
        if not self._window:
            return None
        # file_types: tuple of (描述, pattern) 序列；为空时只用单过滤器「所有文件」
        if not file_types:
            file_types = ("所有文件 (*.*)",)
        # pywebview 接受 tuple/list/string；统一转 tuple，避免 None 或空 list 报错
        if isinstance(file_types, str):
            file_types = (file_types,)
        if isinstance(file_types, list):
            file_types = tuple(file_types)
        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=filename,
            file_types=file_types,
        )
        # SAVE_DIALOG 返回 str 或 tuple，取消时为 None / 空
        if isinstance(result, (list, tuple)):
            return result[0] if result else None
        if isinstance(result, str):
            return result
        return None


_MIME_MAP = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".svg": "image/svg+xml", ".ico": "image/x-icon",
}


def _guess_mime(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return _MIME_MAP.get(ext, "application/octet-stream")


def _looks_chinese(text: str) -> bool:
    """粗判文本是否以中文为主：含 CJK 汉字且数量不小于英文字母数。"""
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    latin = sum(1 for ch in text if ch.isascii() and ch.isalpha())
    return cjk > 0 and cjk >= max(latin, 1)


def _version_greater(a: str, b: str) -> bool:
    """比较两个版本号（支持 "v0.21.9" / "0.21.9" 格式），a > b 返回 True。"""
    def parts(v: str):
        digits = re.sub(r"(?i)^v", "", v.strip()).split(".")
        out = []
        for d in digits:
            m = re.match(r"\d+", d or "")
            out.append(int(m.group()) if m else 0)
        return out + [0] * (3 - len(out))

    return parts(a) > parts(b)


def _do_translate(text: str, target: str) -> dict:
    """执行翻译请求。优先 Google 非官方端点，失败回退 MyMemory。
    返回 {"ok": True, "text": 译文, "detected": 源语言, "target": 目标语言} 或 {"error": ...}。"""
    import urllib.parse
    import urllib.request

    def google():
        url = ("https://translate.googleapis.com/translate_a/single"
               "?client=gtx&sl=auto&tl=%s&dt=t&q=%s"
               % (urllib.parse.quote(target), urllib.parse.quote(text)))
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        segs = data[0] if isinstance(data, list) and data else []
        out = "".join(s[0] for s in segs if isinstance(s, list) and s and isinstance(s[0], str))
        if not out:
            raise ValueError("翻译结果为空")
        detected = data[2] if len(data) > 2 else ""
        return {"ok": True, "text": out, "detected": str(detected or ""), "target": target}

    def mymemory():
        src = "zh-CN" if _looks_chinese(text) else "en"
        dst = {"zh": "zh-CN", "en": "en"}.get(target, target)
        url = ("https://api.mymemory.translated.net/get?q=%s&langpair=%s|%s"
               % (urllib.parse.quote(text), src, dst))
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        out = (data.get("responseData") or {}).get("translatedText") or ""
        if out:
            out = out.replace("&#39;", "'").replace("&quot;", '"').replace("&amp;", "&")
        if not out:
            raise ValueError("翻译结果为空")
        return {"ok": True, "text": out, "detected": "", "target": target}

    last = None
    for fn in (google, mymemory):
        try:
            return fn()
        except Exception as e:
            last = e
    return {"error": "翻译失败：" + str(last)}


def _is_image_arg(path: str) -> bool:
    """判断命令行参数是否指向一张受支持的图片。"""
    if not path:
        return False
    return os.path.splitext(path)[1].lower() in _MIME_MAP and os.path.isfile(path)


def _is_openable_file(path: str) -> bool:
    """判断命令行参数是否指向一个可打开的普通文件（非图片）。

    右键「打开方式」传非图片文档（txt/md/json 等）时使用，
    由主编辑器在前端自动打开该文件。
    """
    if not path:
        return False
    return os.path.isfile(path) and not _is_image_arg(path)


def _launch_image_editor(path: str):
    """单图编辑模式：命令行传入图片路径（右键「打开方式」）时，直接打开图片编辑窗口。"""
    global pending_image
    pending_image = {
        "path": os.path.abspath(path),
        "name": os.path.basename(path),
        "src": "",
    }
    imv_api = ImvApi()
    win = webview.create_window(
        "L.Note 图片编辑",
        resource_path("image_viewer.html"),
        js_api=imv_api,
        width=1100,
        height=800,
        min_size=(560, 480),
    )
    imv_api.set_window(win)
    webview.start(private_mode=False)


def main():
    _debug_log("[main] start, argv = " + repr(sys.argv))
    # 右键「打开方式」传图片路径 → 进入单图编辑模式，不加载主编辑器
    for arg in sys.argv[1:]:
        if _is_image_arg(arg):
            _debug_log("[main] image arg -> image editor: " + repr(arg))
            _launch_image_editor(arg)
            return

    # 右键「打开方式」传非图片文档 → 记录到 pending_open_file，
    # 主编辑器加载完成后由前端自动打开该文件（不打开默认文档）
    global pending_open_file
    for arg in sys.argv[1:]:
        if _is_openable_file(arg):
            pending_open_file = {
                "path": os.path.abspath(arg),
                "name": os.path.basename(arg),
            }
            _debug_log("[main] pending_open_file = " + repr(pending_open_file))
            break
        else:
            _debug_log("[main] arg not openable: " + repr(arg))
    if pending_open_file is None:
        _debug_log("[main] no pending open file")

    api = InkpadApi()
    index = resource_path("index.html")
    window = webview.create_window(
        title="L.Note",
        url=index,
        js_api=api,
        width=1280,
        height=800,
        min_size=(900, 600),
        text_select=True,
    )
    api.set_window(window)
    # 关闭私有模式：使用持久化用户数据目录，
    # 否则 localStorage 每次启动都会清空（文档不保留）。
    webview.start(private_mode=False)


if __name__ == "__main__":
    main()

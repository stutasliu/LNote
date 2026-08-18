# -*- coding: utf-8 -*-
"""
Inkpad 桌面版入口
用 pywebview（Edge WebView2 内核）加载本地编辑器页面，
并通过 js_api 向前端暴露原生文件保存对话框。
"""
import os
import sys
import threading
import base64
import json

import webview

# 供文件比较窗口读取的待比较数据
pending_compare = None

# 供图片查看器窗口读取的待查看图片
pending_image = None

# 版本号（与 js/app.js 页脚保持一致）
APP_VERSION = "0.20.44"


def resource_path(rel: str) -> str:
    """兼容开发运行与 PyInstaller 打包后的资源路径。"""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


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
    """图片查看器窗口的 API：取回主窗口传入的图片数据（src + 名称）。"""

    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def get_image(self):
        return pending_image


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

    def write_text_file(self, path: str, content: str, encoding: str = "utf-8"):
        """以指定编码写回磁盘文件。自动创建父目录。返回 True。"""
        import os
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


def main():
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

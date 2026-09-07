/*
 * tools/publish.js —— L.Note 发布前「版本印章 + 文档同步」固化脚本
 *
 * 职责（执行边界：不含代码构建 / Inno Setup 打包 / git 提交与推送，均按 project_rules.md 人工执行）：
 *   1. 校验并读取当前版本（main.py 的 APP_VERSION 为准，须与 package.json 一致）
 *   2. 版本印章：对"单版本载体"做全文 vCUR/CUR → vNEW/NEW 替换：
 *        main.py / package.json / src-app/27-about.js / installer/LNote.iss / blink-guide.html
 *      （js/app.js 为构建产物，不直接改，需按构建链重新生成）
 *   3. 累计文档不做全文替换，只插入新条目：
 *        - CHANGELOG.md：在顶部（首条 "## \[v…" 标题之前）插入 ## \[vNEW] - 日期 + ### 变更
 *        - RELEASE-NOTES.md：只重写"## 更新日志（本版亮点）"标题之前的部分（标题/文件名/用法等
 *          单版本信息），并在该节顶部插入 **vNEW** 亮点块，历史正文一律不动
 *        - download.html：只重写"更新日志"小节之前的部分（徽标/下载按钮/快速开始/certutil），
 *          并在其更新日志区顶部插入新的 <div class="changelog"> 条目，历史条目一律不动
 *   4. docs/06-功能列表.md：仅替换顶部「版本 / 更新日期」元信息行
 *   5. 读取 release/ 下两个新版本 exe 的 SHA256，重建 SHA256SUMS.txt（根目录 + release/ 副本），
 *      并以"旧哈希 → 新哈希"方式替换 download.html 中的两处哈希
 *   6. 同步副本：index.html = download.html 的整份拷贝；release/download.html / release/RELEASE-NOTES.md
 *      与根目录处理后结果保持整份一致
 *
 * 用法：
 *   node tools/publish.js <新版本号>            # 干跑：只检查与预览，不写任何文件
 *   node tools/publish.js <新版本号> --apply    # 落地：真正写文件
 *   node tools/publish.js <新版本号> --apply --date 2026-09-06          # 指定日志日期（缺省=今天）
 *   node tools/publish.js <新版本号> --apply --notes tools/_rn-新.md    # 用笔记文件生成日志条目
 *
 * 注意：--notes 内容由发布人准备（每行 "- 亮点…" 即可）；缺省时写入 TODO 占位，正文留待人工补写。
 * 落地前请确保 release/ 下两个新版本 exe 已就位（哈希依赖它们计算）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const APP = 'L.Note';

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function fail(msg) {
  console.error('[publish] 错误: ' + msg);
  process.exit(1);
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function write(p, text) {
  fs.writeFileSync(p, text);
}

function sha256Of(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function git(args) {
  const { spawnSync } = require('child_process');
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r;
}

function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

// ---------------------------------------------------------------------------
// 入口参数解析
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
let dateArg = null;
let notesArg = null;
const positionals = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--apply') continue;
  if (a === '--date') { dateArg = args[++i]; continue; }
  if (a === '--notes') { notesArg = args[++i]; continue; }
  if (a.startsWith('--')) fail('未知参数 ' + a);
  positionals.push(a);
}

if (positionals.length !== 1) {
  console.error('用法: node tools/publish.js <新版本号> [--apply] [--date YYYY-MM-DD] [--notes 文件]');
  process.exit(1);
}

const NEW = positionals[0];
if (!/^\d+\.\d+\.\d+$/.test(NEW)) fail('新版本号格式应为 X.Y.Z，收到: ' + NEW);
const DATE = dateArg || today();
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) fail('--date 格式应为 YYYY-MM-DD，收到: ' + DATE);

let notesText = null;
if (notesArg) {
  const np = path.resolve(ROOT, notesArg);
  if (!fs.existsSync(np)) fail('--notes 文件不存在: ' + np);
  notesText = read(np).trim();
}

// ---------------------------------------------------------------------------
// 读取当前版本
// ---------------------------------------------------------------------------

const mainPy = read(path.join(ROOT, 'main.py'));
const m1 = mainPy.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
if (!m1) fail('main.py 中未找到 APP_VERSION');
const CUR = m1[1];

const pkgJson = JSON.parse(read(path.join(ROOT, 'package.json')));
if (pkgJson.version !== CUR) {
  fail('版本不一致: package.json=' + pkgJson.version + ' ≠ main.py=' + CUR + '，请先统一再发布');
}
if (!/^\d+\.\d+\.\d+$/.test(CUR)) fail('当前版本号格式异常: ' + CUR);
if (CUR === NEW) fail('新版本与当前版本相同: ' + NEW);

// ---------------------------------------------------------------------------
// 计算涉及的路径集合
// ---------------------------------------------------------------------------

const P = {
  mainPy: 'main.py',
  pkgJson: 'package.json',
  aboutJs: path.join('src-app', '27-about.js'),
  liss: path.join('installer', 'LNote.iss'),
  changelog: 'CHANGELOG.md',
  feats: path.join('docs', '06-功能列表.md'),
  rn: 'RELEASE-NOTES.md',
  sums: 'SHA256SUMS.txt',
  dl: 'download.html',
  idx: 'index.html',
  blink: 'blink-guide.html',
  siteDl: path.join('release', 'download.html'),
  siteRn: path.join('release', 'RELEASE-NOTES.md'),
  siteSums: path.join('release', 'SHA256SUMS.txt'),
};

// 单版本载体文件：全文件出现的 vCUR / CUR 均属当前版信息，可整体替换为新版
const STAMP_FILES = [P.mainPy, P.pkgJson, P.aboutJs, P.liss, P.blink];

// release/ 下两个发布 exe（新版本，落地前必须已构建就位；仓库命名带 "v"）
const setupExe = APP + '-setup-v' + NEW + '.exe';
const win64Exe = APP + '-v' + NEW + '-win64.exe';
const exePaths = {
  setup: path.join(ROOT, 'release', setupExe),
  win64: path.join(ROOT, 'release', win64Exe),
};

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

const plan = [];      // 已落地动作
const preview = [];   // 干跑预览动作
const warnings = [];

function commit(abs, text, what) {
  if (APPLY) {
    write(abs, text);
    plan.push(what);
  } else {
    preview.push(what);
  }
}

// 全文 token 替换：vCUR → vNEW，再 CUR → NEW；返回替换后文本与总替换处数
function stampTokens(text) {
  let t = text;
  const c1 = t.split('v' + CUR).length - 1;
  t = t.split('v' + CUR).join('v' + NEW);
  const c2 = t.split(CUR).length - 1;
  t = t.split(CUR).join(NEW);
  return { text: t, total: c1 + c2 };
}

// ---------------------------------------------------------------------------
// 1) 单版本载体整体盖章
// ---------------------------------------------------------------------------

function stampFile(rel) {
  const abs = path.join(ROOT, rel);
  const raw = read(abs);
  if (rel === P.pkgJson) {
    const obj = JSON.parse(raw);
    if (obj.version !== CUR) {
      warnings.push('package.json 的 version 字段异常: ' + obj.version + '（跳过盖章）');
      return null;
    }
    obj.version = NEW;
    const eol = eolOf(raw);
    const text = JSON.stringify(obj, null, 2).split('\n').join(eol) + eol;
    return { text: text, desc: 'package.json version 字段 ' + CUR + ' → ' + NEW };
  }
  const r = stampTokens(raw);
  if (r.total === 0) {
    warnings.push('未发现当前版本号 ' + CUR + '（跳过盖章）: ' + rel);
    return null;
  }
  return { text: r.text, desc: '版本号 ' + CUR + ' → ' + NEW + '（' + r.total + ' 处）' };
}

// ---------------------------------------------------------------------------
// 4) docs/06-功能列表.md：仅替换顶部「版本 / 更新日期」元信息行
// ---------------------------------------------------------------------------

function stampFeatureHead() {
  const abs = path.join(ROOT, P.feats);
  const raw = read(abs);
  const lines = raw.split(/\r?\n/);
  const i = 2; // 第 3 行
  if (!lines[i] || !lines[i].includes(CUR)) {
    warnings.push('docs/06-功能列表.md 第 3 行未含当前版本 ' + CUR + '（未改动）');
    return null;
  }
  const out = lines[i]
    .split('v' + CUR).join('v' + NEW)
    .split(CUR).join(NEW)
    .replace(/\d{4}-\d{2}-\d{2}/, DATE);
  lines[i] = out;
  return { text: lines.join(eolOf(raw)), desc: '功能列表第 3 行版本/日期更新为 v' + NEW + ' / ' + DATE };
}

// ---------------------------------------------------------------------------
// 3a) CHANGELOG.md：在首条 "## \[v…" 标题之前插入新条目
// ---------------------------------------------------------------------------

function changelogBody() {
  return notesText || '> TODO：发布前人工补充本版变更说明（新增 / 修复 / 变更三分类）与测试说明。';
}

function buildChangelogText() {
  const abs = path.join(ROOT, P.changelog);
  const raw = read(abs);
  const anchor = '## \\[v';   // 匹配仓库风格 "## \[v0.21.15] - yyyy-mm-dd"
  const i = raw.indexOf(anchor);
  if (i === -1) {
    warnings.push('CHANGELOG.md 未找到 "## \\[v…" 条目标题（跳过插入）');
    return null;
  }
  const entry = '## \\[v' + NEW + '] - ' + DATE + '\n\n### 变更\n\n' + changelogBody();
  const text = raw.slice(0, i) + entry + '\n\n' + raw.slice(i);
  return { text: text, desc: 'CHANGELOG.md 顶部插入新条目 ## [v' + NEW + '] - ' + DATE };
}

// ---------------------------------------------------------------------------
// 3b) RELEASE-NOTES.md：只盖章「更新日志（本版亮点）」之前的部分 + 顶部插亮点块
// ---------------------------------------------------------------------------

function rnBulletBlock() {
  return notesText || '- TODO：发布前人工补充本版亮点条目';
}

function buildRnText() {
  const abs = path.join(ROOT, P.rn);
  const raw = read(abs);
  const hd = '## 更新日志（本版亮点）';
  const i = raw.indexOf(hd);
  if (i === -1) {
    warnings.push('RELEASE-NOTES.md 未找到「' + hd + '」标题（跳过更新）');
    return null;
  }
  const pre = raw.slice(0, i);
  const r = stampTokens(pre);
  if (r.total === 0) {
    warnings.push('RELEASE-NOTES.md 头部未发现当前版本号 ' + CUR + '（仅尝试插入亮点块，请人工核对）');
  }
  const j = raw.indexOf('**v' + CUR + '**', i);
  let text;
  let desc = 'RELEASE-NOTES.md 头部盖章（' + r.total + ' 处）+ 更新日志区顶部插入 **v' + NEW + '**';
  if (j === -1) {
    warnings.push('RELEASE-NOTES.md 未找到 "**v' + CUR + '**" 亮点块锚点（新块插在标题之后，请人工核对排版）');
    text = r.text + raw.slice(i, i + hd.length) + '\n\n**v' + NEW + '**\n\n' + rnBulletBlock() + raw.slice(i + hd.length);
  } else {
    const block = '**v' + NEW + '**\n\n' + rnBulletBlock();
    text = r.text + raw.slice(i, j) + block + '\n\n' + raw.slice(j);
  }
  return { text: text, desc: desc };
}

// ---------------------------------------------------------------------------
// 5) 哈希：release/ 下两个新 exe → SHA256SUMS.txt（根 + release/）
// ---------------------------------------------------------------------------

function hashes() {
  const out = {};
  const missing = [];
  for (const key of ['setup', 'win64']) {
    const f = exePaths[key];
    if (!fs.existsSync(f)) { missing.push(f); continue; }
    out[key] = sha256Of(f);
  }
  return { out: out, missing: missing };
}

// 解析 "SHA256(<文件名>) = <64位大写HEX>" 列表为 { 文件名: 哈希 }
function parseSums(text) {
  const map = {};
  const re = /SHA256\((.*?)\)\s*=\s*([0-9A-F]{64})/g;
  let m;
  while ((m = re.exec(text))) map[m[1]] = m[2];
  return map;
}

function readOldSums() {
  const p = path.join(ROOT, P.sums);
  if (!fs.existsSync(p)) {
    warnings.push('未找到旧 SHA256SUMS.txt，无法定位 download.html 中的旧哈希（跳过哈希替换）');
    return null;
  }
  return parseSums(read(p));
}

function syncSums(out) {
  const lines = [];
  if (out.setup) lines.push('SHA256(' + setupExe + ') = ' + out.setup);
  if (out.win64) lines.push('SHA256(' + win64Exe + ') = ' + out.win64);
  const text = lines.join('\r\n') + '\r\n';
  const desc = 'SHA256SUMS.txt 重建为 ' + NEW + ' 两条哈希';
  commit(path.join(ROOT, P.sums), text, desc + '（根目录）');
  commit(path.join(ROOT, P.siteSums), text, desc + '（release/）');
}

// 以旧哈希→新哈希方式替换 download.html 中的哈希
function replaceHashesInText(text, oldSums, out) {
  let t = text;
  let changed = 0;
  const oldFiles = {
    setup: APP + '-setup-v' + CUR + '.exe',
    win64: APP + '-v' + CUR + '-win64.exe',
  };
  for (const key of ['setup', 'win64']) {
    if (!out[key]) continue;
    const oldH = oldSums && oldSums[oldFiles[key]];
    if (!oldH) {
      warnings.push('旧 SHA256SUMS.txt 中未找到 ' + oldFiles[key] + ' 的哈希（跳过该项替换）');
      continue;
    }
    const n = t.split(oldH).length - 1;
    if (n === 0) {
      warnings.push('download.html 中未找到旧哈希 ' + oldH + '（' + oldFiles[key] + '，跳过该项替换）');
      continue;
    }
    t = t.split(oldH).join(out[key]);
    changed += n;
  }
  return { text: t, changed: changed };
}

// ---------------------------------------------------------------------------
// 3c) download.html：只盖章「更新日志」之前的部分 + 日志区顶部插新块 + 换哈希
// ---------------------------------------------------------------------------

function htmlSnippet() {
  if (!notesText) return 'TODO：发布前人工补充本版亮点条目';
  return notesText
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s*\n\s*/g, '，')
    .trim();
}

function buildDlText(out, oldSums) {
  const abs = path.join(ROOT, P.dl);
  const raw = read(abs);
  const hd = '<h2>更新日志</h2>';
  const i = raw.indexOf(hd);
  if (i === -1) {
    warnings.push('download.html 未找到「更新日志」小标题（跳过更新）');
    return null;
  }
  const r = stampTokens(raw.slice(0, i));
  if (r.total === 0) {
    warnings.push('download.html 头部（更新日志之前）未发现当前版本号 ' + CUR + '（仅尝试插入日志块，请人工核对）');
  }
  let text = r.text + raw.slice(i);

  // 日志区顶部（首个 <div class="changelog"> 所在行行首）插入新块，旧块原有缩进保持不变
  const k = text.indexOf('<div class="changelog">', i);
  if (k === -1) {
    warnings.push('download.html 更新日志区未找到 <div class="changelog"> 结构（跳过插入）');
    return null;
  }
  const lineStart = text.lastIndexOf('\n', k) + 1;
  const block =
    '    <div class="changelog">\n' +
    '      <div class="v">v' + NEW + '</div>\n' +
    '      <ul>\n' +
    '        <li>' + htmlSnippet() + '</li>\n' +
    '      </ul>\n' +
    '    </div>\n';
  text = text.slice(0, lineStart) + block + text.slice(lineStart);

  // 哈希替换（仅头部区域存在旧哈希，全文替换即安全）
  if (out && (out.setup || out.win64)) {
    const h = replaceHashesInText(text, oldSums, out);
    text = h.text;
    if (h.changed === 0) warnings.push('download.html 哈希未发生替换，请人工核对');
  }
  return {
    text: text,
    desc: 'download.html 盖章（' + r.total + ' 处）+' + '日志区插入 v' + NEW + ' 条目' + (out && (out.setup || out.win64) ? '+哈希更新' : ''),
  };
}

// ---------------------------------------------------------------------------
// 6) 副本同步：index.html / release/ 下镜像整份一致
// ---------------------------------------------------------------------------

function copyFile(fromKey, toKey, what) {
  const src = path.join(ROOT, fromKey);
  const dst = path.join(ROOT, toKey);
  commit(dst, read(src), what);
}

// ---------------------------------------------------------------------------
// 干跑 / 落地
// ---------------------------------------------------------------------------

function main() {
  console.log('[publish] 当前版本 ' + CUR + ' → 新版本 ' + NEW + (APPLY ? '（落地 --apply）' : '（干跑，不写文件）'));
  console.log('[publish] 根目录: ' + ROOT);

  // 0) 工作区干净性提示（不阻断）
  if (APPLY) {
    const st = git(['status', '--porcelain']);
    const dirty = (st.stdout || '').trim().split('\n').filter(Boolean);
    if (dirty.length) {
      console.log('[publish] 注意：工作区存在未提交改动（' + dirty.length + ' 项），--apply 将叠加写入。');
    }
  }

  // 发布产物检查：落地前必须两个新 exe 就位（哈希依赖）
  const hres = hashes();
  const setupOk = fs.existsSync(exePaths.setup);
  const winOk = fs.existsSync(exePaths.win64);
  console.log('[publish] 发布产物检查: ' + (setupOk ? '✓' : '✗') + ' ' + setupExe + '  '
    + (winOk ? '✓' : '✗') + ' ' + win64Exe);
  if (APPLY && !(setupOk && winOk)) {
    fail('release/ 下缺少新版本发布产物，请先完成构建与打包（哈希与下载页更新依赖它们）');
  }

  // 1) 单版本载体整体盖章
  for (const rel of STAMP_FILES) {
    const s = stampFile(rel);
    if (s) commit(path.join(ROOT, rel), s.text, s.desc + ' → ' + rel);
  }

  // 2) 功能列表头部
  const feat = stampFeatureHead();
  if (feat) commit(path.join(ROOT, P.feats), feat.text, feat.desc);

  // 3) 累计文档插条目（CHANGELOG / RELEASE-NOTES / download.html）
  const cl = buildChangelogText();
  if (cl) commit(path.join(ROOT, P.changelog), cl.text, cl.desc);

  const rn = buildRnText();
  if (rn) commit(path.join(ROOT, P.rn), rn.text, rn.desc);

  const oldSums = readOldSums();
  const dl = buildDlText(hres.out, oldSums);
  if (dl) commit(path.join(ROOT, P.dl), dl.text, dl.desc);

  // 4) 哈希重建（根 + release/）
  if (setupOk && winOk) {
    if (APPLY) {
      syncSums(hres.out);
    } else {
      preview.push('SHA256SUMS.txt 将重建为 setup=' + hres.out.setup.slice(0, 8) + '… / win64='
        + hres.out.win64.slice(0, 8) + '…（根目录 + release/）');
    }
  } else {
    warnings.push('发布产物缺失，已跳过哈希重建与 download.html 哈希替换（请先构建）');
  }

  // 5) 副本同步（整份拷贝）
  copyFile(P.dl, P.idx, 'index.html 同步为 download.html 整份副本');
  copyFile(P.rn, P.siteRn, 'release/RELEASE-NOTES.md 同步为根目录整份副本');
  copyFile(P.dl, P.siteDl, 'release/download.html 同步为根目录整份副本（修复历史遗留旧版）');

  // 6) 汇总
  for (const w of warnings) console.warn('[publish] 警告: ' + w);

  if (!APPLY) {
    if (preview.length) {
      console.log('\n[publish] 干跑将执行 ' + preview.length + ' 项动作：');
      for (const line of preview) console.log('  · ' + line);
    }
    console.log('\n[publish] 干跑结束：未写任何文件。确认无误后执行:');
    console.log('  node tools/publish.js ' + NEW + ' --apply [--date ' + DATE + '] [--notes 文件]');
    return;
  }

  console.log('\n[publish] 落地完成，共 ' + plan.length + ' 项写入：');
  for (const line of plan) console.log('  · ' + line);
  if (warnings.length) console.log('[publish] 存在 ' + warnings.length + ' 条警告，请人工核对上述内容。');
  console.log('\n[publish] 后续按 project_rules.md 人工执行：构建链 → PyInstaller → Inno Setup → 推 GitHub/Gitee → 检出 gh-pages。');
}

main();

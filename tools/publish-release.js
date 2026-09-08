/*
 * tools/publish-release.js —— L.Note 双平台（GitHub + Gitee）Release 统一发布 / 一致性校验脚本
 *
 * 背景：曾发生 GitHub Release body 只写了 268 字摘要、而 Gitee 是完整 RELEASE-NOTES.md；
 *       GitHub tag 指向仓库初始 commit、与 Gitee 的实际发布 commit 不一致。
 *       本脚本把「正文 = RELEASE-NOTES.md 全量」「附件 = 两个 exe」「标题 = tag 提交信息」
 *       固化为唯一口径，双平台走同一条代码路径，杜绝手工差异。
 *
 * 正文约定：以仓库根目录 RELEASE-NOTES.md 的整份内容作为 Release body（历史各版即如此，
 *           v0.21.15/16 双平台 body 均为该文件全量）；发送前统一把 \r\n 归一化为 \n。
 *
 * 用法：
 *   node tools/publish-release.js <tag>                  # 校验模式：本地 + 双平台只读检查，不写任何远程
 *   node tools/publish-release.js <tag> --apply          # 落地：缺失则创建、已存在则更新 body/标题/补齐附件，随后自动复检
 *   node tools/publish-release.js <tag> --github-only    # 只处理 GitHub
 *   node tools/publish-release.js <tag> --gitee-only     # 只处理 Gitee
 *
 * 认证：
 *   - GitHub：使用 gh CLI（gh auth status 需已登录）
 *   - Gitee：GITEE_TOKEN 环境变量，或仓库根目录 .gitee_token 文件（该文件已 gitignore，禁止入库）
 *
 * 前置门禁（--apply 时强制）：
 *   1. tag 在本地存在；若平台尚无该 release，则该平台远端 tag 必须与本地 tag 对象一致（缺失即中止）
 *   2. RELEASE-NOTES.md 与 release/RELEASE-NOTES.md 完全一致（publish.js 会同步）
 *   3. RELEASE-NOTES.md 首标题必须是 # L.Note <tag> 发布说明
 *   4. 两个发布 exe 存在且 SHA256 与 SHA256SUMS.txt 一致
 *
 * 退出码：校验全部通过为 0，任一 FAIL 为 1（--apply 结束时若复检失败同样为 1）。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APP = 'L.Note';
const UA = 'Mozilla/5.0 L.Note-publish-release';
const MAX_RETRY = 3;

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const TAG = (args.find(a => /^v\d+\.\d+\.\d+$/.test(a)) || '').trim();
const APPLY = args.includes('--apply');
let PLATFORMS = ['github', 'gitee'];
if (args.includes('--github-only')) PLATFORMS = ['github'];
if (args.includes('--gitee-only')) PLATFORMS = ['gitee'];

const fails = [];
const warns = [];

function fail(msg) { console.error('[release] 错误: ' + msg); process.exit(1); }
function warn(msg) { warns.push(msg); console.warn('  · WARN  ' + msg); }
function bad(scope, msg) { fails.push(scope + ' — ' + msg); console.error('  ✗ FAIL  ' + scope + ': ' + msg); }
function ok(scope, msg) { console.log('  ✓ PASS  ' + scope + (msg ? ': ' + msg : '')); }
function info(scope, msg) { console.log('  · INFO  ' + scope + (msg ? ': ' + msg : '')); }

if (!TAG) fail('用法: node tools/publish-release.js <vX.Y.Z> [--apply] [--github-only|--gitee-only]');

const VERSION = TAG.replace(/^v/, '');
const SETUP_EXE = APP + '-setup-' + TAG + '.exe';
const WIN64_EXE = APP + '-' + TAG + '-win64.exe';
const ASSETS = [SETUP_EXE, WIN64_EXE];

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------
function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function withRetry(label, fn) {
  let lastErr = null;
  for (let i = 1; i <= MAX_RETRY; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < MAX_RETRY) { console.log('  · RETRY  ' + label + '（第 ' + i + ' 次失败: ' + e.message + '）'); await sleep(2000 * i); }
    }
  }
  throw lastErr;
}

function normBody(text) {
  return String(text)
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sha256Of(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function parseSums() {
  const map = {};
  const p = path.join(ROOT, 'SHA256SUMS.txt');
  if (!fs.existsSync(p)) return map;
  const re = /SHA256\((.*?)\)\s*=\s*([0-9A-F]{64})/g;
  let m;
  const text = fs.readFileSync(p, 'utf8');
  while ((m = re.exec(text))) map[m[1]] = m[2];
  return map;
}

// ---------------------------------------------------------------------------
// 平台识别（不硬编码 owner/repo，从远端 URL 解析）
// ---------------------------------------------------------------------------
function configGet(name) {
  const r = git(['config', '--get', name]);
  return r.status === 0 ? r.stdout.trim() : null;
}

const GITHUB_URL = configGet('remote.github.url') || configGet('remote.origin.url');
const GITEE_URL = configGet('remote.origin.url');
if (!GITHUB_URL || !/github\.com/.test(GITHUB_URL)) fail('无法定位 GitHub 远端（remote.github.url 缺失）');
if (!GITEE_URL || !/gitee\.com/.test(GITEE_URL)) fail('无法定位 Gitee 远端（remote.origin.url 缺失）');

const GH_REPO = (GITHUB_URL.match(/github\.com[:\/]([^\/]+\/[^\/]+?)(\.git)?$/) || [])[1];
if (!GH_REPO) fail('GitHub 远端 URL 无法解析');

const giteeSeg = GITEE_URL.replace(/\.git$/i, '').replace(/\/+$/, '').split('/');
const GITEE = { owner: giteeSeg[giteeSeg.length - 2], repo: giteeSeg[giteeSeg.length - 1] };

console.log('[release] ' + TAG + '  GitHub=' + GH_REPO + '  Gitee=' + GITEE.owner + '/' + GITEE.repo
  + (APPLY ? '（--apply 落地）' : '（校验模式，只读）'));

// ---------------------------------------------------------------------------
// Gitee token 解析（env → 本地文件，禁止入库）
// ---------------------------------------------------------------------------
let giteeToken = process.env.GITEE_TOKEN || null;
if (!giteeToken) {
  const p = path.join(ROOT, '.gitee_token');
  if (fs.existsSync(p)) giteeToken = fs.readFileSync(p, 'utf8').trim();
}
if (!giteeToken && PLATFORMS.includes('gitee')) {
  warn('未找到 Gitee token：请设置环境变量 GITEE_TOKEN，或在仓库根目录创建 .gitee_token 文件（已 gitignore）');
}

// ---------------------------------------------------------------------------
// GitHub 访问（gh CLI）
// ---------------------------------------------------------------------------
async function ghJson(jsonArgs) {
  return withRetry('gh ' + jsonArgs[0] + ' ' + (jsonArgs[1] || ''), () => {
    const r = spawnSync('gh', jsonArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim().split('\n').pop() || 'gh 退出码 ' + r.status);
    return JSON.parse(r.stdout);
  });
}

async function ghRun(args) {
  return withRetry('gh ' + args[0] + ' ' + (args[1] || ''), () => {
    const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim().split('\n').pop() || 'gh 退出码 ' + r.status);
    return true;
  });
}

async function ghReleaseInfo(tag) {
  return ghJson(['release', 'view', tag, '--repo', GH_REPO, '--json', 'tagName,name,isDraft,body,assets']);
}

async function ghCreateOrUpdate(release, title, body) {
  const tmp = path.join(os.tmpdir(), 'lnote-rn-' + TAG + '.md');
  fs.writeFileSync(tmp, body + '\n', 'utf8');
  try {
    if (!release) {
      try {
        await ghRun(['release', 'create', TAG, '--repo', GH_REPO, '--title', title, '--notes-file', tmp]);
        ok('github', 'release 已创建（标题/正文为统一口径）');
      } catch (e) {
        if (!/already exists/i.test(e.message)) throw e;
        await ghRun(['release', 'edit', TAG, '--repo', GH_REPO, '--title', title, '--notes-file', tmp]);
        ok('github', 'release 已存在（并发/重试残留），标题/正文已更新为统一口径');
      }
    } else {
      await ghRun(['release', 'edit', TAG, '--repo', GH_REPO, '--title', title, '--notes-file', tmp]);
      ok('github', 'release 标题/正文已更新为统一口径');
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* 忽略 */ }
  }
  return ghReleaseInfo(TAG);
}

async function ghRemoteTagRef(tag) {
  const j = await ghJson(['api', 'repos/' + GH_REPO + '/git/refs/tags/' + tag]);
  return { sha: j.object.sha, type: j.object.type };
}

// ---------------------------------------------------------------------------
// Gitee 访问（REST API v5）
// ---------------------------------------------------------------------------
const GITEE_API = 'https://gitee.com/api/v5';

async function giteeFetch(pathname, init) {
  if (!giteeToken) throw new Error('缺少 Gitee token');
  const sep = pathname.includes('?') ? '&' : '?';
  const url = GITEE_API + pathname + sep + 'access_token=' + encodeURIComponent(giteeToken);
  const base = Object.assign({ headers: { 'User-Agent': UA, 'Accept': 'application/json' } }, init || {});
  return withRetry('gitee ' + init.method + ' ' + pathname, async () => {
    const res = await fetch(url, base);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
    if (!res.ok) {
      const msg = json ? (json.message || json.error || JSON.stringify(json)) : ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return json;
  });
}

async function giteeGetRelease(tag) {
  try {
    return await giteeFetch('/repos/' + GITEE.owner + '/' + GITEE.repo + '/releases/tags/' + encodeURIComponent(tag), { method: 'GET' });
  } catch (e) {
    if (/404|not found|不存在/i.test(e.message)) return null;
    throw e;
  }
}

async function giteeCreateOrUpdate(release, title, body) {
  const commit = git(['rev-list', '-n', '1', TAG]);
  const targetCommitish = commit.status === 0 && commit.stdout.trim() ? commit.stdout.trim() : '';
  const payload = JSON.stringify({ tag_name: TAG, target_commitish: targetCommitish, name: title, body: body });
  if (!release) {
    const j = await giteeFetch('/repos/' + GITEE.owner + '/' + GITEE.repo + '/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: payload,
    });
    ok('gitee', 'release 已创建（标题/正文为统一口径）');
    return j;
  }
  const j = await giteeFetch('/repos/' + GITEE.owner + '/' + GITEE.repo + '/releases/' + release.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: payload,
  });
  ok('gitee', 'release 标题/正文已更新为统一口径');
  return j;
}

async function giteeRemoteTag(tag) {
  return withRetry('gitee ls-remote ' + tag, () => {
    const r = git(['ls-remote', '--tags', 'origin', 'refs/tags/' + tag]);
    if (r.status !== 0) throw new Error((r.stderr || '').trim() || 'ls-remote 失败');
    const line = (r.stdout || '').trim();
    return line ? line.split('\t')[0] : null;
  });
}

// ---------------------------------------------------------------------------
// 本地前置校验
// ---------------------------------------------------------------------------
const localAssets = {};
for (const name of ASSETS) {
  localAssets[name] = path.join(ROOT, 'release', name);
  if (!fs.existsSync(localAssets[name])) bad('local', '缺少发布产物 release/' + name);
}

function localGates() {
  console.log('\n== 本地门禁 ==');
  const tr = git(['rev-parse', '--verify', TAG]);
  if (tr.status !== 0) fail('本地不存在 tag ' + TAG + '，请先 git tag ' + TAG);
  ok('local', 'tag ' + TAG + ' 存在: ' + tr.stdout.trim());

  const sums = parseSums();
  for (const name of ASSETS) {
    const p = localAssets[name];
    if (!fs.existsSync(p)) continue;
    const want = sums[name];
    if (!want) { warn('SHA256SUMS.txt 缺少 ' + name + ' 的校验和'); continue; }
    if (sha256Of(p) !== want) bad('local', name + ' SHA256 与 SHA256SUMS.txt 不一致');
    else ok('local', name + ' SHA256 与 SHA256SUMS.txt 一致');
  }

  const rnP = path.join(ROOT, 'RELEASE-NOTES.md');
  const rnCopyP = path.join(ROOT, 'release', 'RELEASE-NOTES.md');
  if (!fs.existsSync(rnP)) fail('缺少 RELEASE-NOTES.md');
  if (fs.existsSync(rnCopyP) && normBody(fs.readFileSync(rnP, 'utf8')) !== normBody(fs.readFileSync(rnCopyP, 'utf8'))) {
    bad('local', 'release/RELEASE-NOTES.md 与根目录不一致（请先跑 node tools/publish.js ' + VERSION + ' --apply 同步）');
  }
  const rnText = fs.readFileSync(rnP, 'utf8');
  if (!rnText.startsWith('# L.Note ' + TAG + ' 发布说明')) {
    bad('local', 'RELEASE-NOTES.md 首标题不是 "# L.Note ' + TAG + ' 发布说明"');
  }

  const subject = git(['log', '-1', '--format=%s', TAG]);
  const title = subject.status === 0 && subject.stdout.trim() ? subject.stdout.trim() : TAG;
  ok('local', '标题口径 = tag 提交信息: ' + title);
  return { rnText: rnText, title: title };
}

// ---------------------------------------------------------------------------
// 附件校验（存在 + 大小一致；缺失时只读模式 FAIL、落地模式补传）
// ---------------------------------------------------------------------------
async function checkGithubAssets(info) {
  const assets = (info.assets || []).map(a => a.name);
  for (const name of Object.keys(localAssets)) {
    const hit = (info.assets || []).find(a => a.name === name);
    if (!hit) {
      if (APPLY) {
        await withRetry('gh upload ' + name, () => {
          const r = spawnSync('gh', ['release', 'upload', TAG, '--repo', GH_REPO, localAssets[name], '--clobber'], { encoding: 'utf8' });
          if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim() || '上传失败');
        });
        ok('github', '附件已上传: ' + name);
      } else {
        bad('github', '缺少附件 ' + name + '（--apply 可补传）');
      }
      continue;
    }
    const localSize = fs.statSync(localAssets[name]).size;
    if (hit.size != null && Number(hit.size) !== localSize) bad('github', '附件 ' + name + ' 大小异常（远端 ' + hit.size + ' ≠ 本地 ' + localSize + '）');
    else ok('github', '附件在远端且大小一致: ' + name);
  }
  const ghost = assets.filter(a => !Object.keys(localAssets).includes(a));
  if (ghost.length) warn('github 存在额外附件（不在两件套内，不处理）: ' + ghost.join(', '));
}

async function checkGiteeAssets(release) {
  const assets = release.assets || [];
  const names = assets.map(a => a.name);
  for (const name of Object.keys(localAssets)) {
    if (names.includes(name)) {
      ok('gitee', '附件在远端: ' + name);
      continue;
    }
    if (!APPLY) { bad('gitee', '缺少附件 ' + name + '（--apply 可补传）'); continue; }
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(localAssets[name])]), name);
    await giteeFetch('/repos/' + GITEE.owner + '/' + GITEE.repo + '/releases/' + release.id + '/attach_files', {
      method: 'POST',
      body: fd,
    });
    ok('gitee', '附件已上传: ' + name);
  }
  const ghost = names.filter(n => !Object.keys(localAssets).includes(n));
  if (ghost.length) warn('gitee 存在额外附件（不在两件套内，不处理）: ' + ghost.join(', '));
}

// ---------------------------------------------------------------------------
// 平台校验 / 落地
// ---------------------------------------------------------------------------
async function runGithub(localBodyNorm, title) {
  console.log('\n== GitHub（' + GH_REPO + '）==');
  const localSha = git(['rev-parse', TAG]).stdout.trim();
  let tagAligned = true;
  try {
    const ref = await ghRemoteTagRef(TAG);
    if (ref.type !== 'tag') info('github', '远端 tag 为 lightweight（本地为带注释 tag 时属正常差异）');
    if (ref.sha !== localSha) { bad('github', '远端 tag=' + ref.sha + ' ≠ 本地 tag=' + localSha + '（tag-first：远端 tag 必须与本地一致，禁止在错误 commit 上发布）'); tagAligned = false; }
    else ok('github', '远端 tag 与本地一致 ' + localSha);
  } catch (e) {
    bad('github', '远端 tag 查询失败: ' + e.message);
    tagAligned = false;
  }

  let rel = null;
  try { rel = await ghReleaseInfo(TAG); }
  catch (e) { if (!/not found/i.test(e.message)) bad('github', '查询 release 失败: ' + e.message); }

  if (!rel) {
    info('github', 'release 不存在' + (APPLY ? '（将创建）' : '（--apply 可创建）'));
    if (!APPLY) { bad('github', 'release 不存在'); return; }
  } else if (rel.isDraft) {
    bad('github', 'release 处于 draft 状态，--apply 无法解除，请人工处理');
    return;
  }

  if (APPLY && !tagAligned) {
    bad('github', 'tag 与本地不一致，中止写入：请先修正远端 tag（推送正确 commit 或删除重建 release）后再 --apply');
    return;
  }

  if (APPLY) rel = await ghCreateOrUpdate(rel, title, localBodyNorm);

  if (normBody(rel.name || '') !== normBody(title)) bad('github', '标题不一致（现: ' + rel.name + '）');
  else ok('github', '标题 = ' + rel.name);

  const relBodyNorm = normBody(rel.body || '');
  if (relBodyNorm !== localBodyNorm) {
    bad('github', 'body 与 RELEASE-NOTES.md 不一致（现 ' + (rel.body || '').length + ' 字，应为 ' + localBodyNorm.length + ' 字）');
  } else {
    ok('github', 'body 与 RELEASE-NOTES.md 全量一致（' + localBodyNorm.length + ' 字）');
  }
  await checkGithubAssets(rel);
}

async function runGitee(localBodyNorm, title) {
  console.log('\n== Gitee（' + GITEE.owner + '/' + GITEE.repo + '）==');
  const localSha = git(['rev-parse', TAG]).stdout.trim();
  const remoteSha = await giteeRemoteTag(TAG);
  let tagAligned = !!remoteSha;
  if (!remoteSha) bad('gitee', '远端不存在 tag ' + TAG + '（tag-first：请先 git push origin ' + TAG + '）');
  else if (remoteSha !== localSha) { bad('gitee', '远端 tag=' + remoteSha + ' ≠ 本地 tag=' + localSha + '（tag-first：远端 tag 必须与本地一致，禁止在错误 commit 上发布）'); tagAligned = false; }
  else ok('gitee', '远端 tag 与本地一致 ' + localSha);

  if (!giteeToken) { bad('gitee', '缺少 token，无法继续'); return; }

  const rel0 = await giteeGetRelease(TAG);
  if (!rel0) {
    info('gitee', 'release 不存在' + (APPLY ? '（将创建）' : '（--apply 可创建）'));
    if (!APPLY) { bad('gitee', 'release 不存在'); return; }
  }

  if (APPLY && !tagAligned) {
    bad('gitee', 'tag 与本地不一致，中止写入：请先修正远端 tag 后再 --apply');
    return;
  }

  const rel = APPLY ? await giteeCreateOrUpdate(rel0 || null, title, localBodyNorm) : rel0;

  if (normBody(rel.name || '') !== normBody(title)) bad('gitee', '标题不一致（现: ' + rel.name + '）');
  else ok('gitee', '标题 = ' + rel.name);

  const relBodyNorm = normBody(rel.body || '');
  if (relBodyNorm !== localBodyNorm) {
    bad('gitee', 'body 与 RELEASE-NOTES.md 不一致（现 ' + (rel.body || '').length + ' 字，应为 ' + localBodyNorm.length + ' 字）');
  } else {
    ok('gitee', 'body 与 RELEASE-NOTES.md 全量一致（' + localBodyNorm.length + ' 字）');
  }
  await checkGiteeAssets(rel);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
(async function main() {
  const gates = localGates();
  const localBodyNorm = normBody(gates.rnText);
  const localSize = {};
  for (const name of Object.keys(localAssets)) {
    if (fs.existsSync(localAssets[name])) localSize[name] = fs.statSync(localAssets[name]).size;
  }

  if (PLATFORMS.includes('github')) await runGithub(localBodyNorm, gates.title);
  if (PLATFORMS.includes('gitee')) await runGitee(localBodyNorm, gates.title);

  console.log('\n== 汇总 ==');
  if (fails.length) {
    console.error('结果: FAIL（' + fails.length + ' 项）' + (APPLY ? '，请修复上述问题后重试' : '，--apply 可修复标题/正文/附件类差异'));
    process.exitCode = 1;
    return;
  }
  console.log('结果: PASS —— 双平台 Release 与 RELEASE-NOTES.md 口径完全一致');
})().catch(e => {
  console.error('[release] 未捕获异常: ' + (e && (e.stack || e.message) || e));
  process.exitCode = 1;
});

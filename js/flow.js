/* =========================================================
 * InkpadFlow —— 可视化流程图编辑器（仿 ProcessOn 基础交互）
 * 节点：开始/结束(圆角) 过程(矩形) 判断(菱形)
 * 泳道（泳池）：水平/纵向双方向、点击标题重命名、拖动标题栏移动（内部节点跟随）、拖边调整尺寸、双泳道、分割线、Delete 删除
 * 交互：拖拽移动、整组拖动、空白处拖拽框选多节点、拖拽连线（节点边缘连接点拖到目标节点）、连线模式、双击编辑、Delete 删除、Ctrl+Z 撤销
 * ========================================================= */
window.InkpadFlow = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var CANVAS_W = 3000, CANVAS_H = 2000;
  var LANE_HEADER_W = 96; // 水平泳道左侧标题栏宽度
  var LANE_HEADER_H = 48; // 纵向泳道顶部标题栏高度

  var container = null;   // #visual-canvas
  var svg = null;
  var model = null;       // { nodes:[], edges:[], lanes:[] }
  var onChange = null;
  var selected = null;    // { kind:'node'|'edge'|'lane', id }
  var multiSel = [];      // 多选：框选/点选选中的节点 id 列表
  var boxSel = null;      // 框选状态：{ sx, sy, cx, cy, moved, onLane }
  var mode = 'select';    // 'select' | 'link'
  var linkFrom = null;
  var drag = null;        // { id, startClientX, startClientY, orig:[{id,x,y}], moved } 单节点/整组拖动
  var linkDrag = null;    // { fromId, lastX, lastY } 从节点连接点拖出连线
  var laneDrag = null;    // { id, axis, startPos, origPos, moved } 拖动泳道
  var laneResize = null;  // { id, axis, startPos, origSize, moved } 调整泳道尺寸
  var laneOrig = {};      // 泳道 id -> 拖动前的轴位置（用于松开时一次性移动内部节点）
  var edgeDrag = null;    // { id, side:'from'|'to', startX, startY, lastX, lastY, moved } 拖动连线端点重连
  var linkPreviewEl = null;
  var edgePreviewEl = null;
  var hintEl = null;
  var linkBtnEl = null;
  var shapeBtns = null; // 形状切换按钮 { line, curve, orth }，render() 中按选中连线同步高亮
  var keyHandler = null;
  var lastNodeClick = null; // 双击检测：{ id, t } 最近一次节点按下（350ms 内再次按下同一节点视为双击）
  var undoStack = [];    // 撤销历史（模型快照栈）
  var styleBarEl = null; // 顶部样式工具栏（ProcessOn 风格，按钮化），选中节点/连线/泳道时显示
  var DEFAULT_HINT = '拖拽移动节点 · 空白处拖拽框选多个节点 · 从节点边缘拖出连线 · 选中连线后可切换直线/曲线/折线并拖动端点重连 · 双击编辑文字 · 拖动泳道标题栏移动泳道 · 点击泳道标题重命名 · Ctrl+Z 撤销';

  var seq = 0;
  function uid(prefix) {
    return (prefix || 'n') + (++seq) + Date.now().toString(36);
  }

  /* ---------------- 模型 ---------------- */
  function defaultModel() {
    return {
      nodes: [
        { id: 'n1', type: 'start',    x: 200, y: 80,  text: '开始' },
        { id: 'n2', type: 'decision', x: 200, y: 220, text: '条件判断' },
        { id: 'n3', type: 'process',  x: 380, y: 380, text: '处理数据' },
        { id: 'n4', type: 'process',  x: 60,  y: 380, text: '记录日志' },
        { id: 'n5', type: 'end',      x: 200, y: 540, text: '结束' }
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3', text: '是' },
        { id: 'e3', from: 'n2', to: 'n4', text: '否' },
        { id: 'e4', from: 'n3', to: 'n5' },
        { id: 'e5', from: 'n4', to: 'n5' }
      ],
      lanes: [
        { id: 'l1', title: '泳道 1', y: 0,   h: 240 },
        { id: 'l2', title: '泳道 2', y: 240, h: 240 },
        { id: 'l3', title: '泳道 3', y: 480, h: 240 }
      ]
    };
  }

  function getLane(id) {
    for (var i = 0; i < model.lanes.length; i++) {
      if (model.lanes[i].id === id) return model.lanes[i];
    }
    return null;
  }

  // 按轴移动泳道内部节点：delta 为位移量；from 为拖动前的区间起点（用于判定归属）
  function moveLaneNodes(laneId, delta, from) {
    if (!delta) return;
    var lane = getLane(laneId);
    if (!lane) return;
    var isV = lane.dir === 'v';
    var start = (from == null ? (isV ? lane.x : lane.y) : from);
    var size = isV ? lane.w : lane.h;
    model.nodes.forEach(function (n) {
      var p = isV ? n.x : n.y;
      if (p >= start && p < start + size) {
        if (isV) n.x = Math.round(n.x + delta);
        else n.y = Math.round(n.y + delta);
      }
    });
  }

  // 分别按两个轴向消除泳道重叠：被挤开的泳道按“拖动前区间”一次性携带内部节点移动
  function fixOverlaps() {
    var hs = [], vs = [];
    model.lanes.forEach(function (l) {
      (l.dir === 'v' ? vs : hs).push(l);
    });
    fixLaneAxis(hs, 'h');
    fixLaneAxis(vs, 'v');
  }

  function fixLaneAxis(list, axis) {
    var pos = function (l) { return axis === 'v' ? l.x : l.y; };
    var setPos = function (l, v) { if (axis === 'v') l.x = v; else l.y = v; };
    var size = function (l) { return axis === 'v' ? l.w : l.h; };
    list.sort(function (a, b) { return pos(a) - pos(b); });
    var cursor = 0;
    list.forEach(function (l) {
      var orig = (laneOrig[l.id] != null ? laneOrig[l.id] : pos(l));
      if (pos(l) < cursor) setPos(l, cursor);
      var delta = pos(l) - orig;
      if (delta) moveLaneNodes(l.id, delta, orig);
      cursor = pos(l) + size(l);
    });
  }

  function getNode(id) {
    for (var i = 0; i < model.nodes.length; i++) {
      if (model.nodes[i].id === id) return model.nodes[i];
    }
    return null;
  }

  function getEdge(id) {
    for (var i = 0; i < model.edges.length; i++) {
      if (model.edges[i].id === id) return model.edges[i];
    }
    return null;
  }

  function nodeSize(node) {
    var len = (node.text || '').replace(/[\x00-\xff]/g, 'a').length; // 中文按2个宽度估
    var w = Math.max(90, len * 8 + 34);
    if (node.type === 'decision') return { w: Math.max(120, len * 8 + 60), h: 64 };
    return { w: w, h: 42 };
  }

  // 节点局部坐标 (lx,ly)（以节点中心为原点）是否在形状内部：沿射线求边界用（所有形状均为凸形）
  function pointInShape(node, lx, ly) {
    var s = nodeSize(node);
    var hw = s.w / 2, hh = s.h / 2;
    if (node.type === 'decision') {
      return (Math.abs(lx) / hw) + (Math.abs(ly) / hh) <= 1;
    }
    if (node.type === 'start' || node.type === 'end') {
      var r = hh, L = hw - r; // 胶囊：中间直线段 + 两端半圆
      if (Math.abs(lx) <= L) return Math.abs(ly) <= r;
      var dx = Math.abs(lx) - L;
      return dx * dx + ly * ly <= r * r;
    }
    return Math.abs(lx) <= hw && Math.abs(ly) <= hh; // process 圆角忽略（rx=6，误差极小）
  }

  // 从节点中心沿 (tx,ty) 方向与形状边界求交 —— 支持吸附到图形的任意边界点
  function boundaryPoint(node, tx, ty) {
    var s = nodeSize(node);
    var dx = tx - node.x, dy = ty - node.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return { x: node.x, y: node.y - s.h / 2 };
    var ux = dx / len, uy = dy / len;
    var lo = 0, hi = 1;
    while (pointInShape(node, ux * hi, uy * hi)) {
      hi *= 2;
      if (hi > 1e6) break;
    }
    // 凸形沿射线“内部区间”为 [0, 边界]，二分精化求交点
    for (var i = 0; i < 36; i++) {
      var m = (lo + hi) / 2;
      if (pointInShape(node, ux * m, uy * m)) lo = m; else hi = m;
    }
    return { x: node.x + ux * lo, y: node.y + uy * lo };
  }

  // 屏幕坐标 → 节点中心局部锚点（节点移动时端点自动跟随相对位置）
  function anchorFor(node, tx, ty) {
    var p = boundaryPoint(node, tx, ty);
    return { x: Math.round(p.x - node.x), y: Math.round(p.y - node.y) };
  }

  // 节点局部锚点 → 屏幕坐标
  function anchorPoint(node, anchor) {
    if (!anchor) return { x: node.x, y: node.y };
    return { x: node.x + anchor.x, y: node.y + anchor.y };
  }

  /* ---------------- 正交绕障路径（ProcessOn 风格） ---------------- */

  // 收集障碍矩形（排除端点所在节点；外扩 10px 保证连线与图形留出间距）
  function obstacleBoxes(excludeIds) {
    var list = [];
    model.nodes.forEach(function (n) {
      if (excludeIds && excludeIds.length && excludeIds.indexOf(n.id) >= 0) return;
      var s = nodeSize(n);
      list.push({ x1: n.x - s.w / 2 - 10, y1: n.y - s.h / 2 - 10, x2: n.x + s.w / 2 + 10, y2: n.y + s.h / 2 + 10 });
    });
    return list;
  }

  // 轴对齐线段 (a→b) 是否穿过矩形 box（斜线段用多点抽样近似判定）
  function segCrossesBox(a, b, box) {
    if (a.x === b.x) {
      var y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
      return a.x > box.x1 && a.x < box.x2 && y2 > box.y1 && y1 < box.y2;
    }
    if (a.y === b.y) {
      var x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
      return a.y > box.y1 && a.y < box.y2 && x2 > box.x1 && x1 < box.x2;
    }
    var steps = 32;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      if (px > box.x1 && px < box.x2 && py > box.y1 && py < box.y2) return true;
    }
    return false;
  }

  // 若点 p 落在障碍内部，则将其外移到最近的障碍边界之外（外扩 10px），否则返回 null
  function moveOut(p, box) {
    if (!(p.x > box.x1 && p.x < box.x2 && p.y > box.y1 && p.y < box.y2)) return null;
    var dl = p.x - box.x1, dr = box.x2 - p.x, dt = p.y - box.y1, db = box.y2 - p.y;
    var dmin = Math.min(dl, dr, dt, db);
    if (dmin === dt) return { x: p.x, y: box.y1 - 10 };
    if (dmin === db) return { x: p.x, y: box.y2 + 10 };
    if (dmin === dl) return { x: box.x1 - 10, y: p.y };
    return { x: box.x2 + 10, y: p.y };
  }

  // 边界点 p 在节点 n 上所属的边，返回该边朝外的单位方向（用于垂直出线/垂直进线）
  function sideDir(n, p) {
    var s = nodeSize(n);
    var hw = s.w / 2, hh = s.h / 2;
    var lx = p.x - n.x, ly = p.y - n.y;
    if (Math.abs(lx) / hw >= Math.abs(ly) / hh) return lx >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    return ly >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }

  // 从边界点 p 沿方向 d 出发，需要多长引导段才能完全离开节点 n 的外扩框（+10 保证间距）
  function leadLen(n, p, d) {
    var s = nodeSize(n);
    var hw = s.w / 2, hh = s.h / 2;
    var need;
    if (d.x > 0) need = (n.x + hw + 10) - p.x + 10;
    else if (d.x < 0) need = p.x - (n.x - hw - 10) + 10;
    else if (d.y > 0) need = (n.y + hh + 10) - p.y + 10;
    else need = p.y - (n.y - hh - 10) + 10;
    return Math.max(40, need);
  }

  // 轴对齐线段 (a→b) 是否与任一障碍冲突（返回冲突障碍索引，无冲突返回 -1）
  function segHits(a, b, boxes) {
    for (var i = 0; i < boxes.length; i++) {
      if (segCrossesBox(a, b, boxes[i])) return i;
    }
    return -1;
  }

  // U 形整体绕行：沿水平走廊向上/下绕，或沿垂直走廊向左/右绕（选总移动量较小一侧）
  function uDetour(p1, p2, boxes, axis) {
    var GAP = 10;
    var xlo = Math.min(p1.x, p2.x), xhi = Math.max(p1.x, p2.x);
    var ylo = Math.min(p1.y, p2.y), yhi = Math.max(p1.y, p2.y);
    var hits = [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.x1 < xhi && b.x2 > xlo && b.y1 < yhi && b.y2 > ylo) hits.push(b);
    }
    if (!hits.length) return null;
    if (axis === 'h') {
      var yUp = Infinity, yDown = -Infinity;
      for (var j = 0; j < hits.length; j++) {
        if (hits[j].y1 - GAP < yUp) yUp = hits[j].y1 - GAP;
        if (hits[j].y2 + GAP > yDown) yDown = hits[j].y2 + GAP;
      }
      var yc = ((p1.y - yUp) + (p2.y - yUp)) <= ((yDown - p1.y) + (yDown - p2.y)) ? yUp : yDown;
      return [p1, { x: p1.x, y: yc }, { x: p2.x, y: yc }, p2];
    }
    var xL = Infinity, xR = -Infinity;
    for (var k = 0; k < hits.length; k++) {
      if (hits[k].x1 - GAP < xL) xL = hits[k].x1 - GAP;
      if (hits[k].x2 + GAP > xR) xR = hits[k].x2 + GAP;
    }
    var xc = ((p1.x - xL) + (p2.x - xL)) <= ((xR - p1.x) + (xR - p2.x)) ? xL : xR;
    return [p1, { x: xc, y: p1.y }, { x: xc, y: p2.y }, p2];
  }

  // 计算正交绕障折线：优先 L 型/Z 型三折点路径；被障碍阻挡时整体 U 形绕行；极端情况逐段迭代兜底
  function orthRoute(p1, p2, boxes) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var hFirst = Math.abs(dx) >= Math.abs(dy);
    var cands = [];
    if (hFirst) {
      var mz = (p1.x + p2.x) / 2;
      cands.push([p1, { x: p2.x, y: p1.y }, p2]);
      cands.push([p1, { x: p1.x, y: p2.y }, p2]);
      cands.push([p1, { x: mz, y: p1.y }, { x: mz, y: p2.y }, p2]);
    } else {
      var my = (p1.y + p2.y) / 2;
      cands.push([p1, { x: p1.x, y: p2.y }, p2]);
      cands.push([p1, { x: p2.x, y: p1.y }, p2]);
      cands.push([p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2]);
    }
    var i, j;
    for (i = 0; i < cands.length; i++) {
      var pts = cands[i], ok = true;
      for (j = 0; j < pts.length - 1; j++) {
        if (segHits(pts[j], pts[j + 1], boxes) >= 0) { ok = false; break; }
      }
      if (ok) return pts;
    }
    var det = uDetour(p1, p2, boxes, hFirst ? 'h' : 'v');
    if (det) {
      var ok2 = true;
      for (j = 0; j < det.length - 1; j++) {
        if (segHits(det[j], det[j + 1], boxes) >= 0) { ok2 = false; break; }
      }
      if (ok2) return det;
    }
    var det2 = uDetour(p1, p2, boxes, hFirst ? 'v' : 'h');
    if (det2) {
      var ok3 = true;
      for (j = 0; j < det2.length - 1; j++) {
        if (segHits(det2[j], det2[j + 1], boxes) >= 0) { ok3 = false; break; }
      }
      if (ok3) return det2;
    }
    // 兜底：逐段检测并 U 型绕行（迭代直至无穿越，保底不穿图形）
    var pts2 = cands[0].slice();
    for (var iter = 0; iter < 10; iter++) {
      var changed = false;
      for (var i2 = 0; i2 < pts2.length - 1 && !changed; i2++) {
        var a = pts2[i2], b = pts2[i2 + 1];
        for (var j2 = 0; j2 < boxes.length && !changed; j2++) {
          var box = boxes[j2];
          if (!segCrossesBox(a, b, box)) continue;
          changed = true;
          var a2 = moveOut(a, box), b2 = moveOut(b, box);
          var newA = a2 || a, newB = b2 || b;
          var insert = [];
          if (a.x === b.x) {
            var xl = box.x1 - 10, xr = box.x2 + 10;
            var xs = (a.x - xl <= xr - a.x) ? xl : xr;
            insert.push({ x: xs, y: newA.y });
            if (b2) insert.push(newB); else insert.push({ x: xs, y: newB.y });
          } else {
            var yt = box.y1 - 10, yb = box.y2 + 10;
            var ys = (a.y - yt <= yb - a.y) ? yt : yb;
            insert.push({ x: newA.x, y: ys });
            if (b2) insert.push(newB); else insert.push({ x: newB.x, y: ys });
          }
          pts2 = pts2.slice(0, i2).concat([newA], insert, [newB], pts2.slice(i2 + 2));
        }
      }
      if (!changed) break;
    }
    var clean = [pts2[0]];
    for (var k = 1; k < pts2.length; k++) {
      var q = pts2[k], prev = clean[clean.length - 1];
      if (q.x !== prev.x || q.y !== prev.y) clean.push(q);
    }
    return clean;
  }

  // ProcessOn 风格绕障折线：从源锚点沿其所在边垂直出线 → 绕过所有图形（含端点图形）→ 垂直进线到目标锚点
  function orthRouteAround(p1, p2, nodeA, nodeB, boxes) {
    var d1 = sideDir(nodeA, p1), d2 = sideDir(nodeB, p2);
    var l1 = leadLen(nodeA, p1, d1);
    var l2 = leadLen(nodeB, p2, d2);
    var e1 = { x: Math.round(p1.x + d1.x * l1), y: Math.round(p1.y + d1.y * l1) };
    var e2 = { x: Math.round(p2.x + d2.x * l2), y: Math.round(p2.y + d2.y * l2) };
    var mid = orthRoute(e1, e2, boxes);
    return [p1, e1].concat(mid.slice(1), [p2]);
  }

  // 直线段 p1→p2 是否穿过任一障碍
  function crossAny(p1, p2, boxes) {
    for (var i = 0; i < boxes.length; i++) {
      if (segCrossesBox(p1, p2, boxes[i])) return true;
    }
    return false;
  }

  // 线段 p1→p2 是否穿过节点 n 的形状内部（两端点恰在边界上，采样跳过端点，避免把“接触”误判为“穿过”）
  function segCrossesNode(p1, p2, n) {
    var steps = 96;
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var px = p1.x + (p2.x - p1.x) * t, py = p1.y + (p2.y - p1.y) * t;
      if (pointInShape(n, px - n.x, py - n.y)) return true;
    }
    return false;
  }

  // 折线点序列 → path d 与路径中点（沿折线走一半）
  function polylinePath(pts) {
    var d = 'M ' + pts[0].x + ' ' + pts[0].y;
    var total = 0, i, segLens = [];
    for (i = 1; i < pts.length; i++) {
      var seg = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
      segLens.push(seg);
      total += seg;
      d += ' L ' + pts[i].x + ' ' + pts[i].y;
    }
    var half = total / 2, acc = 0, mid = pts[0];
    for (i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] >= half) {
        var t = segLens[i] ? (half - acc) / segLens[i] : 0;
        mid = {
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * t
        };
        break;
      }
      acc += segLens[i];
    }
    return { d: d, mid: mid };
  }

  // 生成连线路径：直线 line / 三次贝塞尔曲线 curve / 正交折线 orth（默认）
  // line/curve 直连若穿过中间节点或端点图形自身（锚点在远侧），自动退化为 ProcessOn 风格绕障折线（不穿过图形）
  function edgePath(p1, p2, shape, fromId, toId) {
    shape = shape || 'line';
    var exclude = [];
    if (fromId) exclude.push(fromId);
    if (toId && exclude.indexOf(toId) < 0) exclude.push(toId);
    var boxes = obstacleBoxes(exclude);
    var nodeA = fromId ? getNode(fromId) : null;
    var nodeB = toId ? getNode(toId) : null;
    // 直线段是否穿过端点图形内部（源端或目标端锚点位于远侧时会发生）
    var throughSelf = (nodeA && segCrossesNode(p1, p2, nodeA)) || (nodeB && segCrossesNode(p1, p2, nodeB));
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    if (shape === 'curve' && !throughSelf && !crossAny(p1, p2, boxes)) {
      var c1, c2;
      if (Math.abs(dx) >= Math.abs(dy)) {
        var kx = dx * 0.45;
        c1 = { x: p1.x + kx, y: p1.y };
        c2 = { x: p2.x - kx, y: p2.y };
      } else {
        var ky = dy * 0.45;
        c1 = { x: p1.x, y: p1.y + ky };
        c2 = { x: p2.x, y: p2.y - ky };
      }
      return {
        d: 'M ' + p1.x + ' ' + p1.y + ' C ' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + p2.x + ' ' + p2.y,
        mid: {
          x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
          y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8
        }
      };
    }
    if (shape === 'line' && !throughSelf && !crossAny(p1, p2, boxes)) {
      return {
        d: 'M ' + p1.x + ' ' + p1.y + ' L ' + p2.x + ' ' + p2.y,
        mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      };
    }
    // orth 形状，或 line/curve 直连被端点图形/中间节点阻挡 → 垂直出线绕行后垂直进线
    var allBoxes = obstacleBoxes([]);
    if (nodeA && nodeB) return polylinePath(orthRouteAround(p1, p2, nodeA, nodeB, allBoxes));
    return polylinePath(orthRoute(p1, p2, boxes));
  }

  /* ---------------- 撤销 ---------------- */
  function snapshot() {
    return {
      nodes: model.nodes.map(function (n) {
        var s = { id: n.id, type: n.type, x: n.x, y: n.y, text: n.text };
        if (n.style) s.style = JSON.parse(JSON.stringify(n.style));
        return s;
      }),
      edges: model.edges.map(function (e) {
        var s = {
          id: e.id, from: e.from, to: e.to, text: e.text, shape: e.shape,
          fromAnchor: e.fromAnchor ? { x: e.fromAnchor.x, y: e.fromAnchor.y } : null,
          toAnchor: e.toAnchor ? { x: e.toAnchor.x, y: e.toAnchor.y } : null
        };
        if (e.style) s.style = JSON.parse(JSON.stringify(e.style));
        return s;
      }),
      lanes: model.lanes.map(function (l) {
        var s = { id: l.id, title: l.title, dir: l.dir, y: l.y, h: l.h };
        if (l.dir === 'v') { s.x = l.x; s.w = l.w; }
        if (l.style) s.style = JSON.parse(JSON.stringify(l.style));
        return s;
      })
    };
  }

  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > 50) undoStack.shift();
  }

  function undo() {
    if (!undoStack.length) { setHint('没有可撤销的操作'); return; }
    var snap = undoStack.pop();
    model.nodes = snap.nodes;
    model.edges = snap.edges;
    model.lanes = snap.lanes || [];
    drag = null;
    linkDrag = null;
    edgeDrag = null;
    laneDrag = null;
    laneResize = null;
    boxSel = null;
    hideLinkPreview();
    hideEdgePreview();
    selected = null;
    multiSel = [];
    mode = 'select';
    linkFrom = null;
    if (linkBtnEl) linkBtnEl.classList.remove('active');
    onChange();
    render();
    setHint('已撤销上一步操作（Ctrl+Z）');
  }

  /* ---------------- 渲染 ---------------- */
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // 颜色类属性转内联 style：CSS 选择器规则优先级高于 SVG presentation attribute，
  // 只有内联 style 才能覆盖 css/components.css 中的默认外观规则，保证样式面板设置的
  // 颜色真正渲染生效。
  function styleStr(obj) {
    var parts = [];
    for (var k in obj) parts.push(k + ':' + obj[k]);
    return parts.join(';');
  }

  /* ---------------- 样式系统（ProcessOn 风格样式面板） ---------------- */
  // model 中 style 只存用户自定义字段，渲染时与默认值合并得到最终样式
  function nodeDefaultStyle(type) {
    var s = { fill: '#ffffff', stroke: '#5b6b79', strokeWidth: 1.4, strokeDash: 'none', radius: 6, textColor: '#333333', fontSize: 13, bold: false, italic: false };
    if (type === 'start' || type === 'end') { s.fill = '#f1f1ef'; s.radius = 999; }
    if (type === 'decision') { s.fill = '#fdf6e3'; s.stroke = '#b8912f'; }
    return s;
  }
  function effNodeStyle(node) {
    var d = nodeDefaultStyle(node.type);
    var o = node.style || {};
    for (var k in d) if (o[k] != null) d[k] = o[k];
    return d;
  }
  function edgeDefaultStyle() {
    return { stroke: '#8a94a6', strokeWidth: 1.5, strokeDash: 'none', arrow: true, textColor: '#6b7688', fontSize: 12 };
  }
  function effEdgeStyle(edge) {
    var d = edgeDefaultStyle();
    var o = edge.style || {};
    for (var k in d) if (o[k] != null) d[k] = o[k];
    return d;
  }
  function laneDefaultStyle() {
    return { bodyFill: '#eef1f7', headerFill: '#dce2ee', stroke: '#c6cddb', titleColor: '#5a6b8c' };
  }
  function effLaneStyle(lane) {
    var d = laneDefaultStyle();
    var o = lane.style || {};
    for (var k in d) if (o[k] != null) d[k] = o[k];
    return d;
  }
  function dashAttr(v) {
    if (!v || v === 'none') return null;
    return v === 'dashed' ? '8 4' : (v === 'dotted' ? '3 3' : v);
  }

  function render() {
    if (!svg) return;
    svg.innerHTML = '';
    var defs = el('defs', {});
    svg.appendChild(defs);
    // 为每条启用箭头的连线生成与线条同色的箭头 marker
    model.edges.forEach(function (edge) {
      var st = effEdgeStyle(edge);
      if (!st.arrow) return;
      var mk = el('marker', {
        id: 'flow-arrow-' + edge.id, viewBox: '0 0 10 10', refX: '9', refY: '5',
        markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse'
      });
      mk.appendChild(el('path', { d: 'M 0 1 L 9 5 L 0 9 z', style: styleStr({ fill: st.stroke }) }));
      defs.appendChild(mk);
    });

    var laneLayer = el('g', {});
    var edgeLayer = el('g', {});
    var nodeLayer = el('g', {});
    var portLayer = el('g', {});
    svg.appendChild(laneLayer);
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(portLayer);

    // 泳道（泳池）背景，置于连线和节点之下
    renderLanes(laneLayer);

    // 连线（端点锚定在节点边界的任意点上，形状可为 直线/曲线/折线）
    model.edges.forEach(function (edge) {
      var a = getNode(edge.from), b = getNode(edge.to);
      if (!a || !b) return;
      var p1 = edge.fromAnchor ? anchorPoint(a, edge.fromAnchor) : boundaryPoint(a, b.x, b.y);
      var p2 = edge.toAnchor ? anchorPoint(b, edge.toAnchor) : boundaryPoint(b, a.x, a.y);
      var path = edgePath(p1, p2, edge.shape, edge.from, edge.to);
      var st = effEdgeStyle(edge);
      var sel = isSel('edge', edge.id);
      var g = el('g', { 'class': 'flow-edge' + (sel ? ' selected' : ''), 'data-id': edge.id });
      // 透明加宽的点击热区
      g.appendChild(el('path', {
        d: path.d, fill: 'none', stroke: 'transparent', 'stroke-width': 12, 'class': 'edge-hit'
      }));
      if (sel) g.appendChild(el('path', { d: path.d, fill: 'none', 'class': 'edge-outline' }));
      var lineStyle = { stroke: st.stroke, 'stroke-width': st.strokeWidth };
      var dash = dashAttr(st.strokeDash);
      if (dash) lineStyle['stroke-dasharray'] = dash;
      var lineAttrs = { d: path.d, fill: 'none', style: styleStr(lineStyle) };
      if (st.arrow) lineAttrs['marker-end'] = 'url(#flow-arrow-' + edge.id + ')';
      g.appendChild(el('path', lineAttrs));
      if (edge.text) {
        var t = el('text', { x: path.mid.x + 6, y: path.mid.y - 6, 'class': 'edge-text', style: styleStr({ fill: st.textColor, 'font-size': st.fontSize }) });
        t.textContent = edge.text;
        g.appendChild(t);
      }
      // 选中时显示两端可拖动的重连手柄（from 空心 / to 实心）
      // 手柄置于最顶层 portLayer，避免被节点图形遮挡而无法点击
      if (isSel('edge', edge.id)) {
        portLayer.appendChild(el('circle', { cx: p1.x, cy: p1.y, r: 6, 'class': 'edge-port from', 'data-edge-id': edge.id }));
        portLayer.appendChild(el('circle', { cx: p2.x, cy: p2.y, r: 6, 'class': 'edge-port to', 'data-edge-id': edge.id }));
      }
      edgeLayer.appendChild(g);
    });

    // 节点
    model.nodes.forEach(function (node) {
      var s = nodeSize(node);
      var st = effNodeStyle(node);
      var selNode = isNodeSel(node.id);
      var cls = 'flow-node type-' + node.type +
        (selNode ? ' selected' : '') +
        (linkFrom === node.id ? ' link-from' : '');
      var g = el('g', { 'class': cls, 'data-id': node.id, transform: 'translate(' + node.x + ',' + node.y + ')' });
      var shapeStyle = { fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth };
      var dash = dashAttr(st.strokeDash);
      if (dash) shapeStyle['stroke-dasharray'] = dash;
      var shapeAttrs = { style: styleStr(shapeStyle) };
      var needOutline = selNode || linkFrom === node.id;

      if (node.type === 'decision') {
        var hw = s.w / 2, hh = s.h / 2;
        shapeAttrs.points = '0,' + (-hh) + ' ' + hw + ',0 0,' + hh + ' ' + (-hw) + ',0';
        shapeAttrs['class'] = 'node-shape';
        g.appendChild(el('polygon', shapeAttrs));
        if (needOutline) g.appendChild(el('polygon', { points: shapeAttrs.points, 'class': 'node-outline' }));
      } else {
        var rx = Math.min(st.radius, s.h / 2);
        shapeAttrs.x = -s.w / 2; shapeAttrs.y = -s.h / 2;
        shapeAttrs.width = s.w; shapeAttrs.height = s.h; shapeAttrs.rx = rx;
        shapeAttrs['class'] = 'node-shape';
        g.appendChild(el('rect', shapeAttrs));
        if (needOutline) g.appendChild(el('rect', {
          x: -s.w / 2, y: -s.h / 2, width: s.w, height: s.h, rx: rx, 'class': 'node-outline'
        }));
      }
      var tStyle = { fill: st.textColor, 'font-size': st.fontSize };
      if (st.bold) tStyle['font-weight'] = 'bold';
      if (st.italic) tStyle['font-style'] = 'italic';
      var tAttrs = { x: 0, y: 0, 'class': 'node-text', style: styleStr(tStyle) };
      var t = el('text', tAttrs);
      t.textContent = node.text;
      g.appendChild(t);
      // 连接点：四边中点，hover 节点时显示，可拖出连线
      [[0, -s.h / 2], [s.w / 2, 0], [0, s.h / 2], [-s.w / 2, 0]].forEach(function (p) {
        g.appendChild(el('circle', { cx: p[0], cy: p[1], r: 5, 'class': 'flow-port' }));
      });
      nodeLayer.appendChild(g);
    });
    if (linkDrag) drawLinkPreview();
    // 框选矩形（置于最上层）
    if (boxSel) {
      svg.appendChild(el('rect', {
        x: Math.min(boxSel.sx, boxSel.cx), y: Math.min(boxSel.sy, boxSel.cy),
        width: Math.abs(boxSel.cx - boxSel.sx), height: Math.abs(boxSel.cy - boxSel.sy),
        'class': 'flow-box-select', 'pointer-events': 'none'
      }));
    }
    syncShapeBtns();
    syncStyleBar();
  }

  function renderLanes(layer) {
    model.lanes.forEach(function (lane) {
      var sel = isSel('lane', lane.id);
      var isV = lane.dir === 'v';
      var st = effLaneStyle(lane);
      var g = el('g', {
        'class': 'flow-lane' + (isV ? ' lane-v' : ' lane-h') + (sel ? ' selected' : ''),
        'data-id': lane.id
      });
      if (isV) {
        // 纵向泳道：顶部标题栏，标题水平显示
        g.appendChild(el('rect', {
          x: lane.x, y: LANE_HEADER_H, width: lane.w, height: CANVAS_H - LANE_HEADER_H,
          'class': 'flow-lane-body', style: styleStr({ fill: st.bodyFill, stroke: st.stroke })
        }));
        g.appendChild(el('rect', {
          x: lane.x, y: 0, width: lane.w, height: LANE_HEADER_H,
          'class': 'flow-lane-header', style: styleStr({ fill: st.headerFill, stroke: st.stroke })
        }));
        var tv = el('text', {
          'class': 'flow-lane-title',
          x: lane.x + lane.w / 2, y: LANE_HEADER_H / 2,
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          style: styleStr({ fill: st.titleColor })
        });
        tv.textContent = lane.title || '';
        g.appendChild(tv);
        if (sel) g.appendChild(el('rect', {
          x: lane.x, y: 0, width: lane.w, height: CANVAS_H, 'class': 'lane-outline'
        }));
        if (sel) {
          g.appendChild(el('rect', {
            x: lane.x + lane.w - 8, y: LANE_HEADER_H, width: 8, height: CANVAS_H - LANE_HEADER_H,
            'class': 'flow-lane-resize'
          }));
        }
      } else {
        // 横向泳道：左侧标题栏，标题旋转 90°
        g.appendChild(el('rect', {
          x: LANE_HEADER_W, y: lane.y, width: CANVAS_W - LANE_HEADER_W, height: lane.h,
          'class': 'flow-lane-body', style: styleStr({ fill: st.bodyFill, stroke: st.stroke })
        }));
        g.appendChild(el('rect', {
          x: 0, y: lane.y, width: LANE_HEADER_W, height: lane.h,
          'class': 'flow-lane-header', style: styleStr({ fill: st.headerFill, stroke: st.stroke })
        }));
        var th = el('text', { 'class': 'flow-lane-title', style: styleStr({ fill: st.titleColor }) });
        th.textContent = lane.title || '';
        var cx = LANE_HEADER_W / 2, cy = lane.y + lane.h / 2;
        th.setAttribute('x', cx);
        th.setAttribute('y', cy);
        th.setAttribute('text-anchor', 'middle');
        th.setAttribute('dominant-baseline', 'central');
        th.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
        g.appendChild(th);
        if (sel) g.appendChild(el('rect', {
          x: 0, y: lane.y, width: LANE_HEADER_W, height: lane.h, 'class': 'lane-outline'
        }));
        if (sel) {
          g.appendChild(el('rect', {
            x: LANE_HEADER_W, y: lane.y + lane.h - 8, width: CANVAS_W - LANE_HEADER_W, height: 8,
            'class': 'flow-lane-resize'
          }));
        }
      }
      layer.appendChild(g);
    });
  }

  /* ---------------- 样式设置（右上角按钮弹出的浮层面板，ProcessOn 风格按钮化） ---------------- */
  var panelMode = null;        // 当前样式作用对象：'node' | 'edge' | 'lane'
  var panelHistPushed = false; // 本次选中周期是否已入撤销栈（连续调节只入一次）
  var lastPanelSelKey = '';    // 上次样式栏对应的选中对象标识（选中切换时重置历史标记）
  var stylePanelOpen = false;  // 样式浮层面板是否打开（由右上角按钮控制）

  // 预设色板：颜色全部用按钮色块，避免原生颜色选择器在桌面 WebView 中不可用
  var STYLE_COLORS = [
    '#ffffff', '#f1f1ef', '#fdf6e3', '#fde8e8', '#e8f5e9', '#e3f2fd', '#fff3e0', '#f3e5f5',
    '#ffeb3b', '#ff9800', '#f44336', '#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#00bcd4',
    '#4caf50', '#8bc34a', '#5b6b79', '#8a94a6', '#6b7688', '#333333', '#111111'
  ];

  function buildStyleBar() {
    if (!container || styleBarEl) return;
    styleBarEl = document.createElement('div');
    styleBarEl.className = 'flow-style-bar';
    styleBarEl.style.display = 'none';
    styleBarEl.innerHTML =
      '<div class="fsb-sec fsb-node">' +
      '<span class="fsb-lbl">填充</span><span class="fsb-pal" data-k="fill"></span>' +
      '<span class="fsb-lbl">边框</span><span class="fsb-pal" data-k="stroke"></span>' +
      '<span class="fsb-lbl">文字</span><span class="fsb-pal" data-k="textColor"></span>' +
      '<span class="fsb-sep"></span>' +
      '<span class="fsb-lbl">线宽</span><span class="fsb-seg" data-k="strokeWidth" data-opts="1,1.4,2,3,4"></span>' +
      '<span class="fsb-lbl">线型</span><span class="fsb-seg" data-k="strokeDash" data-opts="none|实线,dashed|虚线,dotted|点线"></span>' +
      '<span class="fsb-radius-wrap"><span class="fsb-lbl">圆角</span><input type="range" class="fsb-range" min="0" max="60" step="1" data-k="radius"></span>' +
      '<button class="fsb-btn fsb-toggle" data-k="bold" title="加粗">B</button>' +
      '<button class="fsb-btn fsb-toggle" data-k="italic" title="斜体">I</button>' +
      '<span class="fsb-lbl">字号</span><input type="range" class="fsb-range fsb-range-sm" min="10" max="24" step="1" data-k="fontSize">' +
      '</div>' +
      '<div class="fsb-sec fsb-edge">' +
      '<span class="fsb-lbl">线条</span><span class="fsb-pal" data-k="stroke"></span>' +
      '<span class="fsb-lbl">文字</span><span class="fsb-pal" data-k="textColor"></span>' +
      '<span class="fsb-sep"></span>' +
      '<span class="fsb-lbl">线宽</span><span class="fsb-seg" data-k="strokeWidth" data-opts="1,1.5,2,3,4"></span>' +
      '<span class="fsb-lbl">线型</span><span class="fsb-seg" data-k="strokeDash" data-opts="none|实线,dashed|虚线,dotted|点线"></span>' +
      '<button class="fsb-btn fsb-toggle" data-k="arrow" title="显示/隐藏箭头">➤ 箭头</button>' +
      '<span class="fsb-lbl">字号</span><input type="range" class="fsb-range fsb-range-sm" min="10" max="24" step="1" data-k="fontSize">' +
      '</div>' +
      '<div class="fsb-sec fsb-lane">' +
      '<span class="fsb-lbl">底色</span><span class="fsb-pal" data-k="bodyFill"></span>' +
      '<span class="fsb-lbl">标题栏</span><span class="fsb-pal" data-k="headerFill"></span>' +
      '<span class="fsb-lbl">边框</span><span class="fsb-pal" data-k="stroke"></span>' +
      '<span class="fsb-lbl">标题文字</span><span class="fsb-pal" data-k="titleColor"></span>' +
      '</div>' +
      '<div class="fsb-empty">请先选中图形（节点 / 连线 / 泳道）后再设置样式</div>';
    var pals = styleBarEl.querySelectorAll('.fsb-pal');
    for (var i = 0; i < pals.length; i++) {
      var pal = pals[i];
      STYLE_COLORS.forEach(function (c) {
        var sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'fsb-swatch';
        sw.style.background = c;
        sw.title = c;
        sw.dataset.v = c;
        pal.appendChild(sw);
      });
    }
    var segs = styleBarEl.querySelectorAll('.fsb-seg');
    for (var j = 0; j < segs.length; j++) {
      var seg = segs[j];
      seg.dataset.opts.split(',').forEach(function (opt) {
        var parts = opt.split('|');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fsb-btn fsb-seg-btn';
        b.textContent = parts[1] || parts[0];
        b.dataset.v = parts[0];
        seg.appendChild(b);
      });
    }
    styleBarEl.addEventListener('click', onStyleBarClick);
    styleBarEl.addEventListener('input', onStyleBarInput);
    document.body.appendChild(styleBarEl);
  }

  // 面板当前作用于哪些对象（多选时批量修改节点）
  function panelTargets() {
    if (panelMode === 'node') {
      if (multiSel && multiSel.length) {
        var list = [];
        multiSel.forEach(function (id) { var n = getNode(id); if (n) list.push(n); });
        if (list.length) return { kind: 'node', list: list };
      }
      if (selected && selected.kind === 'node') {
        var n2 = getNode(selected.id);
        if (n2) return { kind: 'node', list: [n2] };
      }
      return null;
    }
    if (panelMode === 'edge') {
      if (selected && selected.kind === 'edge') {
        var e = getEdge(selected.id);
        if (e) return { kind: 'edge', list: [e] };
      }
      return null;
    }
    if (panelMode === 'lane') {
      if (selected && selected.kind === 'lane') {
        var l = getLane(selected.id);
        if (l) return { kind: 'lane', list: [l] };
      }
      return null;
    }
    return null;
  }

  // 把 key/value 应用到所有目标对象（多选批量），同一选中周期只入一次撤销栈
  function applyPanelValue(key, val) {
    var targets = panelTargets();
    if (!targets || !targets.list.length) return;
    if (!panelHistPushed) { pushHistory(); panelHistPushed = true; }
    targets.list.forEach(function (obj) {
      obj.style = obj.style || {};
      obj.style[key] = val;
    });
    onChange();
    render();
  }

  function applyPanelEdit(ctl) {
    var val = ctl.value;
    if (ctl.type === 'checkbox') val = ctl.checked;
    else if (ctl.type === 'range') val = parseFloat(val);
    applyPanelValue(ctl.dataset.k, val);
  }

  // 按钮点击：色块 / 线宽·线型分段按钮 / 加粗·斜体·箭头开关
  function onStyleBarClick(e) {
    var t = e.target;
    if (!t || !t.dataset) return;
    if (t.classList.contains('fsb-swatch')) {
      if (!t.dataset.v) return;
      applyPanelValue(t.parentNode.dataset.k, t.dataset.v);
    } else if (t.classList.contains('fsb-seg-btn')) {
      if (!t.dataset.v) return;
      applyPanelValue(t.parentNode.dataset.k, t.dataset.v);
    } else if (t.classList.contains('fsb-toggle')) {
      var key = t.dataset.k;
      var targets = panelTargets();
      if (!targets || !targets.list.length) return;
      var cur;
      if (panelMode === 'node') cur = effNodeStyle(targets.list[0])[key];
      else if (panelMode === 'edge') cur = effEdgeStyle(targets.list[0])[key];
      else cur = effLaneStyle(targets.list[0])[key];
      applyPanelValue(key, !cur);
    }
  }

  // 滑杆输入：实时应用
  function onStyleBarInput(e) {
    var ctl = e.target;
    if (!ctl || !ctl.dataset || !ctl.dataset.k) return;
    if (ctl.type !== 'range') return;
    applyPanelEdit(ctl);
  }

  function toHexColor(v) {
    if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
    return '#ffffff';
  }
  function clampRange(ctl, v) {
    var num = parseFloat(v);
    if (isNaN(num)) num = parseFloat(ctl.min) || 0;
    return Math.max(parseFloat(ctl.min), Math.min(parseFloat(ctl.max), num));
  }

  // 每次 render() 后同步样式浮层：开关控制显隐、切换分区、高亮当前值
  function syncStyleBar() {
    if (!styleBarEl) return;
    var curKey = '';
    if (multiSel && multiSel.length) curKey = 'm:' + multiSel.slice().sort().join(',');
    else if (selected) curKey = selected.kind + ':' + selected.id;
    if (curKey !== lastPanelSelKey) { lastPanelSelKey = curKey; panelHistPushed = false; }

    panelMode = null;
    if (multiSel && multiSel.length) panelMode = 'node';
    else if (selected && selected.kind === 'node') panelMode = 'node';
    else if (selected && selected.kind === 'edge') panelMode = 'edge';
    else if (selected && selected.kind === 'lane') panelMode = 'lane';

    // 浮层显隐只由右上角按钮控制，选中与否只决定显示哪个分区
    if (!stylePanelOpen) { styleBarEl.style.display = 'none'; return; }
    styleBarEl.style.display = 'flex';

    var secs = styleBarEl.querySelectorAll('.fsb-sec');
    for (var i = 0; i < secs.length; i++) secs[i].style.display = 'none';
    var emptyEl = styleBarEl.querySelector('.fsb-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    if (!panelMode) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    var sec = styleBarEl.querySelector('.fsb-' + panelMode);
    if (!sec) { styleBarEl.style.display = 'flex'; return; }
    var targets = panelTargets();
    if (!targets || !targets.list.length) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    sec.style.display = 'flex';
    // decision 节点隐藏圆角控件
    var rw = sec.querySelector('.fsb-radius-wrap');
    if (rw) rw.style.display = (targets.list[0].type === 'decision') ? 'none' : 'inline-flex';

    var st;
    if (panelMode === 'node') st = effNodeStyle(targets.list[0]);
    else if (panelMode === 'edge') st = effEdgeStyle(targets.list[0]);
    else st = effLaneStyle(targets.list[0]);

    var pals = sec.querySelectorAll('.fsb-pal');
    for (var p = 0; p < pals.length; p++) {
      var pal = pals[p];
      var hex = toHexColor(st[pal.dataset.k]).toLowerCase();
      var sws = pal.querySelectorAll('.fsb-swatch');
      for (var s = 0; s < sws.length; s++) sws[s].classList.toggle('active', sws[s].dataset.v.toLowerCase() === hex);
    }
    var segs = sec.querySelectorAll('.fsb-seg');
    for (var g = 0; g < segs.length; g++) {
      var seg = segs[g];
      var val = String(st[seg.dataset.k]);
      var segBtns = seg.querySelectorAll('.fsb-seg-btn');
      for (var b = 0; b < segBtns.length; b++) segBtns[b].classList.toggle('active', segBtns[b].dataset.v === val);
    }
    var toggles = sec.querySelectorAll('.fsb-toggle');
    for (var tt = 0; tt < toggles.length; tt++) {
      var tgl = toggles[tt];
      tgl.classList.toggle('active', !!st[tgl.dataset.k]);
    }
    var ranges = sec.querySelectorAll('.fsb-range');
    for (var r = 0; r < ranges.length; r++) {
      var ctl = ranges[r];
      ctl.value = String(clampRange(ctl, st[ctl.dataset.k]));
    }
  }

  // 右上角按钮切换样式浮层
  function toggleStylePanel() {
    stylePanelOpen = !stylePanelOpen;
    if (styleBarEl) syncStyleBar();
    return stylePanelOpen;
  }
  function setStylePanelOpen(open) {
    stylePanelOpen = !!open;
    if (styleBarEl) syncStyleBar();
  }

  function isSel(kind, id) {
    return selected && selected.kind === kind && selected.id === id;
  }

  // 节点是否处于选中状态（多选列表 或 单选）
  function isNodeSel(id) {
    if (multiSel && multiSel.indexOf(id) >= 0) return true;
    return isSel('node', id);
  }

  // 根据框选矩形更新多选节点列表（节点矩形与选框相交即选中）
  function updateBoxSelection() {
    if (!boxSel) return;
    var x1 = Math.min(boxSel.sx, boxSel.cx), x2 = Math.max(boxSel.sx, boxSel.cx);
    var y1 = Math.min(boxSel.sy, boxSel.cy), y2 = Math.max(boxSel.sy, boxSel.cy);
    multiSel = [];
    model.nodes.forEach(function (n) {
      var s = nodeSize(n);
      if (n.x + s.w / 2 >= x1 && n.x - s.w / 2 <= x2 &&
          n.y + s.h / 2 >= y1 && n.y - s.h / 2 <= y2) multiSel.push(n.id);
    });
  }

  // 客户端坐标 → SVG 内部坐标（兼容 CSS 缩放）
  function toSvgXY(clientX, clientY) {
    var rect = svg.getBoundingClientRect();
    var sx = rect.width ? (CANVAS_W / rect.width) : 1;
    var sy = rect.height ? (CANVAS_H / rect.height) : 1;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }

  // 几何命中测试：光标位置落在哪个节点形状内部（后绘制的在上层）；与吸附计算使用同一套形状判定
  function nodeAtPoint(clientX, clientY) {
    var p = toSvgXY(clientX, clientY);
    for (var i = model.nodes.length - 1; i >= 0; i--) {
      var n = model.nodes[i];
      if (pointInShape(n, p.x - n.x, p.y - n.y)) return n.id;
    }
    return null;
  }

  function drawLinkPreview() {
    if (!linkDrag || !svg) return;
    var from = getNode(linkDrag.fromId);
    if (!from) return;
    var p = toSvgXY(linkDrag.lastX, linkDrag.lastY);
    var sp = boundaryPoint(from, p.x, p.y);
    var tid = nodeAtPoint(linkDrag.lastX, linkDrag.lastY);
    var tn = tid ? getNode(tid) : null;
    var tp = tn ? boundaryPoint(tn, p.x, p.y) : p;
    var path = edgePath(sp, tp, 'line', linkDrag.fromId, tid);
    if (!linkPreviewEl) {
      linkPreviewEl = el('path', { 'class': 'flow-link-preview', 'pointer-events': 'none', fill: 'none' });
      svg.appendChild(linkPreviewEl);
    }
    linkPreviewEl.setAttribute('d', path.d);
  }

  function hideLinkPreview() {
    if (linkPreviewEl) { linkPreviewEl.remove(); linkPreviewEl = null; }
  }

  // 拖动连线端点重连时的预览线：固定端点（保持已存锚点）→ 鼠标位置（命中节点时吸附到其边界对应点）
  function drawEdgePreview() {
    if (!edgeDrag || !svg) return;
    var edge = getEdge(edgeDrag.id);
    if (!edge) return;
    var fixed = getNode(edgeDrag.side === 'from' ? edge.to : edge.from);
    if (!fixed) return;
    var p = toSvgXY(edgeDrag.lastX, edgeDrag.lastY);
    var fixedAnchor = edgeDrag.side === 'from' ? edge.toAnchor : edge.fromAnchor;
    var sp = fixedAnchor ? anchorPoint(fixed, fixedAnchor) : boundaryPoint(fixed, p.x, p.y);
    var tid = nodeAtPoint(edgeDrag.lastX, edgeDrag.lastY);
    var tn = tid ? getNode(tid) : null;
    var tp = tn ? boundaryPoint(tn, p.x, p.y) : p;
    var path = edgePath(sp, tp, edge.shape, fixed.id, tid);
    if (!edgePreviewEl) {
      edgePreviewEl = el('path', { 'class': 'flow-link-preview', 'pointer-events': 'none', fill: 'none' });
      svg.appendChild(edgePreviewEl);
    }
    edgePreviewEl.setAttribute('d', path.d);
  }

  function hideEdgePreview() {
    if (edgePreviewEl) { edgePreviewEl.remove(); edgePreviewEl = null; }
  }

  /* ---------------- 交互 ---------------- */
  function onMouseDown(e) {
    if (e.button !== 0) return;
    // 命中节点连接点 → 进入拖拽连线
    var port = e.target.closest ? e.target.closest('.flow-port') : null;
    if (port) {
      var pg = port.closest ? port.closest('.flow-node') : null;
      var pnode = pg ? getNode(pg.getAttribute('data-id')) : null;
      if (pnode) {
        linkDrag = { fromId: pnode.id, lastX: e.clientX, lastY: e.clientY };
        selected = { kind: 'node', id: pnode.id };
        multiSel = [pnode.id];
        setHint('按住拖到目标节点上松开创建连线（Esc 取消）');
        e.preventDefault();
        e.stopPropagation();
        drawLinkPreview();
        return;
      }
    }
    var g = e.target.closest('.flow-node');
    if (g) {
      var node = getNode(g.getAttribute('data-id'));
      if (!node) return;
      // 手动双击检测：350ms 内再次按下同一节点 → 直接进入文字编辑（避免 render 重建 DOM 干扰原生 dblclick）
      var now = Date.now();
      if (lastNodeClick && lastNodeClick.id === node.id && now - lastNodeClick.t < 350) {
        lastNodeClick = null;
        e.preventDefault();
        e.stopPropagation();
        editNodeText(node);
        return;
      }
      lastNodeClick = { id: node.id, t: now };
      // 点击未选中的节点：单选该节点；点击已选中的节点：保留整组（用于整组拖动）
      if (multiSel.indexOf(node.id) < 0) {
        multiSel = [node.id];
        selected = { kind: 'node', id: node.id };
        render();
      } else {
        selected = null;
      }
      // 记录整组节点拖动前的位置
      var group = [];
      multiSel.forEach(function (mid) {
        var mn = getNode(mid);
        if (mn) group.push({ id: mn.id, x: mn.x, y: mn.y });
      });
      drag = { id: node.id, startX: e.clientX, startY: e.clientY, orig: group, moved: false };
      e.preventDefault();
      return;
    }
    var ep = e.target.closest('.edge-port');
    if (ep) {
      var egSel = ep.closest('.flow-edge');
      var eid = egSel ? egSel.getAttribute('data-id') : ep.getAttribute('data-edge-id');
      var eside = ep.classList.contains('to') ? 'to' : 'from';
      var eEdge = getEdge(eid);
      if (eEdge) {
        edgeDrag = {
          id: eid, side: eside,
          startX: e.clientX, startY: e.clientY,
          lastX: e.clientX, lastY: e.clientY,
          moved: false
        };
        selected = { kind: 'edge', id: eid };
        multiSel = [];
        setHint('拖动端点重连到目标节点（Esc 取消）');
        e.preventDefault();
        e.stopPropagation();
        render();
        return;
      }
    }
    var eg = e.target.closest('.flow-edge');
    if (eg) {
      var eid2 = eg.getAttribute('data-id');
      var edge2 = getEdge(eid2);
      selected = { kind: 'edge', id: eid2 };
      multiSel = [];
      if (edge2) {
        // 根据按下位置靠近哪个端点（锚点实际位置）决定拖动哪一端
        var sp0 = toSvgXY(e.clientX, e.clientY);
        var a0 = getNode(edge2.from), b0 = getNode(edge2.to);
        var ap0 = a0 ? anchorPoint(a0, edge2.fromAnchor) : null;
        var bp0 = b0 ? anchorPoint(b0, edge2.toAnchor) : null;
        var dp1 = ap0 ? Math.abs(sp0.x - ap0.x) + Math.abs(sp0.y - ap0.y) : Infinity;
        var dp2 = bp0 ? Math.abs(sp0.x - bp0.x) + Math.abs(sp0.y - bp0.y) : Infinity;
        edgeDrag = {
          id: eid2, side: dp2 < dp1 ? 'to' : 'from',
          startX: e.clientX, startY: e.clientY,
          lastX: e.clientX, lastY: e.clientY,
          moved: false
        };
      }
      e.preventDefault();
      render();
      return;
    }
    // 泳道：选中后显示尺寸调整手柄；点击标题/背景可拖动泳道
    var lr = e.target.closest('.flow-lane-resize');
    if (lr) {
      var rl = getLane(lr.closest('.flow-lane').getAttribute('data-id'));
      if (rl) {
        var rAxis = rl.dir === 'v' ? 'v' : 'h';
        laneResize = {
          id: rl.id, axis: rAxis,
          startPos: rAxis === 'v' ? e.clientX : e.clientY,
          origSize: rAxis === 'v' ? rl.w : rl.h, moved: false
        };
        selected = { kind: 'lane', id: rl.id };
        multiSel = [];
        e.preventDefault();
        e.stopPropagation();
        render();
        return;
      }
    }
    var lg = e.target.closest('.flow-lane');
    if (lg) {
      var lane = getLane(lg.getAttribute('data-id'));
      if (!lane) return;
      // 拖动泳道标题栏移动泳道；泳道体内点击选中泳道、按住拖动则框选节点
      var isHeader = !!e.target.closest('.flow-lane-header') || !!e.target.closest('.flow-lane-title');
      if (!isHeader) {
        if (mode === 'link') cancelLink();
        selected = { kind: 'lane', id: lane.id };
        multiSel = [];
        var sp = toSvgXY(e.clientX, e.clientY);
        boxSel = { sx: sp.x, sy: sp.y, cx: sp.x, cy: sp.y, moved: false, onLane: true };
        e.preventDefault();
        e.stopPropagation();
        render();
        return;
      }
      var dAxis = lane.dir === 'v' ? 'v' : 'h';
      // 点击泳道标题文字 → 直接进入重命名（点击标题栏其他空白区域仍为拖动泳道）
      if (e.target.closest('.flow-lane-title')) {
        selected = { kind: 'lane', id: lane.id };
        multiSel = [];
        e.preventDefault();
        e.stopPropagation();
        render();
        editLaneTitle(lane);
        return;
      }
      laneDrag = {
        id: lane.id, axis: dAxis,
        startPos: dAxis === 'v' ? e.clientX : e.clientY,
        origPos: dAxis === 'v' ? lane.x : lane.y,
        moved: false
      };
      // 记录所有泳道拖动前的轴位置，松开时按此区间一次性移动内部节点
      laneOrig = {};
      model.lanes.forEach(function (l) { laneOrig[l.id] = l.dir === 'v' ? l.x : l.y; });
      selected = { kind: 'lane', id: lane.id };
      multiSel = [];
      e.preventDefault();
      e.stopPropagation();
      render();
      return;
    }
    // 空白处：按住拖动框选多个节点；单纯点击则取消选择
    if (mode === 'link') cancelLink();
    var sp2 = toSvgXY(e.clientX, e.clientY);
    boxSel = { sx: sp2.x, sy: sp2.y, cx: sp2.x, cy: sp2.y, moved: false, onLane: false };
    e.preventDefault();
  }

  function onMouseMove(e) {
    // 框选：更新矩形并实时判定选中节点
    if (boxSel) {
      var bp = toSvgXY(e.clientX, e.clientY);
      if (!boxSel.moved && Math.abs(bp.x - boxSel.sx) + Math.abs(bp.y - boxSel.sy) > 4) boxSel.moved = true;
      boxSel.cx = bp.x;
      boxSel.cy = bp.y;
      if (boxSel.moved) updateBoxSelection();
      render();
      return;
    }
    if (linkDrag) {
      linkDrag.lastX = e.clientX;
      linkDrag.lastY = e.clientY;
      drawLinkPreview();
      return;
    }
    if (edgeDrag) {
      var ede = edgeDrag;
      if (!ede.moved && Math.abs(e.clientX - ede.startX) + Math.abs(e.clientY - ede.startY) > 4) {
        ede.moved = true;
      }
      ede.lastX = e.clientX;
      ede.lastY = e.clientY;
      if (ede.moved) drawEdgePreview();
      return;
    }
    if (laneResize) {
      var rl = getLane(laneResize.id);
      if (!rl) { laneResize = null; return; }
      var rIsV = laneResize.axis === 'v';
      var rdp = (rIsV ? e.clientX : e.clientY) - laneResize.startPos;
      if (!laneResize.moved && Math.abs(rdp) > 4) { laneResize.moved = true; pushHistory(); }
      if (laneResize.moved) {
        if (rIsV) {
          rl.w = Math.round(Math.max(80, Math.min(laneResize.origSize + rdp, CANVAS_W - rl.x)));
        } else {
          rl.h = Math.round(Math.max(80, Math.min(laneResize.origSize + rdp, CANVAS_H - rl.y)));
        }
        render();
      }
      return;
    }
    if (laneDrag) {
      var ld = getLane(laneDrag.id);
      if (!ld) { laneDrag = null; return; }
      var lIsV = laneDrag.axis === 'v';
      var ldp = (lIsV ? e.clientX : e.clientY) - laneDrag.startPos;
      if (!laneDrag.moved && Math.abs(ldp) > 4) { laneDrag.moved = true; pushHistory(); }
      if (laneDrag.moved) {
        var maxPos = lIsV ? CANVAS_W - ld.w : CANVAS_H - ld.h;
        var np = Math.round(Math.max(0, Math.min(laneDrag.origPos + ldp, maxPos)));
        if (lIsV) ld.x = np; else ld.y = np;
        // 拖动期间只移动泳道边界，内部节点在松开时按拖动前区间一次性归位
        render();
      }
      return;
    }
    if (!drag) return;
    var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; pushHistory(); }
    if (drag.moved) {
      // 整组移动：所有选中节点一起跟随鼠标
      drag.orig.forEach(function (o) {
        var mn = getNode(o.id);
        if (mn) {
          mn.x = Math.round(o.x + dx);
          mn.y = Math.round(o.y + dy);
        }
      });
      render();
    }
  }

  function onMouseUp(e) {
    // 框选结束：有位移则保留多选结果，否则按点击处理
    if (boxSel) {
      var bs = boxSel;
      boxSel = null;
      if (bs.moved) {
        selected = null;
        if (multiSel.length) setHint('已选中 ' + multiSel.length + ' 个节点，拖动任意一个可整组移动（Delete 删除）');
        else setHint(DEFAULT_HINT);
      } else if (!bs.onLane) {
        selected = null;
        multiSel = [];
      }
      render();
      return;
    }
    if (linkDrag) {
      var ld = linkDrag;
      linkDrag = null;
      hideLinkPreview();
      var toId = nodeAtPoint(e.clientX, e.clientY);
      if (toId && toId !== ld.fromId) {
        pushHistory();
        var mp = toSvgXY(e.clientX, e.clientY);
        var fn = getNode(ld.fromId), tn = getNode(toId);
        model.edges.push({
          id: uid('e'), from: ld.fromId, to: toId,
          fromAnchor: fn ? anchorFor(fn, mp.x, mp.y) : null,
          toAnchor: tn ? anchorFor(tn, mp.x, mp.y) : null
        });
        selected = { kind: 'edge', id: model.edges[model.edges.length - 1].id };
        multiSel = [];
        onChange();
        setHint('已创建连线，可继续从节点边缘拖出连线');
      } else {
        setHint(DEFAULT_HINT);
      }
      render();
      return;
    }
    if (edgeDrag) {
      var ede2 = edgeDrag;
      edgeDrag = null;
      hideEdgePreview();
      if (ede2.moved) {
        var edge3 = getEdge(ede2.id);
        if (edge3) {
          var nid3 = nodeAtPoint(e.clientX, e.clientY);
          var isFrom = ede2.side === 'from';
          var otherEnd = isFrom ? edge3.to : edge3.from;
          // 允许拖到其它节点重连，也允许在同一个节点上调整端点吸附位置
          if (nid3 && nid3 !== otherEnd) {
            pushHistory();
            var mp3 = toSvgXY(e.clientX, e.clientY);
            var nd3 = getNode(nid3);
            if (isFrom) {
              edge3.from = nid3;
              edge3.fromAnchor = nd3 ? anchorFor(nd3, mp3.x, mp3.y) : edge3.fromAnchor;
            } else {
              edge3.to = nid3;
              edge3.toAnchor = nd3 ? anchorFor(nd3, mp3.x, mp3.y) : edge3.toAnchor;
            }
            onChange();
            setHint('已重连连线端点');
          }
        }
      }
      render();
      return;
    }
    if (laneResize) {
      if (laneResize.moved) { fixOverlaps(); onChange(); }
      laneResize = null;
      render();
      return;
    }
    if (laneDrag) {
      if (laneDrag.moved) { fixOverlaps(); onChange(); }
      laneDrag = null;
      laneOrig = {};
      render();
      return;
    }
    if (!drag) return;
    var node = getNode(drag.id);
    if (drag.moved) {
      onChange();
    } else if (node) {
      // 视为点击
      if (mode === 'link') {
        if (!linkFrom) {
          linkFrom = node.id;
          setHint('已选起点「' + node.text + '」，再点击终点节点（Esc 取消）');
        } else if (linkFrom !== node.id) {
          pushHistory();
          model.edges.push({ id: uid('e'), from: linkFrom, to: node.id });
          cancelLink();
          onChange();
        }
      } else {
        // 点击已在多选组中的节点保持整组，否则单选
        if (multiSel.indexOf(node.id) < 0) {
          selected = { kind: 'node', id: node.id };
          multiSel = [node.id];
        } else {
          selected = null;
        }
      }
      render();
    }
    drag = null;
  }

  function onDblClick(e) {
    var g = e.target.closest('.flow-node');
    if (g) {
      var node = getNode(g.getAttribute('data-id'));
      if (node) editNodeText(node);
      return;
    }
    var lg = e.target.closest('.flow-lane-header') || e.target.closest('.flow-lane-title');
    if (lg) {
      var lane = getLane(lg.closest('.flow-lane').getAttribute('data-id'));
      if (lane) {
        selected = { kind: 'lane', id: lane.id };
        multiSel = [];
        editLaneTitle(lane);
      }
    }
  }

  function onKey(e) {
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'Escape') {
      if (linkDrag) { linkDrag = null; hideLinkPreview(); render(); }
      else if (edgeDrag) { edgeDrag = null; hideEdgePreview(); render(); }
      else if (mode === 'link') { cancelLink(); render(); }
      else if (boxSel) { boxSel = null; render(); }
      else if (selected || multiSel.length) { selected = null; multiSel = []; render(); }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && (selected || multiSel.length)) {
      e.preventDefault();
      deleteSelected();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      e.stopPropagation();
      undo();
    }
  }

  function editNodeText(node) {
    if (container.querySelector('.node-edit-input')) return;
    var s = nodeSize(node);
    var input = document.createElement('input');
    input.className = 'node-edit-input';
    input.value = node.text || '';
    input.style.left = (node.x - s.w / 2) + 'px';
    input.style.top = (node.y - s.h / 2) + 'px';
    input.style.width = s.w + 'px';
    input.style.height = s.h + 'px';
    container.appendChild(input);
    input.focus();
    input.select();

    var done = false;
    function cleanupOutside() {
      if (input._outsideHandler) {
        container.removeEventListener('mousedown', input._outsideHandler, true);
        input._outsideHandler = null;
      }
    }
    function commit(save) {
      if (done) return;
      done = true;
      if (save) {
        var v = input.value.trim();
        if (v && v !== node.text) { pushHistory(); node.text = v; onChange(); }
      }
      cleanupOutside();
      input.remove();
      render();
    }
    function onOutside(e) {
      if (e.target === input) return;
      e.preventDefault();
      e.stopPropagation();
      commit(true);
    }
    input._outsideHandler = onOutside;
    container.addEventListener('mousedown', onOutside, true);
    input.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') commit(true);
      else if (ev.key === 'Escape') commit(false);
      ev.stopPropagation();
    });
    input.addEventListener('blur', function () { commit(true); });
  }

  function editLaneTitle(lane) {
    if (container.querySelector('.node-edit-input')) return;
    var input = document.createElement('input');
    input.className = 'node-edit-input';
    input.value = lane.title || '';
    if (lane.dir === 'v') {
      input.style.left = (lane.x + 8) + 'px';
      input.style.top = '8px';
      input.style.width = (lane.w - 16) + 'px';
      input.style.height = '30px';
    } else {
      input.style.left = '8px';
      input.style.top = (lane.y + lane.h / 2 - 13) + 'px';
      input.style.width = (LANE_HEADER_W - 16) + 'px';
      input.style.height = '26px';
    }
    container.appendChild(input);
    input.focus();
    input.select();

    var done = false;
    function cleanupOutside() {
      if (input._outsideHandler) {
        container.removeEventListener('mousedown', input._outsideHandler, true);
        input._outsideHandler = null;
      }
    }
    function commit(save) {
      if (done) return;
      done = true;
      if (save) {
        var v = input.value.trim();
        if (v && v !== lane.title) { pushHistory(); lane.title = v; onChange(); }
      }
      cleanupOutside();
      input.remove();
      render();
    }
    function onOutside(e) {
      if (e.target === input) return;
      e.preventDefault();
      e.stopPropagation();
      commit(true);
    }
    input._outsideHandler = onOutside;
    container.addEventListener('mousedown', onOutside, true);
    input.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') commit(true);
      else if (ev.key === 'Escape') commit(false);
      ev.stopPropagation();
    });
    input.addEventListener('blur', function () { commit(true); });
  }

  function deleteSelected() {
    if (linkDrag) { linkDrag = null; hideLinkPreview(); }
    if (edgeDrag) { edgeDrag = null; hideEdgePreview(); }
    if (laneDrag) laneDrag = null;
    if (laneResize) laneResize = null;
    if (boxSel) boxSel = null;
    if (!selected && !multiSel.length) { setHint('先点击选中一个节点、连线或泳道'); return; }
    pushHistory();
    if (multiSel.length) {
      // 批量删除多选节点，并清理相关连线
      var ids = multiSel.slice();
      model.nodes = model.nodes.filter(function (n) { return ids.indexOf(n.id) < 0; });
      model.edges = model.edges.filter(function (e) { return ids.indexOf(e.from) < 0 && ids.indexOf(e.to) < 0; });
      multiSel = [];
      selected = null;
    } else if (selected.kind === 'node') {
      var id = selected.id;
      model.nodes = model.nodes.filter(function (n) { return n.id !== id; });
      model.edges = model.edges.filter(function (e) { return e.from !== id && e.to !== id; });
    } else if (selected.kind === 'lane') {
      var lid = selected.id;
      var lane = getLane(lid);
      var gone = {};
      model.lanes = model.lanes.filter(function (l) { return l.id !== lid; });
      if (lane) {
        var isV = lane.dir === 'v';
        var base = isV ? lane.x : lane.y;
        var span = isV ? lane.w : lane.h;
        model.nodes = model.nodes.filter(function (n) {
          var p = isV ? n.x : n.y;
          if (p >= base && p < base + span) { gone[n.id] = true; return false; }
          return true;
        });
      }
      model.edges = model.edges.filter(function (e) { return !gone[e.from] && !gone[e.to]; });
    } else {
      model.edges = model.edges.filter(function (e) { return e.id !== selected.id; });
    }
    selected = null;
    onChange();
    render();
  }

  function cancelLink() {
    mode = 'select';
    linkFrom = null;
    setHint(DEFAULT_HINT);
    if (linkBtnEl) linkBtnEl.classList.remove('active');
  }

  function setHint(text) {
    if (hintEl) hintEl.textContent = text;
  }

  function addNode(type) {
    var labels = { start: '开始', process: '步骤', decision: '判断', end: '结束' };
    // 放到当前可视区域中心附近
    var cx = (container ? container.scrollLeft + container.clientWidth / 2 : 300);
    var cy = (container ? container.scrollTop + container.clientHeight / 2 : 300);
    var node = { id: uid('n'), type: type, x: Math.round(cx), y: Math.round(cy), text: labels[type] || '节点' };
    pushHistory();
    model.nodes.push(node);
    selected = { kind: 'node', id: node.id };
    multiSel = [node.id];
    onChange();
    render();
    editNodeText(node);
  }

  function addLane(dir) {
    var isV = dir === 'v';
    var maxPos = 0;
    model.lanes.forEach(function (l) {
      var same = (l.dir === 'v') === isV;
      if (same) maxPos = Math.max(maxPos, (isV ? l.x + l.w : l.y + l.h));
    });
    var lane;
    if (isV) {
      lane = { id: uid('l'), title: '泳道 ' + (model.lanes.length + 1), dir: 'v', x: maxPos, w: 200 };
    } else {
      lane = { id: uid('l'), title: '泳道 ' + (model.lanes.length + 1), y: maxPos, h: 200 };
    }
    pushHistory();
    model.lanes.push(lane);
    selected = { kind: 'lane', id: lane.id };
    multiSel = [];
    onChange();
    render();
    editLaneTitle(lane);
  }

  // 双泳道：一次添加一对相邻的水平泳道
  function addLanePair() {
    var bottom = 0;
    model.lanes.forEach(function (l) {
      if (l.dir !== 'v') bottom = Math.max(bottom, l.y + l.h);
    });
    var a = { id: uid('l'), title: '泳道 ' + (model.lanes.length + 1), y: bottom, h: 160 };
    var b = { id: uid('l'), title: '泳道 ' + (model.lanes.length + 2), y: bottom + 160, h: 160 };
    pushHistory();
    model.lanes.push(a, b);
    selected = { kind: 'lane', id: b.id };
    multiSel = [];
    onChange();
    render();
    setHint('已添加一对泳道，可点击标题重命名');
  }

  // 分割线：把选中的泳道沿中线一分为二（横向按 y、纵向按 x）
  function splitLane() {
    if (!selected || selected.kind !== 'lane') {
      setHint('先点击选中一个泳道，再点「分割线」');
      return;
    }
    var lane = getLane(selected.id);
    if (!lane) return;
    var isV = lane.dir === 'v';
    var span = isV ? lane.w : lane.h;
    if (span < 160) { setHint('泳道太窄，无法分割'); return; }
    var half = Math.floor(span / 2);
    var base = isV ? lane.x : lane.y;
    var baseTitle = lane.title || '';
    var a, b;
    if (isV) {
      a = { id: uid('l'), title: baseTitle, dir: 'v', x: base, w: half };
      b = { id: uid('l'), title: baseTitle ? baseTitle + ' 2' : '', dir: 'v', x: base + half, w: span - half };
    } else {
      a = { id: uid('l'), title: baseTitle, y: base, h: half };
      b = { id: uid('l'), title: baseTitle ? baseTitle + ' 2' : '', y: base + half, h: span - half };
    }
    var idx = model.lanes.indexOf(lane);
    pushHistory();
    model.lanes.splice(idx, 1, a, b);
    selected = { kind: 'lane', id: b.id };
    multiSel = [];
    onChange();
    render();
    setHint('已分割为两个泳道');
  }

  /* ---------------- 工具栏 ---------------- */
  // 切换选中连线的形状：直线/曲线/直角折线
  function setEdgeShape(shape) {
    if (!selected || selected.kind !== 'edge') {
      setHint('先点击选中一条连线，再切换形状');
      return;
    }
    var edge = getEdge(selected.id);
    if (!edge || edge.shape === shape) return;
    pushHistory();
    edge.shape = shape;
    onChange();
    render();
    var names = { line: '直线', curve: '曲线', orth: '折线' };
    setHint('已切换为' + (names[shape] || shape));
  }

  // 按当前选中连线的形状同步高亮工具栏形状按钮
  function syncShapeBtns() {
    if (!shapeBtns) return;
    var cur = (selected && selected.kind === 'edge') ? (getEdge(selected.id) || {}).shape : null;
    shapeBtns.line.classList.toggle('active', cur === 'line');
    shapeBtns.curve.classList.toggle('active', cur === 'curve');
    shapeBtns.orth.classList.toggle('active', cur === 'orth');
  }

  function renderToolbar(bar) {
    bar.innerHTML = '';
    function btn(label, title, fn) {
      var b = document.createElement('button');
      b.className = 'tool-btn';
      b.innerHTML = label;
      b.title = title;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    }
    btn('＋ 开始/结束', '添加圆角矩形节点', function () { addNode('start'); });
    btn('▭ 过程', '添加矩形节点', function () { addNode('process'); });
    btn('◇ 判断', '添加菱形节点', function () { addNode('decision'); });
    btn('▨ 水平泳道', '添加水平泳道，点击标题可重命名', function () { addLane('h'); });
    btn('▤ 纵向泳道', '添加纵向泳道，点击标题可重命名', function () { addLane('v'); });
    btn('▨▨ 双泳道', '一次添加一对相邻的水平泳道', addLanePair);
    btn('┅ 分割线', '把选中的泳道沿中线分割成两个', splitLane);
    var linkBtn = btn('🔗 连线', '依次点击起点和终点节点', function () {
      if (mode === 'link') { cancelLink(); render(); return; }
      mode = 'link';
      linkFrom = null;
      linkBtn.classList.add('active');
      setHint('连线模式：点击起点节点');
    });
    linkBtnEl = linkBtn;
    shapeBtns = {
      line: btn('─ 直线', '将选中的连线设为直线', function () { setEdgeShape('line'); }),
      curve: btn('⌒ 曲线', '将选中的连线设为曲线', function () { setEdgeShape('curve'); }),
      orth: btn('┐ 折线', '将选中的连线设为直角折线', function () { setEdgeShape('orth'); })
    };
    btn('✎ 重命名', '重命名选中的泳道（也可点击泳道标题）', function () {
      if (!selected || selected.kind !== 'lane') { setHint('先点击选中一个泳道，再点「重命名」'); return; }
      var lane = getLane(selected.id);
      if (lane) editLaneTitle(lane);
    });
    btn('🗑 删除', '删除选中的节点、连线或泳道（Delete 键）', deleteSelected);
    hintEl = document.createElement('span');
    hintEl.className = 'vt-hint';
    hintEl.textContent = DEFAULT_HINT;
    bar.appendChild(hintEl);
  }

  /* ---------------- 生命周期 ---------------- */
  function init(el_, data, changeCb) {
    container = el_;
    model = data;
    if (!model.lanes) model.lanes = []; // 兼容旧文档（无泳道字段）
    model.lanes.forEach(function (l) {
      l.dir = l.dir || 'h'; // 兼容旧文档：默认水平泳道
      if (l.dir === 'v') {
        if (l.x == null) l.x = 0;
        if (l.w == null) l.w = 200;
      } else {
        if (l.y == null) l.y = 0;
        if (l.h == null) l.h = 200;
      }
    });
    model.edges.forEach(function (e) {
      if (!e.shape) e.shape = 'line'; // 兼容旧文档：默认直线
    });
    onChange = changeCb;
    selected = null;
    multiSel = [];
    boxSel = null;
    mode = 'select';
    linkFrom = null;
    linkDrag = null;
    edgeDrag = null;
    laneDrag = null;
    laneResize = null;
    hideLinkPreview();
    container.innerHTML = '';
    svg = el('svg', { width: CANVAS_W, height: CANVAS_H, 'class': 'flow-svg' });
    container.appendChild(svg);
    buildStyleBar();

    svg.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('dblclick', onDblClick);
    keyHandler = onKey;
    document.addEventListener('keydown', keyHandler);
    undoStack = [];
    render();
  }

  function destroy() {
    linkDrag = null;
    edgeDrag = null;
    laneDrag = null;
    laneResize = null;
    boxSel = null;
    hideLinkPreview();
    hideEdgePreview();
    if (svg) {
      svg.removeEventListener('mousedown', onMouseDown);
      svg.removeEventListener('dblclick', onDblClick);
    }
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    if (styleBarEl) {
      styleBarEl.parentNode.removeChild(styleBarEl);
      styleBarEl = null;
    }
    stylePanelOpen = false;
    undoStack = [];
    container = null;
    svg = null;
    model = null;
  }

  function count(m) {
    var lanes = m.lanes ? m.lanes.length : 0;
    return m.nodes.length + ' 节点 · ' + m.edges.length + ' 连线' +
      (lanes ? ' · ' + lanes + ' 泳道' : '');
  }

  return {
    init: init,
    destroy: destroy,
    renderToolbar: renderToolbar,
    defaultModel: defaultModel,
    count: count,
    toggleStylePanel: toggleStylePanel,
    setStylePanelOpen: setStylePanelOpen
  };
})();

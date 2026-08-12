/* =========================================================
 * InkpadMd —— Markdown 渲染 + 代码高亮 + 数学公式 + 标注
 *          + 图标(:icon-name:) + 自动目录(TOC)
 * 底层：marked（GFM）、highlight.js、KaTeX、mermaid
 * ========================================================= */
window.InkpadMd = (function () {
  'use strict';

  marked.setOptions({ gfm: true, breaks: false });

  var mermaidSeq = 0;

  // 渲染 markdown 文本 → 已后处理的 DOM（mermaid / math 留占位，异步补）
  function parse(text) {
    var html = marked.parse(text || '');
    var wrap = document.createElement('div');
    wrap.innerHTML = html;

    // mermaid 代码块 → 占位，保存源码到 data-code
    wrap.querySelectorAll('pre > code.language-mermaid').forEach(function (code) {
      var pre = code.parentElement;
      var ph = document.createElement('div');
      ph.className = 'md-mermaid';
      ph.setAttribute('data-code', code.textContent || '');
      ph.textContent = '渲染中…';
      pre.replaceWith(ph);
    });

    // 数学公式块：```math / ```latex
    wrap.querySelectorAll('pre > code.language-math, pre > code.language-latex').forEach(function (code) {
      var pre = code.parentElement;
      var ph = document.createElement('div');
      ph.className = 'md-math';
      ph.setAttribute('data-code', code.textContent || '');
      ph.textContent = '渲染中…';
      pre.replaceWith(ph);
    });

    return wrap;
  }

  // 标注 callout：> [!NOTE] 等 GitHub 语法
  function processCallouts(root) {
    var quotes = root.querySelectorAll('blockquote');
    Array.prototype.forEach.call(quotes, function (bq) {
      var ps = bq.querySelectorAll(':scope > p');
      var label = null;
      for (var i = 0; i < ps.length; i++) {
        var txt = ps[i].textContent;
        var m = txt.match(/^\[!\s*(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|QUOTE)\s*\](\s*:?\s*)?/i);
        if (m) {
          label = m[1].toLowerCase();
          ps[i].textContent = txt.replace(/^\[!\s*(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|QUOTE)\s*\](\s*:?\s*)?/, '');
          if (!ps[i].textContent.trim()) ps[i].parentNode.removeChild(ps[i]);
          break;
        }
      }
      if (label) {
        bq.classList.add('md-callout', 'md-callout-' + label);
        bq.setAttribute('data-callout', label);
      }
    });
  }

  // 图标：:icon-name: → 内联 SVG
  function processIcons(root) {
    if (typeof InkpadIcons === 'undefined') return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node, list = [];
    while ((node = walker.nextNode())) {
      if (/:icon-[\w-]+:/.test(node.nodeValue)) list.push(node);
    }
    list.forEach(function (node) {
      var parts = node.nodeValue.split(/(:icon-[\w-]+:)/g);
      var parent = node.parentNode;
      var frag = document.createDocumentFragment();
      parts.forEach(function (p) {
        var m = p.match(/^:icon-([\w-]+):$/);
        if (m) {
          var tmp = document.createElement('span');
          tmp.innerHTML = InkpadIcons.svg(m[1]);
          while (tmp.firstChild) frag.appendChild(tmp.firstChild);
        } else if (p) {
          frag.appendChild(document.createTextNode(p));
        }
      });
      parent.replaceChild(frag, node);
    });
  }

  // 行内公式：$...$
  function processInlineMath(root) {
    if (typeof katex === 'undefined') return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node, list = [];
    while ((node = walker.nextNode())) {
      if (node.parentNode && node.parentNode.closest && node.parentNode.closest('pre, code, .md-math')) continue;
      if (/\$[^$\n]+?\$/.test(node.nodeValue)) list.push(node);
    }
    list.forEach(function (node) {
      var parts = node.nodeValue.split(/(\$[^$\n]+?\$)/g);
      var parent = node.parentNode;
      var frag = document.createDocumentFragment();
      parts.forEach(function (p) {
        var m = p.match(/^\$([^$\n]+?)\$$/);
        if (m) {
          try {
            var span = document.createElement('span');
            span.innerHTML = katex.renderToString(m[1], { throwOnError: false, displayMode: false });
            while (span.firstChild) frag.appendChild(span.firstChild);
          } catch (e) { frag.appendChild(document.createTextNode(p)); }
        } else if (p) {
          frag.appendChild(document.createTextNode(p));
        }
      });
      parent.replaceChild(frag, node);
    });
  }

  // 代码块语法高亮（highlight.js）
  function highlightCode(wrap) {
    if (typeof hljs === 'undefined') return;
    var blocks = wrap.querySelectorAll('pre > code');
    Array.prototype.forEach.call(blocks, function (code) {
      var m = (code.className || '').match(/language-([\w-]+)/);
      if (!m) return;
      var lang = m[1];
      if (lang === 'text' || lang === 'plaintext' || lang === 'mermaid' || lang === 'math' || lang === 'latex') return;
      try { hljs.highlightElement(code); } catch (e) {}
    });
  }

  // 自动目录（基于 h1-h3）
  function buildToc(wrap) {
    var heads = wrap.querySelectorAll('h1, h2, h3');
    if (!heads.length) return null;
    var toc = document.createElement('div');
    toc.className = 'md-toc';
    var ul = document.createElement('ul');
    Array.prototype.forEach.call(heads, function (h, i) {
      if (!h.id) {
        h.id = 'toc-' + i + '-' + (h.textContent || '').replace(/[^\w一-龥-]+/g, '-').slice(0, 24);
      }
      var li = document.createElement('li');
      li.className = 'md-toc-' + h.tagName.toLowerCase();
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      ul.appendChild(li);
    });
    var title = document.createElement('div');
    title.className = 'md-toc-title';
    title.textContent = '📑 目录';
    toc.appendChild(title);
    toc.appendChild(ul);
    return toc;
  }

  function replaceTocPlaceholder(root, toc) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node, found = null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf('[TOC]') !== -1) { found = node; break; }
    }
    if (!found) return false;
    var parent = found.parentNode;
    var parts = found.nodeValue.split('[TOC]');
    var before = document.createTextNode(parts[0] || '');
    var after = document.createTextNode(parts[1] || '');
    parent.insertBefore(before, found);
    parent.insertBefore(toc, found);
    parent.insertBefore(after, found);
    parent.removeChild(found);
    return true;
  }

  // 渲染并挂载到容器；mermaid / math 块异步补渲染
  function renderInto(container, text) {
    var wrap = parse(text);
    container.innerHTML = '';
    container.appendChild(wrap);

    var seq = ++mermaidSeq;

    processCallouts(container);
    processIcons(container);
    processInlineMath(container);
    highlightCode(container);
    linkifyHeadings(container);  // v0.20.13：补 heading id 并改写手写 TOC 锚点（marked v12 默认不带 id，导致目录点击不跳转）

    var toc = buildToc(container);
    if (toc) replaceTocPlaceholder(container, toc);

    bindMdAnchorClick(container);

    // 异步渲染 mermaid
    var idxM = 0;
    var mermaids = container.querySelectorAll('.md-mermaid');
    Array.prototype.forEach.call(mermaids, function (ph) {
      var code = ph.getAttribute('data-code') || '';
      if (!code.trim()) { ph.textContent = '（空 Mermaid 代码块）'; return; }
      mermaid.render('mdm-' + seq + '-' + (idxM++), code)
        .then(function (res) {
          if (seq !== mermaidSeq) return;
          ph.innerHTML = res.svg;
        })
        .catch(function (err) {
          if (seq !== mermaidSeq) return;
          ph.className = 'md-mermaid md-mermaid-error';
          ph.textContent = '图表渲染失败：' + (err && err.message ? err.message : err);
        });
    });

    // 异步渲染数学公式（块级）
    var maths = container.querySelectorAll('.md-math');
    Array.prototype.forEach.call(maths, function (ph) {
      var code = ph.getAttribute('data-code') || '';
      if (!code.trim()) { ph.textContent = '（空公式块）'; return; }
      if (typeof katex === 'undefined') { ph.textContent = code; return; }
      try {
        ph.innerHTML = katex.renderToString(code, { throwOnError: false, displayMode: true });
      } catch (e) {
        ph.className = 'md-math md-math-error';
        ph.textContent = '公式渲染失败：' + (e && e.message ? e.message : e);
      }
    });
  }

  // v0.20.13：给 heading 补 id，并把所有 <a href="#xxx"> 改写到正确的锚点（marked v12 默认不生成 heading id，手写目录点击不跳转的根因）
  function mdSlug(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\w\s一-鿿-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function linkifyHeadings(container) {
    var heads = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    var bySlug = Object.create(null);
    Array.prototype.forEach.call(heads, function (h, i) {
      var raw = (h.textContent || '').trim();
      var id = 'md-h-' + i;
      h.id = id;
      var slug = mdSlug(raw);
      if (slug && !bySlug[slug]) bySlug[slug] = id;
    });
    var links = container.querySelectorAll('a[href^="#"]');
    Array.prototype.forEach.call(links, function (a) {
      var raw = a.getAttribute('href') || '';
      if (!raw || raw === '#') return;
      var slug;
      try { slug = decodeURIComponent(raw.slice(1)).trim(); } catch (e) { slug = raw.slice(1).trim(); }
      if (!slug) return;
      var id = bySlug[mdSlug(slug)];
      if (id) a.setAttribute('href', '#' + id);
    });
  }

  // v0.20.13：preview 容器锚点 click 委托（一次性绑定，处理任意时刻点击 anchor 都生效）
  function bindMdAnchorClick(container) {
    if (!container || container.__mdClickBound) return;
    container.__mdClickBound = true;
    container.addEventListener('click', function (ev) {
      var n = ev.target;
      while (n && n !== container) {
        if (n.tagName === 'A') break;
        n = n.parentNode;
      }
      if (!n || n === container) return;
      var href = n.getAttribute && n.getAttribute('href');
      if (!href || href.charAt(0) !== '#' || href.length < 2) return;
      var id = href.slice(1);
      var target = container.querySelector('#' + CSS.escape(id));
      if (!target) return;
      ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e) { target.scrollIntoView(); }
    });
  }

  return { parse: parse, renderInto: renderInto };
})();

/* =========================================================
 * InkpadExporter —— 流程图 / 思维导图多格式导出
 * 纯本地实现：SVG / PNG / JPG / 高清PDF / Word / PPT /
 *             Markdown / CSV / FreeMind(.mm) / XMind(.xmind)
 * ========================================================= */
(function (global) {
  'use strict';

  /* ================= 基础工具 ================= */
  function strToU8(s) { return new TextEncoder().encode(s); }

  function u8ToBase64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function concatU8(parts) {
    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total);
    var off = 0;
    parts.forEach(function (p) { out.set(p, off); off += p.length; });
    return out;
  }

  function xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function csvEscape(s) {
    s = String(s == null ? '' : s);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /* ================= 极简 ZIP（STORE 无压缩，Office/XMind 均可读取） ================= */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // entries: [{ name: 'path/in/zip', data: Uint8Array }]
  function zipStore(entries) {
    var chunks = [];
    var central = [];
    var offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate());

    entries.forEach(function (f) {
      var nameU8 = strToU8(f.name);
      var crc = crc32(f.data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);          // version needed
      lh.setUint16(6, 0x0800, true);      // UTF-8 文件名
      lh.setUint16(8, 0, true);           // STORE
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, f.data.length, true);
      lh.setUint32(22, f.data.length, true);
      lh.setUint16(26, nameU8.length, true);
      lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), nameU8, f.data);
      central.push({ nameU8: nameU8, crc: crc, size: f.data.length, offset: offset });
      offset += 30 + nameU8.length + f.data.length;
    });

    var cdStart = offset;
    central.forEach(function (c) {
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, c.crc, true);
      ch.setUint32(20, c.size, true);
      ch.setUint32(24, c.size, true);
      ch.setUint16(28, c.nameU8.length, true);
      ch.setUint32(42, c.offset, true);
      chunks.push(new Uint8Array(ch.buffer), c.nameU8);
      offset += 46 + c.nameU8.length;
    });

    var cdSize = offset - cdStart;
    var eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true);
    eo.setUint16(8, central.length, true);
    eo.setUint16(10, central.length, true);
    eo.setUint32(12, cdSize, true);
    eo.setUint32(16, cdStart, true);
    chunks.push(new Uint8Array(eo.buffer));

    return concatU8(chunks);
  }

  /* ================= SVG 导出 ================= */
  var INLINE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size',
    'font-family', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'opacity'];

  // 克隆画布 SVG，裁剪到内容范围，并把 CSS 类样式内联（否则脱离页面后样式丢失）
  function buildStandaloneSvg(srcSvg, margin) {
    margin = margin == null ? 40 : margin;
    var bbox = srcSvg.getBBox();
    var x = bbox.x - margin, y = bbox.y - margin;
    var w = bbox.width + margin * 2, h = bbox.height + margin * 2;

    var clone = srcSvg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', x + ' ' + y + ' ' + w + ' ' + h);
    clone.setAttribute('width', Math.round(w));
    clone.setAttribute('height', Math.round(h));

    var srcEls = srcSvg.querySelectorAll('*');
    var cloneEls = clone.querySelectorAll('*');
    for (var i = 0; i < srcEls.length; i++) {
      var cs = getComputedStyle(srcEls[i]);
      var st = '';
      INLINE_PROPS.forEach(function (p) {
        var v = cs.getPropertyValue(p);
        if (v) st += p + ':' + v + ';';
      });
      cloneEls[i].setAttribute('style', st);
    }
    return { svg: clone, width: Math.round(w), height: Math.round(h) };
  }

  function exportSvgText(srcSvg) {
    var built = buildStandaloneSvg(srcSvg);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      new XMLSerializer().serializeToString(built.svg);
  }

  /* ================= 位图（PNG / JPG） ================= */
  function rasterize(srcSvg, scale, format) {
    return new Promise(function (resolve, reject) {
      var built = buildStandaloneSvg(srcSvg);
      var str = new XMLSerializer().serializeToString(built.svg);
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(built.width * scale));
          canvas.height = Math.max(1, Math.round(built.height * scale));
          var ctx = canvas.getContext('2d');
          if (format === 'jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('位图生成失败')); return; }
            blob.arrayBuffer().then(function (ab) {
              resolve({ data: new Uint8Array(ab), width: canvas.width, height: canvas.height });
            });
          }, 'image/' + format, 0.95);
        } catch (err) { reject(err); }
      };
      img.onerror = function () { reject(new Error('SVG 渲染失败')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    });
  }

  /* ================= 高清 PDF（内嵌 JPEG，单页 A4 适配） ================= */
  function makePdf(jpegU8, imgW, imgH) {
    var landscape = imgW > imgH;
    var pw = landscape ? 842 : 595;
    var ph = landscape ? 595 : 842;
    var margin = 28;
    var scale = Math.min((pw - margin * 2) / imgW, (ph - margin * 2) / imgH);
    var w = Math.round(imgW * scale * 100) / 100;
    var h = Math.round(imgH * scale * 100) / 100;
    var ox = Math.round((pw - w) / 2 * 100) / 100;
    var oy = Math.round((ph - h) / 2 * 100) / 100;

    var content = 'q\n' + w + ' 0 0 ' + h + ' ' + ox + ' ' + oy + ' cm\n/Im0 Do\nQ\n';

    var parts = [];   // Uint8Array 片段
    var offsets = []; // 每个对象的起始字节
    var pos = 0;
    function push(u8) { parts.push(u8); pos += u8.length; }
    function pushStr(s) { push(strToU8(s)); }
    function beginObj() { offsets.push(pos); }

    pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    beginObj();
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    beginObj();
    pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    beginObj();
    pushStr('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] ' +
      '/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n');

    beginObj();
    pushStr('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + imgW + ' /Height ' + imgH +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegU8.length + ' >>\nstream\n');
    push(jpegU8);
    pushStr('\nendstream\nendobj\n');

    beginObj();
    pushStr('5 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');

    var xrefPos = pos;
    var count = 6; // 0~5
    var xref = 'xref\n0 ' + count + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) {
      xref += ('0000000000' + o).slice(-10) + ' 00000 n \n';
    });
    pushStr(xref);
    pushStr('trailer\n<< /Size ' + count + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF');

    return concatU8(parts);
  }

  /* ================= Word (.docx，嵌入 PNG) ================= */
  function makeDocx(pngU8, imgW, imgH) {
    // 页面可用宽度约 6 英寸 = 5486400 EMU，超出则等比缩小
    var maxCx = 5486400;
    var cx = imgW * 9525;
    var cy = imgH * 9525;
    if (cx > maxCx) { cy = Math.round(cy * maxCx / cx); cx = maxCx; }

    var documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<w:body><w:p><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="1" name="image"/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic>' +
      '<pic:nvPicPr><pic:cNvPr id="0" name="image.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic>' +
      '</wp:inline></w:drawing></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>';

    return zipStore([
      { name: '[Content_Types].xml', data: strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>') },
      { name: '_rels/.rels', data: strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>') },
      { name: 'word/document.xml', data: strToU8(documentXml) },
      { name: 'word/_rels/document.xml.rels', data: strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>' +
        '</Relationships>') },
      { name: 'word/media/image1.png', data: pngU8 }
    ]);
  }

  /* ================= PPT (.pptx，16:9 单页嵌入 PNG) ================= */
  function makePptx(pngU8, imgW, imgH) {
    var slideW = 12192000, slideH = 6858000; // 16:9 EMU
    var marginEmu = 457200; // 0.5 英寸
    var maxW = slideW - marginEmu * 2, maxH = slideH - marginEmu * 2;
    var cx = imgW * 9525, cy = imgH * 9525;
    var k = Math.min(maxW / cx, maxH / cy, 1);
    cx = Math.round(cx * k); cy = Math.round(cy * k);
    var offX = Math.round((slideW - cx) / 2), offY = Math.round((slideH - cy) / 2);

    var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';

    var grpHeader =
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

    var slideXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '">' +
      '<p:cSld><p:spTree>' + grpHeader +
      '<p:pic>' +
      '<p:nvPicPr><p:cNvPr id="2" name="image"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr><a:xfrm><a:off x="' + offX + '" y="' + offY + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
      '</p:pic></p:spTree></p:cSld>' +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';

    var layoutXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldLayout xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '" type="blank" preserve="1">' +
      '<p:cSld name="blank"><p:spTree>' + grpHeader + '</p:spTree></p:cSld>' +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

    var masterXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldMaster xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '">' +
      '<p:cSld><p:spTree>' + grpHeader + '</p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ' +
      'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>';

    var themeXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<a:theme xmlns:a="' + NS_A + '" name="Inkpad"><a:themeElements>' +
      '<a:clrScheme name="Office">' +
      '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
      '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2>' +
      '<a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4>' +
      '<a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink>' +
      '</a:clrScheme>' +
      '<a:fontScheme name="Office">' +
      '<a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
      '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
      '</a:fontScheme>' +
      '<a:fmtScheme name="Office">' +
      '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
      '<a:lnStyleLst>' +
      '<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
      '<a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
      '<a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
      '</a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>' +
      '<a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
      '</a:fmtScheme></a:themeElements></a:theme>';

    function rels(list) {
      var s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
      list.forEach(function (r) {
        s += '<Relationship Id="' + r[0] + '" Type="' + r[1] + '" Target="' + r[2] + '"/>';
      });
      return strToU8(s + '</Relationships>');
    }
    var RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

    return zipStore([
      { name: '[Content_Types].xml', data: strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        '</Types>') },
      { name: '_rels/.rels', data: rels([['rId1', RT + 'officeDocument', 'ppt/presentation.xml']]) },
      { name: 'ppt/presentation.xml', data: strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '">' +
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
        '<p:sldSz cx="' + slideW + '" cy="' + slideH + '" type="screen16x9"/>' +
        '<p:notesSz cx="6858000" cy="9144000"/></p:presentation>') },
      { name: 'ppt/_rels/presentation.xml.rels', data: rels([
        ['rId1', RT + 'slideMaster', 'slideMasters/slideMaster1.xml'],
        ['rId2', RT + 'slide', 'slides/slide1.xml'],
        ['rId3', RT + 'theme', 'theme/theme1.xml']
      ]) },
      { name: 'ppt/slides/slide1.xml', data: strToU8(slideXml) },
      { name: 'ppt/slides/_rels/slide1.xml.rels', data: rels([
        ['rId1', RT + 'slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['rId2', RT + 'image', '../media/image1.png']
      ]) },
      { name: 'ppt/slideMasters/slideMaster1.xml', data: strToU8(masterXml) },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([
        ['rId1', RT + 'slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['rId2', RT + 'theme', '../theme/theme1.xml']
      ]) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', data: strToU8(layoutXml) },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([
        ['rId1', RT + 'slideMaster', '../slideMasters/slideMaster1.xml']
      ]) },
      { name: 'ppt/theme/theme1.xml', data: strToU8(themeXml) },
      { name: 'ppt/media/image1.png', data: pngU8 }
    ]);
  }

  /* ================= FreeMind (.mm，思维导图) ================= */
  function makeFreeMind(root) {
    function node(n) {
      var s = '<node TEXT="' + xmlEscape(n.text) + '">';
      (n.children || []).forEach(function (c) { s += node(c); });
      return s + '</node>';
    }
    return '<map version="1.0.1">\n' + node(root) + '\n</map>\n';
  }

  /* ================= XMind (.xmind，2020+ content.json 格式) ================= */
  function makeXMind(root, title) {
    var seq = 0;
    function nid() { return 'id' + (++seq) + Date.now().toString(36); }
    function topic(n) {
      var t = { id: nid(), class: 'topic', title: n.text || '' };
      var kids = (n.children || []).map(topic);
      if (kids.length) t.children = { attached: kids };
      return t;
    }
    var content = [{
      id: nid(),
      class: 'sheet',
      title: title || '思维导图',
      rootTopic: topic(root)
    }];
    return zipStore([
      { name: 'content.json', data: strToU8(JSON.stringify(content, null, 2)) },
      { name: 'metadata.json', data: strToU8(JSON.stringify({ creator: { name: 'Inkpad', version: '1.0.0' } })) },
      { name: 'manifest.json', data: strToU8(JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } })) }
    ]);
  }

  /* ================= Markdown ================= */
  function mindToMarkdown(root, title) {
    var lines = ['# ' + (title || root.text || '思维导图'), ''];
    (function walk(n, depth) {
      if (depth > 0) lines.push('  '.repeat(depth - 1) + '- ' + (n.text || ''));
      (n.children || []).forEach(function (c) { walk(c, depth + 1); });
    })(root, 0);
    return lines.join('\n') + '\n';
  }

  function flowToMarkdown(model, title) {
    var shapeOf = { start: '(["%t"])', end: '(["%t"])', process: '["%t"]', decision: '{"%t"}' };
    var ids = {};
    model.nodes.forEach(function (n, i) { ids[n.id] = 'N' + (i + 1); });
    function safe(t) { return String(t || '').replace(/"/g, "'"); }

    var mm = ['flowchart TD'];
    model.nodes.forEach(function (n) {
      var tpl = shapeOf[n.type] || '["%t"]';
      mm.push('  ' + ids[n.id] + tpl.replace('%t', safe(n.text)));
    });
    model.edges.forEach(function (e) {
      if (!ids[e.from] || !ids[e.to]) return;
      mm.push('  ' + ids[e.from] + (e.text ? ' -->|"' + safe(e.text) + '"| ' : ' --> ') + ids[e.to]);
    });

    return '# ' + (title || '流程图') + '\n\n```mermaid\n' + mm.join('\n') + '\n```\n';
  }

  /* ================= CSV ================= */
  function mindToCSV(root) {
    var maxDepth = 1;
    (function depth(n, d) {
      if (d > maxDepth) maxDepth = d;
      (n.children || []).forEach(function (c) { depth(c, d + 1); });
    })(root, 1);

    var header = [];
    for (var i = 1; i <= maxDepth; i++) header.push(i === 1 ? '中心主题' : '第' + i + '级');
    var lines = [header.map(csvEscape).join(',')];
    (function walk(n, d, row) {
      var r = row.slice();
      r[d - 1] = n.text || '';
      lines.push(r.map(csvEscape).join(','));
      (n.children || []).forEach(function (c) { walk(c, d + 1, r); });
    })(root, 1, new Array(maxDepth).fill(''));
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  function flowToCSV(model) {
    var names = {};
    model.nodes.forEach(function (n) { names[n.id] = n.text; });
    var lines = ['节点ID,类型,文字,X,Y'];
    var typeName = { start: '开始/结束', end: '开始/结束', process: '过程', decision: '判断' };
    model.nodes.forEach(function (n) {
      lines.push([n.id, typeName[n.type] || n.type, n.text, n.x, n.y].map(csvEscape).join(','));
    });
    lines.push('');
    lines.push('起点,终点,连线文字');
    model.edges.forEach(function (e) {
      lines.push([names[e.from] || e.from, names[e.to] || e.to, e.text || ''].map(csvEscape).join(','));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /* ================= 导出 ================= */
  global.InkpadExporter = {
    exportSvgText: exportSvgText,
    rasterize: rasterize,
    makePdf: makePdf,
    makeDocx: makeDocx,
    makePptx: makePptx,
    makeFreeMind: makeFreeMind,
    makeXMind: makeXMind,
    mindToMarkdown: mindToMarkdown,
    flowToMarkdown: flowToMarkdown,
    mindToCSV: mindToCSV,
    flowToCSV: flowToCSV,
    u8ToBase64: u8ToBase64,
    zipStore: zipStore,
    crc32: crc32
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* exportar.js
   Arma el informe como una estructura única y la entrega en Word (.docx) y PDF.
   No toca el navegador para el diseño: el resultado no depende del ancho de la pantalla,
   ni de la impresora, ni agrega encabezados o pies de página del navegador. */
(function (root) {
  "use strict";

  var LIMITE_EN_LINEA = 100;   /* hasta cuántos caracteres un texto queda en la misma línea del título */
  var COLOR = { borde: "9AA6B3", sombra: "EEF1F5", tinta: "15191F", gris: "4A5560", rojo: "B3261E" };

  /* ---------------------------------------------------------------- utilidades */
  function fechaCL(i) { if (!i) return ""; var p = String(i).split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : i; }
  function peso(n) { n = n || 0; return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
  function vacio(s) { return !String(s == null ? "" : s).trim(); }

  function dataURLaBytes(u) {
    var m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(u);
    if (!m) throw new Error("Imagen no válida");
    var bin = atob(m[3]), n = bin.length, b = new Uint8Array(n);
    for (var i = 0; i < n; i++) b[i] = bin.charCodeAt(i);
    return { mime: m[1], bytes: b };
  }
  function bytesABase64(buf) {
    var b = new Uint8Array(buf), s = "", T = 0x8000;
    for (var i = 0; i < b.length; i += T) s += String.fromCharCode.apply(null, b.subarray(i, i + T));
    return btoa(s);
  }
  function cargarImagen(src) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("No se pudo leer la imagen")); };
      im.src = src;
    });
  }

  /* SVG (gráfico) -> PNG, para poder ponerlo en Word y PDF */
  function svgAPng(svg) {
    var m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg), w = m ? +m[1] : 640, h = m ? +m[2] : 300;
    var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg width="' + w + '" height="' + h + '" '));
    return cargarImagen(url).then(function (im) {
      var k = 2, c = document.createElement("canvas"); c.width = w * k; c.height = h * k;
      var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0, c.width, c.height);
      return { src: c.toDataURL("image/png"), w: c.width, h: c.height };
    });
  }

  /* anchos de columna de una tabla según su contenido */
  function pesosColumnas(filas) {
    var n = 0; filas.forEach(function (f) { if (f.length > n) n = f.length; });
    var w = [];
    for (var c = 0; c < n; c++) {
      var tot = 0, cnt = 0, maxw = 0;
      filas.forEach(function (f) {
        var s = String(f[c] == null ? "" : f[c]); tot += s.length; cnt++;
        s.split(/\s+/).forEach(function (p) { if (p.length > maxw) maxw = p.length; });
      });
      var prom = tot / Math.max(cnt, 1);
      w.push(Math.min(45, Math.max(4, Math.max(prom, Math.min(maxw, 14)))));
    }
    return w;
  }
  /* reparte "total" entre columnas según su peso, respetando un mínimo por columna (número o lista) */
  function repartir(p, total, min) {
    var n = p.length, mn = [], fijo = [], a = [], i, sm = 0;
    for (i = 0; i < n; i++) { mn[i] = Array.isArray(min) ? min[i] : min; sm += mn[i]; fijo[i] = false; }
    if (sm >= total) return mn.map(function (x) { return x * total / sm; });
    for (var it = 0; it < 8; it++) {
      var libre = 0, usado = 0;
      for (i = 0; i < n; i++) { if (fijo[i]) usado += mn[i]; else libre += p[i]; }
      var resto = total - usado, cambio = false;
      for (i = 0; i < n; i++) if (!fijo[i]) { a[i] = p[i] / libre * resto; if (a[i] < mn[i]) { fijo[i] = true; cambio = true; } }
      if (!cambio) break;
    }
    var s2 = 0;
    for (i = 0; i < n; i++) { if (fijo[i]) a[i] = mn[i]; s2 += a[i]; }
    return a.map(function (x) { return x * total / s2; });
  }
  /* ancho mínimo de cada columna: que quepa su palabra más larga (medir = función que mide un texto) */
  function minimos(filas, medir, pad, tope) {
    var n = anchoCols(filas), out = [];
    for (var c = 0; c < n; c++) {
      var m = 0;
      filas.forEach(function (f) {
        String(f[c] == null ? "" : f[c]).split(/\s+/).forEach(function (w) { if (w) { var x = medir(w); if (x > m) m = x; } });
      });
      out.push(Math.min(m + pad, tope));
    }
    return out;
  }
  function letraTabla(nc) { return nc <= 3 ? 9 : nc <= 4 ? 8.5 : nc <= 5 ? 8 : nc <= 7 ? 7.5 : nc <= 9 ? 7 : 6.5; }
  function anchoCols(filas) { var n = 0; filas.forEach(function (f) { if (f.length > n) n = f.length; }); return n; }

  /* ---------------------------------------------------------------- estructura común */
  /* cfg: { TIPOS, rotulo(tipo, sec), secsDe(tipo), graficoSVG(tabla) } */
  function construir(doc, cfg) {
    var tipo = cfg.TIPOS[doc.tipo], filas = [];
    var pend = function () { return [{ t: "p", txt: "[pendiente]", pend: true }]; };

    function campo(label, val, extra, key) {
      var v = String(val || "").trim(), ex = extra ? " (" + extra + ")" : "";
      filas.push({ label: label, campo: true, items: v
        ? [{ t: "p", txt: v + ex, key: key, val: v, extra: ex }]
        : [{ t: "p", txt: "[pendiente]", pend: true, key: key }] });
    }
    campo(doc.tipo === "visita" ? "Asunto" : "Título Proyecto", doc.titulo, doc.codigo, "titulo");
    campo("Cliente", doc.cliente, "", "cliente");
    if (doc.tipo === "visita") campo("Lugar", doc.lugar, "", "lugar");
    campo("Responsable", doc.responsable, "", "responsable");
    filas.push({ label: "Fecha", campo: true, items: [{ t: "p", txt: fechaCL(doc.fecha) }] });

    cfg.secsDe(doc.tipo).forEach(function (s) {
      var label = cfg.rotulo(doc.tipo, s);
      if (s === "cumplimiento") {
        var et = { cumplido: "Se cumplió", parcial: "Se cumplió en parte", no: "No se cumplió" }[doc.estadoSemana];
        filas.push({ label: label, sec: s, items: et ? [{ t: "p", txt: et }] : pend() });
        return;
      }
      filas.push({ label: label, sec: s, items: itemsDe(doc[s] || [], cfg, s) });
    });

    filas.forEach(function (f) { f.modo = modoDe(f.items); });
    return { titulo: "INFORME", sub: tipo.et.toUpperCase(), filas: filas };
  }

  function itemsDe(bloques, cfg, sec) {
    var out = [];
    function mk(o, b) { o.sec = sec; o.bid = b.id; return o; }
    bloques.forEach(function (b) {
      if (b.tipo === "texto") {
        var ls = String(b.txt || "").replace(/\r/g, "").split("\n");
        while (ls.length && vacio(ls[ls.length - 1])) ls.pop();
        while (ls.length && vacio(ls[0])) ls.shift();
        ls.forEach(function (l) { out.push(mk({ t: "p", txt: l.replace(/\s+$/, "") }, b)); });
      } else if (b.tipo === "tabla") {
        out.push(mk({ t: "tabla", filas: b.filas || [], encab: !!b.encab, pie: b.pie || "" }, b));
      } else if (b.tipo === "grafico") {
        var tb = bloques.filter(function (x) { return x.id === b.ref; })[0];
        if (tb) out.push(mk({ t: "graf", tabla: tb, pie: b.pie || "" }, b));
      } else if (b.tipo === "imagen") {
        out.push(mk({ t: "img", src: b.src, ancho: b.ancho, w: b.w, h: b.h, pie: b.pie || "" }, b));
      } else if (b.tipo === "archivo") {
        out.push(mk({ t: "adj", txt: "Adjunto: " + b.nombre + " (" + peso(b.bytes) + ")" + (b.pie ? " — " + b.pie : "") }, b));
      }
    });
    return out.length ? out : [{ t: "p", txt: "[pendiente]", pend: true }];
  }

  /* un texto corto se queda en la misma línea del título; lo demás va debajo, a todo el ancho */
  function modoDe(items) {
    var ps = items.filter(function (i) { return i.t === "p" && !vacio(i.txt); });
    if (items.length === ps.length && ps.length === 1 && ps[0].txt.length <= LIMITE_EN_LINEA && items.length === 1) return "inline";
    return "stack";
  }

  /* completa tamaños de imagen y convierte gráficos a imagen */
  function preparar(ir, cfg) {
    var tareas = [];
    ir.filas.forEach(function (f) {
      f.items.forEach(function (it, idx) {
        if (it.t === "img") {
          tareas.push((it.w && it.h ? Promise.resolve() : cargarImagen(it.src).then(function (im) { it.w = im.naturalWidth; it.h = im.naturalHeight; }))
            .catch(function () { it.w = it.w || 4; it.h = it.h || 3; })
            .then(function () { if (!it.ancho) it.ancho = it.h > it.w ? 45 : 70; }));
        } else if (it.t === "graf") {
          tareas.push(Promise.resolve().then(function () {
            var svg = cfg.graficoSVG(it.tabla);
            if (!svg) { it.t = "adj"; it.txt = "[gráfico no disponible]"; return; }
            return svgAPng(svg).then(function (r) { it.t = "img"; it.src = r.src; it.w = r.w; it.h = r.h; it.ancho = 80; delete it.tabla; });
          }).catch(function () { it.t = "adj"; it.txt = "[gráfico no disponible]"; }));
        }
      });
    });
    return Promise.all(tareas).then(function () { return ir; });
  }

  function nombreBase(doc) {
    var t = String(doc.titulo || "informe").replace(/[^\wáéíóúñÁÉÍÓÚÑ \-]/g, "").trim().replace(/\s+/g, "_").slice(0, 50);
    return "Informe_" + (t || "informe") + "_" + (doc.fecha || "");
  }

  /* ---------------------------------------------------------------- WORD (.docx) */
  function aDocx(ir) {
    var D = root.docx;
    if (!D) return Promise.reject(new Error("Falta la librería de Word"));
    var ANCHO = 9866, ETQ = 2400, MARG = 110;                 /* A4 con márgenes de 18 mm, en twips */
    var linea = { style: D.BorderStyle.SINGLE, size: 4, color: COLOR.borde };
    var bordes = { top: linea, bottom: linea, left: linea, right: linea };
    var sombra = { type: D.ShadingType.CLEAR, fill: COLOR.sombra, color: "auto" };

    function run(t, o) {
      o = o || {};
      return new D.TextRun({ text: t, size: Math.round((o.pt || 10) * 2), bold: !!o.bold, italics: !!o.italics, color: o.color, font: "Calibri", characterSpacing: o.sp });
    }
    function parrafo(it) {
      if (vacio(it.txt) && !it.pend) return new D.Paragraph({ spacing: { after: 40 }, children: [run("", { pt: 5 })] });
      return new D.Paragraph({
        alignment: D.AlignmentType.JUSTIFIED, spacing: { after: 50 },
        children: [run(it.txt, it.pend ? { color: COLOR.rojo, italics: true } : {})]
      });
    }
    function pie(txt) {
      return new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 20, after: 100 }, children: [run(txt, { pt: 8, color: COLOR.gris })] });
    }
    function celdaTabla(txt, w, pt, enc) {
      var ls = String(txt == null ? "" : txt).split(/\r?\n/);
      return new D.TableCell({
        width: { size: w, type: D.WidthType.DXA }, borders: bordes,
        shading: enc ? sombra : undefined, verticalAlign: D.VerticalAlign.CENTER,
        margins: { top: 30, bottom: 30, left: 70, right: 70 },
        children: ls.map(function (l) { return new D.Paragraph({ alignment: D.AlignmentType.LEFT, children: [run(l, { pt: pt, bold: enc })] }); })
      });
    }
    function tablaDocx(it, ancho) {
      var nc = anchoCols(it.filas), pt = letraTabla(nc);
      var mins = minimos(it.filas, function (w) { return w.length * pt * 20 * 0.56; }, 190, ancho * 0.24);
      var cols = repartir(pesosColumnas(it.filas), ancho, mins).map(Math.floor);
      cols[cols.length - 1] += ancho - cols.reduce(function (a, b) { return a + b; }, 0);
      var rows = it.filas.map(function (f, ri) {
        var enc = it.encab && ri === 0, cells = [];
        for (var c = 0; c < nc; c++) cells.push(celdaTabla(f[c], cols[c], pt, enc));
        return new D.TableRow({ tableHeader: enc, cantSplit: true, children: cells });
      });
      return new D.Table({ width: { size: ancho, type: D.WidthType.DXA }, columnWidths: cols, layout: D.TableLayoutType.FIXED, rows: rows, alignment: D.AlignmentType.CENTER });
    }
    function imagenDocx(it, ancho) {
      /* la foto y su pie van en el mismo párrafo: nunca se separan y el cuerpo puede partirse entre páginas */
      var d = dataURLaBytes(it.src), maxPx = (ancho / 1440) * 96;
      var wpx = Math.round(maxPx * (it.ancho || 60) / 100), hpx = Math.round(wpx * it.h / it.w);
      if (hpx > 640) { wpx = Math.round(wpx * 640 / hpx); hpx = 640; }
      var hijos = [new D.ImageRun({ type: /png/.test(d.mime) ? "png" : "jpg", data: d.bytes, transformation: { width: wpx, height: hpx }, altText: { title: "Imagen", description: it.pie || "Imagen", name: "imagen" } })];
      if (it.pie) hijos.push(new D.TextRun({ text: it.pie, break: 1, size: 16, color: COLOR.gris, font: "Calibri" }));
      return new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 80, after: 100 }, children: hijos });
    }
    function contenido(items, ancho) {
      var out = [];
      items.forEach(function (it) {
        if (it.t === "p") out.push(parrafo(it));
        else if (it.t === "tabla") { out.push(tablaDocx(it, ancho)); out.push(it.pie ? pie(it.pie) : new D.Paragraph({ spacing: { after: 60 }, children: [run("", { pt: 4 })] })); }
        else if (it.t === "img") out.push(imagenDocx(it, ancho));
        else if (it.t === "adj") out.push(new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 60 }, children: [run(it.txt, { pt: 9, color: COLOR.gris })] }));
      });
      if (!out.length) out.push(new D.Paragraph({ children: [] }));
      return out;
    }
    function celda(w, hijos, o) {
      o = o || {};
      return new D.TableCell({ width: { size: w, type: D.WidthType.DXA }, columnSpan: o.span, borders: bordes, shading: o.sombra ? sombra : undefined, verticalAlign: D.VerticalAlign.TOP, children: hijos });
    }
    function etiqueta(t, keep) {
      return new D.Paragraph({ keepNext: !!keep, spacing: { after: 0 }, children: [run(t, { bold: true, pt: 9.5 })] });
    }

    var filasT = [];
    ir.filas.forEach(function (f) {
      if (f.modo === "inline") {
        filasT.push(new D.TableRow({ cantSplit: true, children: [
          celda(ETQ, [etiqueta(f.label)], { sombra: true }),
          celda(ANCHO - ETQ, contenido(f.items, ANCHO - ETQ - 2 * MARG - 20))
        ] }));
      } else {
        filasT.push(new D.TableRow({ cantSplit: true, children: [celda(ANCHO, [etiqueta(f.label, true)], { span: 2, sombra: true })] }));
        filasT.push(new D.TableRow({ children: [celda(ANCHO, contenido(f.items, ANCHO - 2 * MARG - 20), { span: 2 })] }));
      }
    });

    var cuerpo = [
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 0, after: 0 },
        children: [new D.TextRun({ text: ir.titulo, font: "Georgia", bold: true, size: 52, characterSpacing: 120, color: COLOR.tinta })] }),
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 20, after: 220 },
        border: { bottom: { style: D.BorderStyle.SINGLE, size: 12, color: COLOR.tinta, space: 6 } },
        children: [new D.TextRun({ text: ir.sub, font: "Calibri", size: 18, characterSpacing: 40, color: COLOR.gris })] }),
      new D.Table({ width: { size: ANCHO, type: D.WidthType.DXA }, columnWidths: [ETQ, ANCHO - ETQ], layout: D.TableLayoutType.FIXED,
        margins: { top: 70, bottom: 70, left: MARG, right: MARG }, rows: filasT })
    ];

    var documento = new D.Document({
      title: "Informe", creator: "Informe",
      styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1020, right: 1020, footer: 500 } } },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER,
          children: [new D.TextRun({ children: [D.PageNumber.CURRENT, " / ", D.PageNumber.TOTAL_PAGES], size: 16, color: "7A8794", font: "Calibri" })] })] }) },
        children: cuerpo
      }]
    });
    return D.Packer.toBlob(documento);
  }

  /* ---------------------------------------------------------------- PDF */
  var cacheFuentes = null;
  function cargarFuentes(base) {
    if (cacheFuentes) return Promise.resolve(cacheFuentes);
    function bajar(u) { return fetch(base + u).then(function (r) { if (!r.ok) throw new Error("No se encontró " + u); return r.arrayBuffer(); }).then(bytesABase64); }
    return Promise.all([bajar("carlito-regular.ttf"), bajar("carlito-bold.ttf")]).then(function (r) { cacheFuentes = r; return r; });
  }

  function aPDF(ir, opts) {
    opts = opts || {};
    var J = root.jspdf && root.jspdf.jsPDF;
    if (!J) return Promise.reject(new Error("Falta la librería de PDF"));
    return cargarFuentes(opts.base || "").then(function (f) {
      var pdf = new J({ unit: "mm", format: "a4", compress: true });
      pdf.addFileToVFS("Carlito-Regular.ttf", f[0]); pdf.addFont("Carlito-Regular.ttf", "Carlito", "normal");
      pdf.addFileToVFS("Carlito-Bold.ttf", f[1]); pdf.addFont("Carlito-Bold.ttf", "Carlito", "bold");
      return dibujarPDF(pdf, ir);
    });
  }

  function dibujarPDF(pdf, ir) {
    var W = 210, H = 297, L = 18, AN = 174, TOP = 16, BOT = H - 18;
    var ETQ = 42, PX = 2.6, PY = 2;
    var NEGRO = [21, 25, 31], GRIS = [74, 85, 96], ROJO = [179, 38, 30], BORDE = [154, 166, 179], SOMBRA = [238, 241, 245];
    var y = TOP, segTop = 0;

    function lh(pt) { return pt * 0.3528 * 1.27; }
    function fuente(estilo, pt, color) { pdf.setFont("Carlito", estilo); pdf.setFontSize(pt); var c = color || NEGRO; pdf.setTextColor(c[0], c[1], c[2]); }
    function trazo() { pdf.setDrawColor(BORDE[0], BORDE[1], BORDE[2]); pdf.setLineWidth(0.2); }
    function lados(desde, hasta, cierre) {
      trazo(); pdf.line(L, desde, L, hasta); pdf.line(L + AN, desde, L + AN, hasta);
      if (cierre) pdf.line(L, hasta, L + AN, hasta);
    }
    function pagina(enSegmento) {
      if (enSegmento) lados(segTop, y, false);
      pdf.addPage(); y = TOP; segTop = y;
    }
    function hayEspacio(h) { return y + h <= BOT; }

    /* ---- texto justificado ---- */
    function parrafoJ(txt, x, w, pt, color, enSeg) {
      fuente("normal", pt, color);
      var ls = pdf.splitTextToSize(txt, w), h = lh(pt), esp = pdf.getTextWidth(" ");
      for (var i = 0; i < ls.length; i++) {
        if (!hayEspacio(h)) { pagina(enSeg); fuente("normal", pt, color); }
        var base = y + h * 0.76, ln = ls[i], ult = i === ls.length - 1, hecho = false;
        if (!ult && ln.indexOf(" ") > 0) {
          var pal = ln.split(" ").filter(function (p) { return p; }), suma = 0;
          pal.forEach(function (p) { suma += pdf.getTextWidth(p); });
          var gap = (w - suma) / (pal.length - 1);
          if (pal.length > 1 && gap <= esp * 3.4) {
            var cx = x; pal.forEach(function (p) { pdf.text(p, cx, base); cx += pdf.getTextWidth(p) + gap; }); hecho = true;
          }
        }
        if (!hecho) pdf.text(ln, x, base);
        y += h;
      }
    }

    /* ---- imágenes ---- */
    function tamImg(it, iw) {
      var w = iw * (it.ancho || 60) / 100, h = w * it.h / it.w;
      if (h > 190) { w = w * 190 / h; h = 190; }
      return { w: w, h: h };
    }
    function pieLineas(txt, iw) { fuente("normal", 8, GRIS); return pdf.splitTextToSize(txt, iw); }
    function formato(src) { return /^data:image\/png/.test(src) ? "PNG" : "JPEG"; }

    function dibujarItem(it, x, iw, enSeg) {
      if (it.t === "p") {
        if (vacio(it.txt) && !it.pend) { y += lh(10) * 0.55; return; }
        parrafoJ(it.txt, x, iw, 10, it.pend ? ROJO : NEGRO, enSeg); y += 0.9; return;
      }
      if (it.t === "adj") {
        fuente("normal", 9, GRIS); var l = pdf.splitTextToSize(it.txt, iw), h = lh(9);
        l.forEach(function (s) { if (!hayEspacio(h)) { pagina(enSeg); fuente("normal", 9, GRIS); } pdf.text(s, x + iw / 2, y + h * 0.76, { align: "center" }); y += h; });
        y += 1; return;
      }
      if (it.t === "img") {
        var t = tamImg(it, iw), pl = it.pie ? pieLineas(it.pie, iw) : [], ph = pl.length * lh(8);
        if (!hayEspacio(t.h + ph + 2)) pagina(enSeg);
        pdf.addImage(it.src, formato(it.src), x + (iw - t.w) / 2, y + 1, t.w, t.h, undefined, "FAST");
        y += t.h + 2;
        if (pl.length) { fuente("normal", 8, GRIS); pl.forEach(function (s) { pdf.text(s, x + iw / 2, y + lh(8) * 0.76, { align: "center" }); y += lh(8); }); }
        y += 2; return;
      }
      if (it.t === "tabla") { dibujarTabla(it, x, iw, enSeg); return; }
    }

    /* ---- tablas ---- */
    function dibujarTabla(it, x, iw, enSeg) {
      var nc = anchoCols(it.filas); if (!nc) return;
      var pt = letraTabla(nc); fuente("normal", pt);
      var mins = minimos(it.filas, function (w) { return pdf.getTextWidth(w) * 1.04; }, 2.8, iw * 0.24);
      var cols = repartir(pesosColumnas(it.filas), iw, mins);
      var cs = {}; cols.forEach(function (w, i) { cs[i] = { cellWidth: w }; });
      var norm = it.filas.map(function (f) { var r = []; for (var c = 0; c < nc; c++) r.push(String(f[c] == null ? "" : f[c])); return r; });
      var head = it.encab ? [norm[0]] : undefined, body = it.encab ? norm.slice(1) : norm;
      if (!hayEspacio(18)) pagina(enSeg);
      var pg0 = pdf.getNumberOfPages(), y0 = segTop, tramos = [];
      pdf.autoTable({
        startY: y, head: head, body: body, theme: "grid", tableWidth: iw, showHead: "everyPage", rowPageBreak: "avoid",
        margin: { left: x, right: W - (x + iw), top: TOP + 1, bottom: H - BOT },
        styles: { font: "Carlito", fontSize: pt, cellPadding: { top: 1, bottom: 1, left: 1.2, right: 1.2 }, lineColor: BORDE, lineWidth: 0.2, textColor: NEGRO, overflow: "linebreak", valign: "middle" },
        headStyles: { fillColor: SOMBRA, textColor: NEGRO, fontStyle: "bold", halign: "left" },
        columnStyles: cs,
        didDrawPage: function (d) { tramos.push({ n: d.pageNumber, y: d.cursor && d.cursor.y ? d.cursor.y : BOT }); }
      });
      var fin = pdf.lastAutoTable.finalY, np = pdf.getNumberOfPages();
      if (enSeg && np > pg0) {
        for (var k = 0; k < tramos.length - 1; k++) { pdf.setPage(tramos[k].n); lados(k === 0 ? y0 : TOP, tramos[k].y + 1, false); }
        pdf.setPage(np); segTop = TOP;
      }
      y = fin + 1.4;
      if (it.pie) {
        var pl = pieLineas(it.pie, iw);
        if (!hayEspacio(pl.length * lh(8) + 1)) pagina(enSeg);
        fuente("normal", 8, GRIS); pl.forEach(function (s) { pdf.text(s, x + iw / 2, y + lh(8) * 0.76, { align: "center" }); y += lh(8); });
      }
      y += 2.5;
    }

    /* ---- altura aproximada del primer bloque (para no dejar un título huérfano) ---- */
    function primerBloque(items, iw) {
      var it = items[0];
      if (!it) return 6;
      if (it.t === "img") { var t = tamImg(it, iw); return Math.min(t.h + 8, BOT - TOP - 12); }
      if (it.t === "tabla") return 24;
      return lh(10) * 2 + 3;
    }

    /* ================= encabezado ================= */
    pdf.setFont("times", "bold"); pdf.setFontSize(27); pdf.setTextColor(NEGRO[0], NEGRO[1], NEGRO[2]);
    pdf.text(ir.titulo, W / 2, y + 8, { align: "center", charSpace: 2.4 });
    y += 12;
    fuente("normal", 9, GRIS); pdf.text(ir.sub, W / 2, y + 2.5, { align: "center", charSpace: 0.9 });
    y += 6.5;
    pdf.setDrawColor(NEGRO[0], NEGRO[1], NEGRO[2]); pdf.setLineWidth(0.6); pdf.line(L, y, L + AN, y);
    y += 5;

    /* ================= filas ================= */
    ir.filas.forEach(function (f) {
      if (f.modo === "inline") {
        var it = f.items[0];
        fuente("bold", 9.5); var ll = pdf.splitTextToSize(f.label, ETQ - 2 * PX);
        fuente("normal", 10); var tl = pdf.splitTextToSize(it.txt, AN - ETQ - 2 * PX);
        var h = Math.max(ll.length * lh(9.5), tl.length * lh(10)) + 2 * PY + 0.6;
        if (!hayEspacio(h)) pagina(false);
        trazo(); pdf.setFillColor(SOMBRA[0], SOMBRA[1], SOMBRA[2]);
        pdf.rect(L, y, ETQ, h, "FD"); pdf.rect(L + ETQ, y, AN - ETQ, h, "S");
        fuente("bold", 9.5); ll.forEach(function (s, i) { pdf.text(s, L + PX, y + PY + 0.3 + lh(9.5) * (i + 0.76)); });
        fuente("normal", 10, it.pend ? ROJO : NEGRO);
        tl.forEach(function (s, i) { pdf.text(s, L + ETQ + PX, y + PY + 0.3 + lh(10) * (i + 0.76)); });
        y += h;
        return;
      }
      var iw = AN - 2 * PX, x0 = L + PX, BANDA = 7;
      if (!hayEspacio(BANDA + primerBloque(f.items, iw))) pagina(false);
      trazo(); pdf.setFillColor(SOMBRA[0], SOMBRA[1], SOMBRA[2]); pdf.rect(L, y, AN, BANDA, "FD");
      fuente("bold", 9.5); pdf.text(f.label, L + PX, y + BANDA / 2 + 1.25);
      y += BANDA; segTop = y; y += PY;
      f.items.forEach(function (it) { dibujarItem(it, x0, iw, true); });
      y += PY - 0.6;
      lados(segTop, y, true);
    });

    /* ================= números de página ================= */
    var n = pdf.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      pdf.setPage(p); fuente("normal", 8, [122, 135, 148]);
      pdf.text(p + " / " + n, W / 2, H - 9, { align: "center" });
    }
    return pdf.output("blob");
  }

  root.Exp = {
    construir: construir, preparar: preparar, aDocx: aDocx, aPDF: aPDF,
    nombreBase: nombreBase, modoDe: modoDe, LIMITE_EN_LINEA: LIMITE_EN_LINEA,
    util: { dataURLaBytes: dataURLaBytes, cargarImagen: cargarImagen, svgAPng: svgAPng, repartir: repartir, pesosColumnas: pesosColumnas }
  };
})(typeof window !== "undefined" ? window : globalThis);

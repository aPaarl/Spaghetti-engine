# Converts a Spaghetti Engine Word document (.docx) to a branded PDF, for the About & documentation tab.
#
#   python tools/docx2pdf.py <input.docx> "<footer text>" <output.pdf> "<PDF title>"
#
# Steps: docx -> HTML (own converter) -> PDF with a headless Chromium browser (Edge or Chrome) -> contents page
# numbers read back from the PDF's own link destinations -> second pass -> footer, bookmarks, and metadata added.
# Needs: Python 3, python-docx, PyMuPDF (fitz), and Edge or Chrome (or set EDGE_PATH).
import base64, html, os, re, subprocess, sys, tempfile
import docx
import fitz
from docx.oxml.ns import qn

import shutil
_EDGE_CANDIDATES = [os.environ.get("EDGE_PATH"), "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
                    "C:/Program Files/Google/Chrome/Application/chrome.exe", shutil.which("msedge"), shutil.which("chrome"), shutil.which("google-chrome")]
EDGE = next((p for p in _EDGE_CANDIDATES if p and os.path.exists(p)), None)
if EDGE is None:
    raise SystemExit("No Edge or Chrome found: set EDGE_PATH to a Chromium-based browser executable.")
W14 = "http://schemas.microsoft.com/office/word/2010/wordml"

CSS = """
@page { size: A4; margin: 19mm 17mm 21mm 17mm; }
* { box-sizing: border-box; }
html { font-family: Inter, "Segoe UI", Arial, sans-serif; font-size: 9.8pt; color: #1e293b; line-height: 1.5; hyphens: auto; }
body { margin: 0; }
h1 { font-size: 19pt; color: #0F1B3D; border-bottom: 3px solid #FFD23F; padding-bottom: 3px; margin: 11mm 0 5mm; break-after: avoid; line-height: 1.2; }
h2 { font-size: 13.5pt; color: #2456D6; margin: 7mm 0 2.5mm; break-after: avoid; line-height: 1.25; }
h3 { font-size: 11pt; color: #0F1B3D; margin: 5mm 0 2mm; break-after: avoid; }
p { margin: 0 0 2.6mm; }
ul { margin: 0 0 3mm 0; padding-left: 5mm; }
li { margin-bottom: 1.4mm; }
.step { padding-left: 6mm; text-indent: -6mm; }
.step .num { display: inline-block; width: 6mm; text-indent: 0; }
.callout { background: #FFF3BF; border-left: 4px solid #FFD23F; padding: 2.6mm 4mm; margin: 3mm 0 4mm; break-inside: avoid; }
.callout p { margin: 0; }
.eq { font-family: "Cambria Math", "Segoe UI Symbol", Cambria, serif; background: #F8FAFC; border-left: 3px solid #2456D6; padding: 1.6mm 4mm; margin: 1.6mm 0 2.6mm; white-space: pre-wrap; font-size: 10pt; break-inside: avoid; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0 5mm; font-size: 8.7pt; }
th { background: #2456D6; color: #fff; text-align: left; padding: 1.5mm 2mm; font-weight: 700; }
td { border: 1px solid #CBD5E1; padding: 1.3mm 2mm; vertical-align: top; }
td p, th p { margin: 0; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #F8FAFC; }
.cover { padding-top: 22mm; }
.cover table { margin-top: 12mm; }
.cover p { margin: 0 0 2.5mm; }
.cover img { margin-bottom: 10mm; }
.pb { break-after: page; height: 0; }
.toc-title { font-size: 19pt; font-weight: 700; color: #0F1B3D; border-bottom: 3px solid #FFD23F; padding-bottom: 3px; margin: 0 0 6mm; }
.toc a { display: flex; align-items: baseline; color: #1e293b; text-decoration: none; }
.toc .t { flex: none; }
.toc .d { flex: 1; border-bottom: 1px dotted #94A3B8; margin: 0 2mm; transform: translateY(-1mm); min-width: 6mm; }
.toc .n { flex: none; }
.toc .l1 { font-weight: 700; margin-top: 2mm; }
.toc .l2 { padding-left: 5mm; font-size: 9.2pt; }
.toc .l3 { padding-left: 10mm; font-size: 8.6pt; color: #475569; }
img { max-width: 100%; }
"""

def esc(t):
    return html.escape(t, quote=False)

def run_html(r, doc_part):
    out = []
    rpr = r.find(qn("w:rPr"))
    styles = []
    b = i = False
    code = False
    sup = sub = False
    if rpr is not None:
        b = rpr.find(qn("w:b")) is not None and rpr.find(qn("w:b")).get(qn("w:val")) not in ("0", "false")
        i = rpr.find(qn("w:i")) is not None and rpr.find(qn("w:i")).get(qn("w:val")) not in ("0", "false")
        col = rpr.find(qn("w:color"))
        if col is not None and col.get(qn("w:val")) not in (None, "auto", "FFFFFF"):
            styles.append("color:#" + col.get(qn("w:val")))
        sz = rpr.find(qn("w:sz"))
        if sz is not None:
            styles.append("font-size:%.1fpt" % (int(sz.get(qn("w:val"))) / 2))
        va = rpr.find(qn("w:vertAlign"))
        if va is not None:
            sup = va.get(qn("w:val")) == "superscript"; sub = va.get(qn("w:val")) == "subscript"
        rf = rpr.find(qn("w:rFonts"))
        if rf is not None and "Consolas" in (rf.get(qn("w:ascii")) or ""):
            code = True
    text = ""
    for ch in r:
        if ch.tag == qn("w:t"):
            text += esc(ch.text or "")
        elif ch.tag == qn("w:tab"):
            text += "\t"
        elif ch.tag == qn("w:br"):
            if ch.get(qn("w:type")) == "page":
                text += "@@PB@@"
            else:
                text += "<br>"
        elif ch.tag == qn("w:drawing"):
            blip = ch.find(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip")
            ext = ch.find(".//{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}extent")
            if blip is not None:
                rid = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
                blob = doc_part.related_parts[rid].blob
                w = int(ext.get("cx")) / 9525 if ext is not None else 300
                text += '<img src="data:image/png;base64,%s" style="width:%dpx">' % (base64.b64encode(blob).decode(), w)
    if not text:
        return ""
    if code:
        text = "<code>%s</code>" % text
    if sup:
        text = "<sup>%s</sup>" % text
    if sub:
        text = "<sub>%s</sub>" % text
    if b:
        text = "<b>%s</b>" % text
    if i:
        text = "<i>%s</i>" % text
    if styles:
        text = '<span style="%s">%s</span>' % (";".join(styles), text)
    return text

def para_inner(p, doc_part):
    out = []
    for ch in p:
        if ch.tag == qn("w:r"):
            out.append(run_html(ch, doc_part))
        elif ch.tag == qn("w:hyperlink"):
            for r in ch.findall(qn("w:r")):
                out.append(run_html(r, doc_part))
    return "".join(out)

def style_of(p):
    ppr = p.find(qn("w:pPr"))
    ps = ppr.find(qn("w:pStyle")) if ppr is not None else None
    return ps.get(qn("w:val")) if ps is not None else None

def jc_of(p):
    ppr = p.find(qn("w:pPr"))
    j = ppr.find(qn("w:jc")) if ppr is not None else None
    return j.get(qn("w:val")) if j is not None else None

def plain(p):
    return "".join(t.text or "" for t in p.iter(qn("w:t")))

def table_html(tbl, doc_part):
    grid = [int(g.get(qn("w:w"))) for g in tbl.find(qn("w:tblGrid")).findall(qn("w:gridCol"))]
    tot = sum(grid) or 1
    rows = tbl.findall(qn("w:tr"))
    out = ["<table><colgroup>" + "".join('<col style="width:%.1f%%">' % (100 * g / tot) for g in grid) + "</colgroup>"]
    for ri, tr in enumerate(rows):
        header = tr.find(qn("w:trPr")) is not None and tr.find(qn("w:trPr")).find(qn("w:tblHeader")) is not None
        tag = "th" if header else "td"
        if header:
            out.append("<thead><tr>")
        elif ri == 1 or (ri > 0 and (rows[ri - 1].find(qn("w:trPr")) is not None and rows[ri - 1].find(qn("w:trPr")).find(qn("w:tblHeader")) is not None)):
            out.append("<tbody><tr>")
        else:
            out.append("<tr>")
        for tc in tr.findall(qn("w:tc")):
            cell = "".join("<p>%s</p>" % (para_inner(p, doc_part) or "&nbsp;") for p in tc.findall(qn("w:p")))
            out.append("<%s>%s</%s>" % (tag, cell, tag))
        out.append("</tr></thead>" if header else "</tr>")
    out.append("</tbody></table>")
    return "".join(out)

def convert(docx_path, footer_title, out_pdf, meta_title, workdir):
    d = docx.Document(docx_path)
    body = d.element.body
    part = d.part
    blocks = []      # (kind, html, extra)
    headings = []    # (level, text, id)
    hid = 0
    seen_break = False
    cover = []
    has_toc = body.find(qn("w:sdt")) is not None
    ul_open = False
    def close_ul():
        nonlocal ul_open
        if ul_open:
            blocks.append(("raw", "</ul>", None)); ul_open = False
    cover_broken = False
    def end_cover():
        nonlocal cover, cover_broken
        if cover:
            blocks.append(("raw", '<div class="cover" style="break-after:page">%s</div>' % "".join(cover), None)); cover = []; cover_broken = True
    for el in body:
        if el.tag == qn("w:sdt"):
            close_ul(); end_cover(); blocks.append(("toc", "", None)); seen_break = True; continue
        if el.tag == qn("w:tbl"):
            close_ul()
            if not seen_break:
                cover.append(table_html(el, part))
            else:
                blocks.append(("raw", table_html(el, part), None))
            continue
        if el.tag != qn("w:p"):
            continue
        st = style_of(el)
        inner = para_inner(el, part)
        text = plain(el)
        if "@@PB@@" in inner:
            close_ul()
            inner = inner.replace("@@PB@@", "")
            if inner.strip():
                (cover if not seen_break else blocks).append("<p>%s</p>" % inner) if not seen_break else blocks.append(("raw", "<p>%s</p>" % inner, None))
            had_cover = bool(cover)
            end_cover()
            last = blocks[-1] if blocks else None
            already_broken = had_cover or (last is not None and (last[0] == "toc" or 'class="pb"' in last[1] or 'break-after:page' in last[1]))
            if not already_broken:
                blocks.append(("raw", '<div class="pb"></div>', None))
            seen_break = True
            continue
        if not inner.strip():
            continue
        if st in ("Heading1", "Heading2", "Heading3"):
            close_ul()
            lvl = int(st[-1]); hid += 1
            headings.append((lvl, text.strip(), "h%d" % hid))
            blocks.append(("raw", '<h%d id="h%d">%s</h%d>' % (lvl, hid, inner, lvl), None))
        elif st in ("ListBullet", "ListParagraph"):
            if not ul_open:
                blocks.append(("raw", "<ul>", None)); ul_open = True
            blocks.append(("raw", "<li>%s</li>" % inner.replace("	", " "), None))
        else:
            close_ul()
            runs = el.findall(qn("w:r"))
            first = "".join(t.text or "" for t in runs[0].iter(qn("w:t"))) if runs else ""
            if seen_break is False:
                al = jc_of(el)
                cover.append("<p%s>%s</p>" % (' style="text-align:center"' if al == "center" else "", inner))
            elif st == "Callout":
                blocks.append(("raw", '<div class="callout"><p>%s</p></div>' % inner.replace("	", " "), None))
            elif st == "EquationBlock":
                blocks.append(("raw", '<div class="eq">%s</div>' % inner.replace("	", " "), None))
            elif len(runs) >= 2 and re.match(r"^\d+\.$", first) and el.find(".//" + qn("w:tab")) is not None:
                rest = "".join(run_html(r, part) for r in runs[1:]).replace("	", "")
                blocks.append(("raw", '<p class="step"><span class="num">%s</span>%s</p>' % (first, rest), None))
            else:
                blocks.append(("raw", "<p>%s</p>" % inner.replace("	", " "), None))
    close_ul()

    def build(page_of):
        parts = []
        cover_done = False
        for kind, h, _ in blocks:
            if kind == "cover":
                continue
            if kind == "toc":
                rows = []
                for lvl, text, i in headings:
                    rows.append('<a href="#%s" class="l%d"><span class="t">%s</span><span class="d"></span><span class="n">%s</span></a>' % (i, lvl, esc(text), page_of.get(i, "0")))
                parts.append('<div class="toc" style="break-after:page"><div class="toc-title">Contents</div>%s</div>' % "".join(rows))
            else:
                parts.append(h)
        return "<!doctype html><html lang='en'><head><meta charset='utf-8'><title>%s</title><style>%s</style></head><body>%s</body></html>" % (esc(meta_title), CSS, "".join(parts))

    def print_pdf(html_text, pdf_path):
        hp = os.path.join(workdir, "page.html")
        open(hp, "w", encoding="utf-8").write(html_text)
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        win = lambda p: os.path.abspath(p)
        cmd = [EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + win(pdf_path), "file:///" + win(hp).replace("\\", "/")]
        for attempt in range(3):
            try:
                subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
            except subprocess.TimeoutExpired:
                print("  edge timed out, retrying")
            if os.path.exists(pdf_path):
                break
        assert os.path.exists(pdf_path), "PDF not written"

    tmp1 = os.path.join(workdir, "pass1.pdf")
    print_pdf(build({}), tmp1)
    doc1 = fitz.open(tmp1)
    page_of = {}
    # internal links exported as named destinations or GoTo: read the destination page of every TOC link
    toc_pages = {}
    for pno in range(doc1.page_count):
        for lk in doc1.load_page(pno).get_links():
            if lk.get("kind") in (fitz.LINK_GOTO, fitz.LINK_NAMED) and lk.get("page", -1) >= 0:
                toc_pages.setdefault(pno, []).append(lk["page"] + 1)
    if has_toc:
        dest = []
        for pno in sorted(toc_pages):
            dest.extend(toc_pages[pno])
        if len(dest) >= len(headings):
            for (lvl, text, i), pg in zip(headings, dest[: len(headings)]):
                page_of[i] = str(pg)
        else:
            raise RuntimeError("could not read TOC link destinations: %d links for %d headings" % (len(dest), len(headings)))
    doc1.close()
    final_html = build(page_of)
    tmp2 = os.path.join(workdir, "pass2.pdf")
    if has_toc:
        print_pdf(final_html, tmp2)
    else:
        import shutil
        shutil.copyfile(tmp1, tmp2)
    pdf = fitz.open(tmp2)
    if has_toc:
        # verify the numbers did not move between the passes
        moved = 0
        dest = []
        for pno in range(pdf.page_count):
            for lk in pdf.load_page(pno).get_links():
                if lk.get("kind") in (fitz.LINK_GOTO, fitz.LINK_NAMED) and lk.get("page", -1) >= 0:
                    dest.append(lk["page"] + 1)
        for (lvl, text, i), pg in zip(headings, dest):
            if page_of.get(i) != str(pg):
                moved += 1
        print("  toc entries whose page moved between passes:", moved)
    n = pdf.page_count
    for pno in range(1, n):     # not on the cover
        page = pdf.load_page(pno)
        r = page.rect
        y = r.height - 26
        page.draw_line((51, y - 8), (r.width - 51, y - 8), color=(1.0, 0.824, 0.247), width=0.8)
        page.insert_text((51, y + 4), footer_title, fontsize=7.5, color=(0.39, 0.45, 0.55), fontname="helv")
        label = "Page %d of %d" % (pno + 1, n)
        tw = fitz.get_text_length(label, fontname="helv", fontsize=7.5)
        page.insert_text((r.width - 51 - tw, y + 4), label, fontsize=7.5, color=(0.39, 0.45, 0.55), fontname="helv")
    if headings and not has_toc:
        # no contents page to read the numbers from: find each heading in the text, in order
        at = 0
        for lvl, text, i in headings:
            probe = text[:60]
            for pno in range(at, pdf.page_count):
                if pdf.load_page(pno).search_for(probe):
                    page_of[i] = str(pno + 1); at = pno
                    break
            else:
                page_of[i] = str(at + 1)
    if headings:
        outline = []
        last = 0
        for lvl, text, i in headings:
            pg = int(page_of[i]); lv = min(lvl, last + 1) if last else 1
            outline.append([lv, text, pg]); last = lv
        pdf.set_toc(outline)
    pdf.set_metadata({"title": meta_title, "author": "Alfred Paarlberg", "subject": "The Spaghetti Engine, version 0.4.0", "keywords": "fuzzy cognitive maps; system modelling; nexus", "creator": "The Spaghetti Engine documentation build"})
    if os.path.exists(out_pdf):
        os.remove(out_pdf)
    pdf.save(out_pdf, garbage=3, deflate=True)
    pdf.close()
    return n, os.path.getsize(out_pdf)

if __name__ == "__main__":
    docx_path, footer_title, out_pdf, meta_title = sys.argv[1:5]
    wd = tempfile.mkdtemp(prefix="se_pdf_")
    n, size = convert(docx_path, footer_title, out_pdf, meta_title, wd)
    print("pages", n, "size KB", size // 1024)

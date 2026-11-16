# Builds the 0.5.6 and 0.5.7 User Manual, Methodological Annex and Development Log from the 0.5.5 Word files,
# adding the update chapters of docs/update-0.5.6.md and docs/update-0.5.7.md. Then run tools/docx2pdf.py.
#   python make057.py <repo> <dir with the 0.5.5 docx> <out dir>
import copy, os, re, sys
sys.path.insert(0, os.path.join(sys.argv[1], "tools"))
import docx
from docx.oxml.ns import qn
from docx_edit import txt, style_of, set_cell_text, W_P, W_R, W_TBL, W_TR, W_TC, _set_t

REPO, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
MAN = "The Spaghetti Engine - User Manual (v{v}).docx"
ANX = "The Spaghetti Engine - Methodological Annex (v{v}).docx"
LOG = "Spaghetti_Engine_Dev_Log_v{v}.docx"


# --- the markdown text --------------------------------------------------------
def sections(md):
    """Split update-x.md into {'manual': [...], 'annex': [...], 'log': [...]} blocks."""
    out, cur = {}, None
    for part in md.split("\n---\n"):
        m = re.search(r"^## (.+)$", part, re.M)
        if not m:
            continue
        head = m.group(1)
        key = "manual" if head.startswith("User Manual") else "annex" if head.startswith("Methodological Annex") else "log"
        out[key] = blocks(part[m.start():])
    return out


def blocks(text):
    lines = text.strip("\n").split("\n")
    res, i = [], 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1; continue
        if ln.startswith("## "):
            t = ln[3:].strip()
            t = re.sub(r"^(User Manual|Methodological Annex): ", "", t)
            res.append(("h1", t))
        elif ln.startswith("### "):
            res.append(("h2", ln[4:].strip()))
        elif ln.startswith("- "):
            res.append(("li", ln[2:].strip()))
        elif ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", lines[i].strip())[1:-1]]
                if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            res.append(("table", rows[0], rows[1:]))
            continue
        else:
            res.append(("p", ln.strip()))
        i += 1
    return res


def inline(text):
    """**bold**, *italic*, `code` -> [(text, bold, italic)]"""
    out = []
    for tok in re.split(r"(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)", text):
        if not tok:
            continue
        if tok.startswith("**"):
            out.append((tok[2:-2], True, False))
        elif tok.startswith("*") and len(tok) > 1:
            out.append((tok[1:-1], False, True))
        elif tok.startswith("`"):
            out.append((tok[1:-1], False, False))
        else:
            out.append((tok, False, False))
    return out


def plain(text):
    return "".join(t for t, _, _ in inline(text))


# --- writing into a document ----------------------------------------------------
def plain_run(p):
    """A run of `p` without bold/italic, to copy formatting from."""
    for r in p.findall(W_R):
        rpr = r.find(qn("w:rPr"))
        if rpr is None or (rpr.find(qn("w:b")) is None and rpr.find(qn("w:i")) is None):
            if r.find(qn("w:t")) is not None:
                return r
    return p.findall(W_R)[-1]


def write_runs(p, segs, proto_run):
    for r in p.findall(W_R):
        p.remove(r)
    for t, b, it in segs:
        r = copy.deepcopy(proto_run)
        for child in list(r):
            if child.tag != qn("w:rPr"):
                r.remove(child)
        rpr = r.find(qn("w:rPr"))
        if rpr is None:
            rpr = r.makeelement(qn("w:rPr"), {}); r.insert(0, rpr)
        for tag in ("w:b", "w:bCs", "w:i", "w:iCs"):
            for e in rpr.findall(qn(tag)):
                rpr.remove(e)
        if b:
            rpr.append(rpr.makeelement(qn("w:b"), {}))
        if it:
            rpr.append(rpr.makeelement(qn("w:i"), {}))
        el = r.makeelement(qn("w:t"), {}); _set_t(el, t); r.append(el)
        p.append(r)


class Protos:
    def __init__(self, doc, h1, h2, p, li, tables):
        self.h1, self.h2, self.p, self.li, self.tables = h1, h2, p, li, tables


def make_par(proto, text):
    p = copy.deepcopy(proto)
    write_runs(p, inline(text), plain_run(proto))
    return p


def make_table(protos, header, rows):
    n = len(header)
    proto = next((t for t in protos.tables if len(t.findall(W_TR)[0].findall(W_TC)) == n), None)
    assert proto is not None, f"no {n}-column table to copy"
    tbl = copy.deepcopy(proto)
    trs = tbl.findall(W_TR)
    for tc, h in zip(trs[0].findall(W_TC), header):
        set_cell_text(tc, plain(h))
    rproto = trs[1]
    for tr in trs[1:]:
        tbl.remove(tr)
    last = trs[0]
    for row in rows:
        tr = copy.deepcopy(rproto)
        for tc, text in zip(tr.findall(W_TC), row):
            ps = tc.findall(W_P)
            for extra in ps[1:]:
                tc.remove(extra)
            write_runs(ps[0], inline(text), plain_run(ps[0]))
        last.addnext(tr); last = tr
    return tbl


def insert_blocks(anchor, bl, protos, skip_first_h1=False):
    """Insert blocks after `anchor`; returns the last inserted element."""
    for i, b in enumerate(bl):
        if b[0] == "h1":
            el = make_par(protos.h1, b[1])
        elif b[0] == "h2":
            el = make_par(protos.h2, b[1])
        elif b[0] == "p":
            el = make_par(protos.p, b[1])
        elif b[0] == "li":
            el = make_par(protos.li, b[1])
        else:
            el = make_table(protos, b[1], b[2])
        anchor.addnext(el); anchor = el
    return anchor


def first_par(doc, pred):
    for p in doc.element.body.iter(W_P):
        if pred(p):
            return p
    raise LookupError


def set_version(doc, old, new, limit_pars):
    n = 0
    for p in limit_pars:
        for t in p.iter(qn("w:t")):
            if t.text and old in t.text:
                t.text = t.text.replace(old, new); n += 1
    return n


# --- manual and annex ------------------------------------------------------------
def build_book(kind, src_path, chapters, version, out_path, extra_refs=None):
    doc = docx.Document(src_path)
    body = doc.element.body
    pars = list(body.iter(W_P))
    h1s = [p for p in pars if style_of(p) == "Heading1"]
    upd = [p for p in h1s if txt(p).startswith("Update for Version")]
    last_upd = upd[-1]
    first_body_h1 = h1s[h1s.index(last_upd) + 1]
    h2 = next(p for p in pars if style_of(p) == "Heading2" and txt(p).startswith("U."))
    normal = last_upd.getnext()
    li = next(p for p in pars if style_of(p) == "ListBullet" and len(p.findall(W_R)) >= 2)
    protos = Protos(doc, last_upd, h2, normal, li, list(body.iter(W_TBL)))
    anchor = first_body_h1.getprevious()
    for ch in chapters:
        anchor = insert_blocks(anchor, ch, protos)
    # version on the title page and the closing lines, not in the update chapters
    title_area = pars[: pars.index(upd[0])]
    closing = [p for p in body.iter(W_P) if txt(p).startswith("The Spaghetti Engine - ") or txt(p).startswith("To be read alongside")]
    n = set_version(doc, "0.5.5", version, title_area + closing)
    assert n >= 2, (kind, n)
    if extra_refs:
        refs_h = next(p for p in body.iter(W_P) if style_of(p) == "Heading1" and txt(p).endswith("References"))
        refs = []
        p = refs_h.getnext()
        while p is not None and p.tag == W_P and not txt(p).startswith("The Spaghetti Engine - "):
            refs.append(p); p = p.getnext()
        for ref in extra_refs:
            key = ref.split("(")[0].strip().lower()
            after = None
            for r in refs:
                if txt(r).lower() < ref.lower():
                    after = r
            new = make_par(refs[0], ref)
            (after if after is not None else refs_h).addnext(new)
            refs.insert(refs.index(after) + 1 if after is not None else 0, new)
    doc.save(out_path)


# --- development log -----------------------------------------------------------------
def build_log(src_path, bl, version, out_path):
    doc = docx.Document(src_path)
    body = doc.element.body
    kids = list(body.iterchildren())
    pars = [k for k in kids if k.tag == W_P]
    h1 = next(p for p in pars if style_of(p) == "Heading1")
    h2 = next((p for p in pars if style_of(p) == "Heading2"), h1)
    normal = h1.getnext()
    li = next(p for p in pars if style_of(p) in ("ListParagraph", "ListBullet"))
    tables = [k for k in kids if k.tag == W_TBL]
    protos = Protos(doc, h1, h2, normal, li, tables)
    title_tbl = tables[0]
    # title table rows from the "Title table" block
    i = next(k for k, b in enumerate(bl) if b[0] == "h2" and b[1] == "Title table")
    _, header, rows = bl[i + 1]
    trs = title_tbl.findall(W_TR)
    rproto = trs[1]
    for tr in trs[1:]:
        title_tbl.remove(tr)
    last = trs[0]
    for row in rows:
        tr = copy.deepcopy(rproto)
        for tc, text in zip(tr.findall(W_TC), row):
            ps = tc.findall(W_P)
            for extra in ps[1:]:
                tc.remove(extra)
            write_runs(ps[0], inline(text), plain_run(ps[0]))
        last.addnext(tr); last = tr
    # everything from the first Heading 1 to the end (except the section properties) is replaced
    start = kids.index(h1)
    protos_keep = [copy.deepcopy(x) for x in (h1, h2, normal, li)]
    protos = Protos(doc, *protos_keep, [copy.deepcopy(t) for t in tables])
    anchor = h1.getprevious()
    for k in kids[start:]:
        if k.tag != qn("w:sectPr"):
            body.remove(k)
    rest = [b for b in bl[i + 2:]]
    rest = [("h1", b[1]) if b[0] == "h2" else b for b in rest]  # "### 1. Purpose" -> Heading 1
    insert_blocks(anchor, rest, protos)
    for p in body.iter(W_P):
        for t in p.iter(qn("w:t")):
            if t.text and "0.5.5" in t.text and kids.index(h1) > 0:
                pass
    doc.save(out_path)


if __name__ == "__main__":
    up6 = sections(open(os.path.join(REPO, "docs", "update-0.5.6.md"), encoding="utf-8").read())
    up7 = sections(open(os.path.join(REPO, "docs", "update-0.5.7.md"), encoding="utf-8").read())
    refs7 = [
        "Jaccard, P. (1912). The distribution of the flora in the alpine zone. New Phytologist, 11(2), 37-50. https://doi.org/10.1111/j.1469-8137.1912.tb05611.x",
        "Kosko, B. (1988). Hidden patterns in combined and adaptive knowledge networks. International Journal of Approximate Reasoning, 2(4), 377-393. https://doi.org/10.1016/0888-613X(88)90111-9",
        "Nair, A., Reckien, D., & van Maarseveen, M. F. A. M. (2020). Generalised fuzzy cognitive maps: Considering the time dynamics between a cause and an effect. Applied Soft Computing, 92, 106309. https://doi.org/10.1016/j.asoc.2020.106309",
        "Park, K. S., & Kim, S. H. (1995). Fuzzy cognitive maps considering time relationships. International Journal of Human-Computer Studies, 42(2), 157-168. https://doi.org/10.1006/ijhc.1995.1007",
    ]
    for v, chapters_m, chapters_a, log, refs in [
        ("0.5.6", [up6["manual"]], [up6["annex"]], up6["log"], None),
        ("0.5.7", [up6["manual"], up7["manual"]], [up6["annex"], up7["annex"]], up7["log"], refs7),
    ]:
        d = os.path.join(OUT, "V" + v); os.makedirs(d, exist_ok=True)
        build_book("manual", os.path.join(SRC, MAN.format(v="0.5.5")), chapters_m, v, os.path.join(d, MAN.format(v=v)))
        build_book("annex", os.path.join(SRC, ANX.format(v="0.5.5")), chapters_a, v, os.path.join(d, ANX.format(v=v)), refs)
        build_log(os.path.join(SRC, LOG.format(v="0.5.5")), log, v, os.path.join(d, LOG.format(v=v)))
        print("built", v)

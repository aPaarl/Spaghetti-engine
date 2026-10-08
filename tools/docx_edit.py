# Helpers for editing the Spaghetti Engine Word documents (manual, annex, development log) with python-docx.
# A new version starts from the previous version's file: replace text without losing its formatting, and add
# paragraphs and tables by cloning existing ones. Used for 0.4.1; needs python-docx.
#
#   import sys; sys.path.insert(0, "tools"); from docx_edit import *
#   d = docx.Document("The Spaghetti Engine - User Manual (v0.4.1).docx")
#   replace_everywhere(d, "old text", "new text", expect=1)
import copy
import docx
from docx.oxml.ns import qn

W_T, W_R, W_P, W_TBL, W_TR, W_TC = qn("w:t"), qn("w:r"), qn("w:p"), qn("w:tbl"), qn("w:tr"), qn("w:tc")
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def txt(el):
    return "".join(t.text or "" for t in el.iter(W_T))


def style_of(p):
    s = p.find(qn("w:pPr") + "/" + qn("w:pStyle"))
    return s.get(qn("w:val")) if s is not None else ""


def body_children(doc):
    return list(doc.element.body.iterchildren())


def _set_t(t, s):
    t.text = s
    t.set(XML_SPACE, "preserve")


def sub_in_par(p, old, new, count=1):
    """Replace `old` by `new` inside paragraph `p`, even when it is split across runs.
    The replacement takes the formatting of the run where the old text starts."""
    done = 0
    while done != count:
        ts = list(p.iter(W_T))
        full = "".join(t.text or "" for t in ts)
        at = full.find(old)
        if at < 0:
            break
        end = at + len(old)
        pos = 0
        first = True
        for t in ts:
            s = t.text or ""
            lo, hi = pos, pos + len(s)
            pos = hi
            if hi <= at or lo >= end:
                continue
            a, b = max(at, lo) - lo, min(end, hi) - lo
            if first:
                _set_t(t, s[:a] + new + s[b:])
                first = False
            else:
                _set_t(t, s[:a] + s[b:])
        done += 1
    return done


def find_pars(doc, needle, exact=False):
    out = []
    for p in doc.element.body.iter(W_P):
        t = txt(p)
        if (t == needle) if exact else (needle in t):
            out.append(p)
    return out


def replace_everywhere(doc, old, new, expect=None):
    """sub_in_par on every paragraph of the body (tables and the contents list included)."""
    n = 0
    for p in doc.element.body.iter(W_P):
        if old in txt(p):
            n += sub_in_par(p, old, new, count=10)
    if expect is not None:
        assert n == expect, f"{old!r}: replaced {n}, expected {expect}"
    return n


def set_par_segments(p, segs):
    """Rewrite paragraph `p` as runs built from `segs`, a list of (text, run_prototype_index).
    Run formatting is taken from the runs the paragraph already has (index into its run list)."""
    runs = [r for r in p.findall(W_R)]
    protos = [copy.deepcopy(r) for r in runs]
    for r in runs:
        p.remove(r)
    for text, k in segs:
        r = copy.deepcopy(protos[min(k, len(protos) - 1)])
        for child in list(r):
            if child.tag != qn("w:rPr"):
                r.remove(child)
        t = r.makeelement(W_T, {})
        _set_t(t, text)
        r.append(t)
        p.append(r)
    return p


def clone_after(proto, anchor, segs=None):
    """Deep-copy paragraph/table `proto`, insert after `anchor`, optionally rewriting its text."""
    new = copy.deepcopy(proto)
    anchor.addnext(new)
    if segs is not None:
        set_par_segments(new, segs)
    return new


def clone_before(proto, anchor, segs=None):
    new = copy.deepcopy(proto)
    anchor.addprevious(new)
    if segs is not None:
        set_par_segments(new, segs)
    return new


def set_cell_text(tc, text):
    ps = tc.findall(W_P)
    for extra in ps[1:]:
        tc.remove(extra)
    p = ps[0]
    runs = p.findall(W_R)
    if not runs:
        raise ValueError("empty cell without a run to copy formatting from")
    set_par_segments(p, [(text, 0)])


def fill_table(tbl, rows):
    """Keep the header row and the first data row as prototypes; rebuild the data rows from `rows`."""
    trs = tbl.findall(W_TR)
    header, proto = trs[0], trs[1]
    for tr in trs[1:]:
        tbl.remove(tr)
    last = header
    for row in rows:
        tr = copy.deepcopy(proto)
        for tc, text in zip(tr.findall(W_TC), row):
            set_cell_text(tc, text)
        last.addnext(tr)
        last = tr
    return tbl

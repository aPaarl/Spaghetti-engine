# Builds the 0.5.8 User Manual, Methodological Annex and Development Log from the 0.5.7 Word files,
# adding the update chapters of docs/update-0.5.8.md. Then run tools/docx2pdf.py.
#   python make058.py <repo> <dir with the 0.5.7 docx> <out dir>
# The helpers come from make057.py; only the source version and the chapter list differ.
import os, sys
sys.path.insert(0, os.path.join(sys.argv[1], "tools"))
import make057 as m

REPO, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PREV, V = "0.5.7", "0.5.8"

_set_version = m.set_version
m.set_version = lambda doc, old, new, pars: _set_version(doc, PREV, new, pars)  # title page and closing lines say 0.5.7

if __name__ == "__main__":
    up8 = m.sections(open(os.path.join(REPO, "docs", "update-0.5.8.md"), encoding="utf-8").read())
    refs8 = [
        "Robinson, J. B. (1990). Futures under glass: A recipe for people who hate to predict. Futures, 22(8), 820-842. https://doi.org/10.1016/0016-3287(90)90018-D",
    ]
    d = os.path.join(OUT, "V" + V); os.makedirs(d, exist_ok=True)
    m.build_book("manual", os.path.join(SRC, m.MAN.format(v=PREV)), [up8["manual"]], V, os.path.join(d, m.MAN.format(v=V)))
    m.build_book("annex", os.path.join(SRC, m.ANX.format(v=PREV)), [up8["annex"]], V, os.path.join(d, m.ANX.format(v=V)), refs8)
    m.build_log(os.path.join(SRC, m.LOG.format(v=PREV)), up8["log"], V, os.path.join(d, m.LOG.format(v=V)))
    print("built", V)

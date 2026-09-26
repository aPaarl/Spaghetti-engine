# Writes src/docs-manifest.json (page count and size of each PDF in public/docs) for the About & documentation tab.
#
#   python tools/make_docs_manifest.py
#
# Run it after regenerating the PDFs. Needs PyMuPDF (fitz).
import json, math, os, sys
import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = json.load(open(os.path.join(ROOT, "package.json"), encoding="utf-8"))["version"]
FILES = {
    "manual": f"The-Spaghetti-Engine-User-Manual-v{VERSION}.pdf",
    "annex": f"The-Spaghetti-Engine-Methodological-Annex-v{VERSION}.pdf",
    "devlog": f"The-Spaghetti-Engine-Development-Log-v{VERSION}.pdf",
}
manifest = {"version": VERSION, "generated": __import__("datetime").date.today().isoformat(), "documents": {}}
for key, name in FILES.items():
    path = os.path.join(ROOT, "public", "docs", name)
    if not os.path.exists(path):
        sys.exit("missing " + path)
    doc = fitz.open(path)
    manifest["documents"][key] = {"file": name, "pages": doc.page_count, "sizeKB": math.ceil(os.path.getsize(path) / 1024)}
    doc.close()
with open(os.path.join(ROOT, "src", "docs-manifest.json"), "w", encoding="utf-8") as fh:
    json.dump(manifest, fh, indent=2)
print(json.dumps(manifest["documents"], indent=2))

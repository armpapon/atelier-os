// jsdom cannot load pdfjs-dist (DOMMatrix). The mounted tests exercise the
// CSV paths; PDF parsing itself is out of scope here (its row identity and
// synthetic-seconds behaviour are covered in audit/evidence.mjs + code).
export async function parseKBankPDF() {
  throw new Error('parseKBankPDF is not available in the jsdom test rig');
}

// ════════════════════════════════════════════════════════════════════════════
//  style-scan.mjs — render-aware style inventory for src/  (v4.58 · audit A11 r2)
//
//  WHY THIS EXISTS
//  v4.57 guarded the typography rules with a regex that looked at the first
//  literal text node after each `var(--f-mono)`. That is a proximity heuristic,
//  not an answer to the question being asked ("what text does this style
//  actually paint?"), and it reported a false PASS while four real violations
//  sat in HEAD. The auditor named the four shapes it cannot see:
//
//    (a) JSX expression children      <div style={mono}>{info.count} trade</div>
//    (b) text from a constant         WEEKDAYS = ['จ','อ',…]  →  {w}
//        (including via a function)   fmtYM() → THAI_MONTHS_SHORT[m-1]
//    (c) SVG inside a template string `<text font-family="var(--f-mono)">ไทย</text>`
//    (d) a style object reached
//        through a variable           style={MONO_LABEL} / {{...mono10, …}}
//
//  So this module parses each file with @babel/parser and answers the question
//  structurally: for every JSX element (and every element inside an SVG
//  template string) it resolves BOTH the effective style AND the text that
//  element renders, following constants, functions, spreads and ternaries.
//
//  It is deliberately conservative in one direction only: when it cannot
//  resolve something it reports the text it *did* find rather than assuming
//  the element is clean. A guard that guesses "clean" is how r1 failed.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from '@babel/parser';

export const MONO = 'var(--f-mono)';
// Thai LETTERS only. The whole Thai block would also match '฿' (U+0E3F) and
// the Thai digits, so every ฿ figure would look like prose — which is how a
// handful of pure money cells first got swept off the monospace face.
const THAI = /[\u0E01-\u0E3A\u0E40-\u0E4E]/;

/** Every source file the style rules apply to. */
export function srcFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(e.name)) out.push(p);
    }
  })(root);
  return out.sort();
}

export function relPath(root, p) {
  return relative(root, p).split(sep).join('/');
}

const ast = (code) => parse(code, {
  sourceType: 'module',
  plugins: ['jsx'],
  errorRecovery: true,
});

/** Depth-first walk over a Babel AST. `visit` may return false to skip a subtree. */
function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, node); }
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

// ── (b) + (d) · a module's resolvable bindings ─────────────────────────────
//
// `const X = { … }`  → the object, so a style reached through a variable can be
//                      merged (d)
// `const X = ['จ',…]` → its strings, so text reached through a constant can be
//                      read (b)
// `function f() {…}`  → every string the body can produce, which is what makes
//                      fmtYM() → THAI_MONTHS_SHORT[m-1] visible (b)
function bindings(tree) {
  const objects = new Map();   // name → ObjectExpression
  const strings = new Map();   // name → string[]  (arrays, object values, plain literals)
  const fns = new Map();       // name → function node
  const arrays = new Map();    // name → ArrayExpression
  const plainArrays = new Set(); // arrays whose elements are all string literals

  const literalsOf = (node) => {
    const out = [];
    walk(node, (n) => {
      if (n.type === 'StringLiteral') out.push(n.value);
      else if (n.type === 'TemplateElement') out.push(n.value.cooked ?? n.value.raw ?? '');
    });
    return out;
  };

  // `WEEKDAYS.map(w => …)` binds `w` to the strings of WEEKDAYS — without this
  // the text of every mapped list is invisible, the (b) counterexample.
  //
  // Precision matters here. For an array of OBJECTS, binding the param to every
  // string in the array is wrong: `rows.map(s => <div>{s.n}</div>)` would drag
  // in the words of every OTHER field and cry wolf. So an object array binds
  // per FIELD (`s.n` → only the `n` values), and only a plain string array
  // binds the bare parameter.
  const arrayFields = (arr) => {
    const fields = new Map();
    for (const el of arr.elements || []) {
      if (el?.type !== 'ObjectExpression') continue;
      for (const p of el.properties) {
        if (p.type !== 'ObjectProperty') continue;
        const key = p.key?.name ?? p.key?.value;
        if (!key) continue;
        const vals = literalsOf(p.value);
        if (vals.length) fields.set(key, [...(fields.get(key) || []), ...vals]);
      }
    }
    return fields;
  };
  const bindMapParams = () => {
    walk(tree, (n) => {
      if (n.type !== 'CallExpression') return;
      const callee = n.callee;
      if (callee?.type !== 'MemberExpression') return;
      if (!['map', 'flatMap', 'forEach'].includes(callee.property?.name)) return;
      const srcName = callee.object?.type === 'Identifier' ? callee.object.name : null;
      if (!srcName) return;
      const arr = arrays.get(srcName);
      const cb = n.arguments[0];
      if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) return;
      const p = cb.params[0];
      if (!p) return;
      const fields = arr ? arrayFields(arr) : new Map();
      if (fields.size) {
        // array of objects → bind `param.field`
        if (p.type === 'Identifier') {
          for (const [k, v] of fields) strings.set(`${p.name}.${k}`, v);
        } else if (p.type === 'ObjectPattern') {
          for (const prop of p.properties) {
            if (prop.type !== 'ObjectProperty') continue;
            const key = prop.key?.name ?? prop.key?.value;
            if (key && fields.has(key) && prop.value?.type === 'Identifier') {
              strings.set(prop.value.name, fields.get(key));
            }
          }
        }
        return;
      }
      // array of plain strings → the bare parameter IS the text
      if (plainArrays.has(srcName) && p.type === 'Identifier') strings.set(p.name, strings.get(srcName));
    });
  };

  walk(tree, (n) => {
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.init) {
      const name = n.id.name;
      if (n.init.type === 'ObjectExpression') objects.set(name, n.init);
      if (n.init.type === 'ArrayExpression') {
        arrays.set(name, n.init);
        if (n.init.elements.length && n.init.elements.every(e => e?.type === 'StringLiteral')) plainArrays.add(name);
      }
      if (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression') fns.set(name, n.init);
      const lits = literalsOf(n.init);
      if (lits.length) strings.set(name, lits);
    }
    if (n.type === 'FunctionDeclaration' && n.id?.name) fns.set(n.id.name, n);
  });
  bindMapParams();
  return { objects, strings, fns, literalsOf, plainArrays };
}

// ── (d) · the effective style of a JSX element ─────────────────────────────
//
// Handles the literal object, spreads of known objects, `style={CONST}`, and
// conditional styles — anything that can put --f-mono on this element.
function styleUsesMono(attrValue, b, seen = new Set()) {
  if (!attrValue) return false;
  let hit = false;
  const consider = (node) => {
    if (!node || hit) return;
    if (node.type === 'ObjectExpression') {
      for (const p of node.properties) {
        if (p.type === 'SpreadElement' || p.type === 'SpreadProperty') { consider(p.argument); continue; }
        const v = p.value;
        if (v?.type === 'StringLiteral' && v.value.includes(MONO)) { hit = true; return; }
        // fontFamily: cond ? 'var(--f-mono)' : '…'
        if (v) walk(v, (x) => { if (x.type === 'StringLiteral' && x.value.includes(MONO)) hit = true; });
      }
      return;
    }
    if (node.type === 'Identifier') {
      if (seen.has(node.name)) return;
      seen.add(node.name);
      const obj = b.objects.get(node.name);
      if (obj) consider(obj);
      return;
    }
    if (node.type === 'ConditionalExpression') { consider(node.consequent); consider(node.alternate); return; }
    if (node.type === 'JSXExpressionContainer') { consider(node.expression); return; }
    if (node.type === 'StringLiteral' && node.value.includes(MONO)) { hit = true; return; }
    if (node.type === 'LogicalExpression') { consider(node.left); consider(node.right); return; }
  };
  consider(attrValue);
  return hit;
}

// ── (a) + (b) · the text a JSX element renders ─────────────────────────────
//
// Literal children, plus every string an expression child can evaluate to:
// ternaries, template literals, constants, and the bodies of local functions
// those expressions call.
function renderedText(el, b, depth = 0) {
  const parts = [];
  const seenFns = new Set();

  // A small evaluator rather than a blind walk. The distinction that matters:
  // a call's ARGUMENTS are inputs, not output — `d.toLocaleString('th-TH', {
  // month: 'short' })` renders a date, not the words "th-TH" and "short". Only
  // what an expression can EVALUATE to counts as rendered text.
  const evaluate = (node, d) => {
    if (!node || d > 4) return;
    switch (node.type) {
      case 'StringLiteral':
        parts.push(node.value); return;
      case 'TemplateLiteral':
        for (const q of node.quasis) parts.push(q.value.cooked ?? q.value.raw ?? '');
        for (const e of node.expressions) evaluate(e, d + 1);
        return;
      case 'ConditionalExpression':
        evaluate(node.consequent, d); evaluate(node.alternate, d); return;
      case 'LogicalExpression':
        evaluate(node.left, d); evaluate(node.right, d); return;
      case 'BinaryExpression':
        if (node.operator === '+') { evaluate(node.left, d); evaluate(node.right, d); }
        return;
      case 'JSXExpressionContainer':
        evaluate(node.expression, d); return;
      case 'JSXFragment':
        for (const c of node.children || []) {
          if (c.type === 'JSXText') parts.push(c.value);
          else if (c.type === 'JSXExpressionContainer') evaluate(c.expression, d);
        }
        return;
      case 'Identifier': {
        const lits = b.strings.get(node.name);
        if (lits) parts.push(...lits);
        return;
      }
      case 'MemberExpression': {
        const rootName = node.object?.type === 'Identifier' ? node.object.name : null;
        if (!rootName) return;
        if (node.computed) {
          // THAI_MONTHS_SHORT[m - 1] · KEY_LABEL[k] — the whole table is in play
          if (b.strings.has(rootName)) parts.push(...b.strings.get(rootName));
          return;
        }
        // s.label — ONLY that field, never its siblings
        const key = node.property?.name;
        const composite = b.strings.get(`${rootName}.${key}`);
        if (composite) { parts.push(...composite); return; }
        if (b.plainArrays?.has(rootName)) parts.push(...b.strings.get(rootName));
        return;
      }
      case 'CallExpression': {
        // resolve a LOCAL function by its return value; ignore its arguments,
        // and ignore built-ins whose output is a number or a date
        const callee = node.callee;
        const name = callee?.type === 'Identifier' ? callee.name : null;
        if (!name || seenFns.has(name)) return;
        const fn = b.fns.get(name);
        if (!fn) return;
        seenFns.add(name);
        returnsOf(fn).forEach(r => evaluate(r, d + 1));
        return;
      }
      case 'JSXElement':
        return;                       // a nested element paints its own text
      default:
        return;
    }
  };

  // every value a function body can return
  const returnsOf = (fn) => {
    const out = [];
    if (fn.body && fn.body.type !== 'BlockStatement') { out.push(fn.body); return out; }
    walk(fn.body, (n) => {
      if (n.type === 'ReturnStatement' && n.argument) out.push(n.argument);
      if (n.type === 'FunctionDeclaration' || n.type === 'ArrowFunctionExpression') return false;
    });
    return out;
  };

  for (const child of el.children || []) {
    if (child.type === 'JSXText') parts.push(child.value);
    else if (child.type === 'JSXExpressionContainer') evaluate(child.expression, depth);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ── (c) · SVG written as a template string ─────────────────────────────────
//
// These never reach the JSX AST, so the markup is walked directly: pair each
// element's font-family with the text it wraps.
function svgStringSites(rel, code, tree) {
  const out = [];
  walk(tree, (n) => {
    if (n.type !== 'TemplateLiteral' && n.type !== 'StringLiteral') return;
    const raw = n.type === 'StringLiteral'
      ? n.value
      : n.quasis.map(q => q.value.cooked ?? q.value.raw ?? '').join(' ');
    if (!raw.includes('<svg') && !raw.includes('<text')) return;
    const line0 = n.loc?.start.line ?? 0;
    // NOTE the lookahead: consuming the next '<' would let an element hide
    // behind its sibling, which is how the (c) negative case first slipped by.
    for (const m of raw.matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*)>([^<]*)(?=<)/g)) {
      const [, tag, attrs, text] = m;
      if (!attrs.includes(MONO)) continue;
      out.push({
        file: rel,
        line: line0 + raw.slice(0, m.index).split('\n').length - 1,
        via: `svg-string <${tag}>`,
        text: text.trim(),
      });
    }
  });
  return out;
}

/**
 * Every place --f-mono is applied, with the text it actually paints.
 * Returns [{ file, line, via, text }].
 */
export function monoSitesIn(rel, code) {
  const out = [];
  {
    if (!code.includes(MONO)) return out;
    let tree;
    try { tree = ast(code); } catch { return [{ file: rel, line: 0, via: 'PARSE-ERROR', text: '' }]; }
    const b = bindings(tree);

    walk(tree, (n) => {
      if (n.type !== 'JSXElement') return;
      const open = n.openingElement;
      const styleAttr = open.attributes.find(a =>
        a.type === 'JSXAttribute' && a.name?.name === 'style');
      const fontAttr = open.attributes.find(a =>
        a.type === 'JSXAttribute' && (a.name?.name === 'fontFamily' || a.name?.name === 'font-family'));
      const usesMono =
        (styleAttr && styleUsesMono(styleAttr.value, b)) ||
        (fontAttr && styleUsesMono(fontAttr.value, b));
      if (!usesMono) return;
      const tag = open.name?.name || open.name?.property?.name || '?';
      out.push({
        file: rel,
        line: open.loc?.start.line ?? 0,
        via: `<${tag}>`,
        text: renderedText(n, b),
      });
    });

    out.push(...svgStringSites(rel, code, tree));
  }
  return out;
}

/** Every place --f-mono is applied across src/, with the text it paints. */
export function monoSites(root) {
  const out = [];
  for (const file of srcFiles(root)) out.push(...monoSitesIn(relPath(root, file), readFileSync(file, 'utf8')));
  return out;
}

/** Sites whose painted text reads as WORDS rather than a figure or a token. */
export function wordsAmong(sites, tokenAllow = []) {
  const isToken = (w) => tokenAllow.includes(w);
  return sites.filter(s => {
    if (!s.text) return false;
    // <code> declares its own content to be code — monospace is the point.
    if (s.via === '<code>') return false;
    if (THAI.test(s.text)) return true;
    // a Latin run of 3+ letters that is not an accepted token reads as a word
    const words = (s.text.match(/[A-Za-z][A-Za-z.]{2,}/g) || []).filter(w => !isToken(w));
    return words.length > 0;
  });
}

/** Sites in src/ whose painted text reads as words. */
export function monoOnWords(root, tokenAllow = []) {
  return wordsAmong(monoSites(root), tokenAllow);
}

// ── emoji, at exact declaration level ──────────────────────────────────────
const PICT = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{2713}\u{2714}\u{2717}\u{2718}]/u;

/**
 * Every emoji-bearing string, tagged with the NAMED declaration that holds it.
 * v4.57 exempted whole files, so a new UI emoji could hide inside a file that
 * legitimately stores data emoji. The unit here is `file::BINDING`.
 */
export function emojiSitesIn(rel, code) {
  const out = [];
  {
    if (!PICT.test(code)) return out;
    let tree;
    try { tree = ast(code); } catch { return out; }

    // name every node by the nearest enclosing named binding
    const owner = new Map();
    const nameStack = [];
    (function walkNamed(node, parent) {
      if (!node || typeof node.type !== 'string') return;
      let pushed = false;
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') { nameStack.push(node.id.name); pushed = true; }
      else if (node.type === 'FunctionDeclaration' && node.id?.name) { nameStack.push(node.id.name); pushed = true; }
      else if (node.type === 'ClassMethod' && node.key?.name) { nameStack.push(node.key.name); pushed = true; }
      if (node.type === 'StringLiteral' || node.type === 'TemplateElement' || node.type === 'JSXText' || node.type === 'RegExpLiteral') {
        owner.set(node, nameStack[nameStack.length - 1] || '(module)');
      }
      for (const key of Object.keys(node)) {
        if (key === 'loc') continue;
        const v = node[key];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walkNamed(c, node); }
        else if (v && typeof v.type === 'string') walkNamed(v, node);
      }
      if (pushed) nameStack.pop();
    })(tree, null);

    walk(tree, (n) => {
      let text = null;
      if (n.type === 'StringLiteral') text = n.value;
      else if (n.type === 'TemplateElement') text = n.value.cooked ?? n.value.raw ?? '';
      else if (n.type === 'JSXText') text = n.value;
      else if (n.type === 'RegExpLiteral') text = n.pattern;
      if (!text || !PICT.test(text)) return;
      out.push({
        file: rel,
        binding: owner.get(n) || '(module)',
        line: n.loc?.start.line ?? 0,
        text: text.replace(/\s+/g, ' ').trim().slice(0, 60),
      });
    });
  }
  return out;
}

/** Every emoji-bearing string in src/, tagged `file::BINDING`. */
export function emojiSites(root) {
  const out = [];
  for (const file of srcFiles(root)) out.push(...emojiSitesIn(relPath(root, file), readFileSync(file, 'utf8')));
  return out;
}

// ── icon-only interactive controls ─────────────────────────────────────────
//
// v4.57 string-matched lowercase `<button>` only, so a shared <Button> wrapper
// or an <a> could lose its name unnoticed.
const NATIVE_INTERACTIVE = new Set(['button', 'a']);

/**
 * Text an element renders anywhere in its SUBTREE.
 *
 * This is the accessible-name question, and it is NOT the same question the
 * font asks: a font paints only its own direct children, but a control's name
 * is computed from everything inside it. Conflating the two is why the first
 * AST pass flagged eleven perfectly well-named buttons.
 */
function subtreeText(el, b) {
  let out = renderedText(el, b);
  for (const child of el.children || []) {
    if (child.type === 'JSXElement') {
      if (child.openingElement.name?.name === 'Icon') continue;   // the artwork
      out += ' ' + subtreeText(child, b);
    } else if (child.type === 'JSXFragment') {
      out += ' ' + subtreeText(child, b);
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Does this subtree contain an expression child whose text we cannot resolve?
 * `{item.label}` inside a `.map()` is the common case: the words arrive from a
 * prop, so the element is NOT icon-only even though no literal text is visible.
 */
function hasUnresolvedChild(el) {
  let found = false;
  const scan = (node) => {
    for (const c of node.children || []) {
      if (found) return;
      if (c.type === 'JSXExpressionContainer') {
        // an expression that is only an <Icon> (or nothing) renders no words
        let onlyIcon = true;
        walk(c.expression, (x) => {
          if (x.type === 'JSXElement' && x.openingElement.name?.name !== 'Icon') onlyIcon = false;
          if (x.type === 'StringLiteral' && x.value.trim()) onlyIcon = false;
          if (x.type === 'Identifier' || x.type === 'MemberExpression' || x.type === 'CallExpression') onlyIcon = false;
        });
        if (!onlyIcon) { found = true; return; }
      } else if (c.type === 'JSXElement') {
        if (c.openingElement.name?.name !== 'Icon') scan(c);
      } else if (c.type === 'JSXFragment') scan(c);
    }
  };
  scan(el);
  return found;
}

/** Components in src/ whose own markup ROOTS at a <button> or <a>. */
export function interactiveComponents(root) {
  const names = new Set();
  const rootTag = (fnNode) => {
    // the JSX element a component returns, ignoring wrappers it renders inside
    let tag = null;
    const bodies = [];
    walk(fnNode, (n) => {
      if (n.type === 'ReturnStatement' && n.argument) bodies.push(n.argument);
      if (n.type === 'ArrowFunctionExpression' && n.body?.type === 'JSXElement') bodies.push(n.body);
    });
    for (const bnode of bodies) {
      let el = bnode;
      // unwrap `cond ? <a/> : <b/>` and `cond && <x/>` to their JSX
      while (el && el.type !== 'JSXElement') {
        if (el.type === 'ConditionalExpression') el = el.consequent;
        else if (el.type === 'LogicalExpression') el = el.right;
        else if (el.type === 'ParenthesizedExpression') el = el.expression;
        else break;
      }
      if (el?.type === 'JSXElement') {
        const t = el.openingElement.name?.name;
        if (NATIVE_INTERACTIVE.has(t)) { tag = t; break; }
      }
    }
    return tag;
  };
  for (const file of srcFiles(root)) {
    const code = readFileSync(file, 'utf8');
    let tree;
    try { tree = ast(code); } catch { continue; }
    walk(tree, (n) => {
      const name = (n.type === 'FunctionDeclaration' || n.type === 'VariableDeclarator') ? n.id?.name : null;
      if (!name || !/^[A-Z]/.test(name)) return;
      const fn = n.type === 'FunctionDeclaration' ? n
        : (n.init?.type === 'ArrowFunctionExpression' || n.init?.type === 'FunctionExpression') ? n.init : null;
      if (fn && rootTag(fn)) names.add(name);
    });
  }
  return names;
}

/** Interactive elements whose only content is an <Icon> and which have no name. */
export function unnamedIconControlsIn(rel, code, custom = new Set()) {
  const out = [];
  {
    if (!code.includes('<Icon')) return out;
    let tree;
    try { tree = ast(code); } catch { return out; }
    const b = bindings(tree);

    walk(tree, (n) => {
      if (n.type !== 'JSXElement') return;
      const open = n.openingElement;
      const tag = open.name?.name;
      if (!tag) return;
      const interactive = NATIVE_INTERACTIVE.has(tag) || custom.has(tag) || /Button$|Link$/.test(tag);
      if (!interactive) return;

      // does it contain an <Icon> anywhere inside?
      let hasIcon = false, iconSelfNames = false;
      for (const child of n.children || []) {
        walk(child, (x) => {
          if (x.type === 'JSXElement' && x.openingElement.name?.name === 'Icon') {
            hasIcon = true;
            if (x.openingElement.attributes.some(a => a.type === 'JSXAttribute' && a.name?.name === 'label')) {
              iconSelfNames = true;
            }
          }
        });
      }
      if (!hasIcon) return;

      const named = open.attributes.some(a =>
        a.type === 'JSXAttribute' && ['aria-label', 'aria-labelledby'].includes(a.name?.name));
      if (named || iconSelfNames) return;

      // Any text anywhere inside — literal, through an expression, or nested.
      if (subtreeText(n, b)) return;
      // Anything we could NOT resolve (an expression child like {item.label},
      // whose value lives in a prop) might well render words. Flag only what is
      // PROVABLY icon-only: an accessibility guard that cries wolf gets muted,
      // and the real misses are the buttons that hold nothing but the icon.
      if (hasUnresolvedChild(n)) return;

      out.push({ file: rel, line: open.loc?.start.line ?? 0, tag });
    });
  }
  return out;
}

/** Icon-only interactive controls in src/ that compute an empty name. */
export function unnamedIconControls(root) {
  const custom = interactiveComponents(root);
  const out = [];
  for (const file of srcFiles(root)) {
    out.push(...unnamedIconControlsIn(relPath(root, file), readFileSync(file, 'utf8'), custom));
  }
  return out;
}

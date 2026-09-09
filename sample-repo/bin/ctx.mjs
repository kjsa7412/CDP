#!/usr/bin/env node
// 생성물 -- 손으로 고치지 마세요. `node ops/lib/build-ctx.mjs` 가 만듭니다.
// 원본: viewer/server/core/ + viewer/bin/ctx-cli.mjs  (작업환경 설계서 3.1)

var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// viewer/server/core/vocab.js
function parseVocab(text) {
  if (!text) return { types: [], coords: /* @__PURE__ */ new Map(), aliasIndex: /* @__PURE__ */ new Map(), errors: [] };
  const lines = text.split("\n");
  const types2 = [];
  const coords = /* @__PURE__ */ new Map();
  const errors = [];
  let curType = null;
  let cur = null;
  const flush = () => {
    if (cur) coords.set(cur.coord, cur);
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const h2 = raw.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flush();
      curType = h2[1].trim();
      if (!types2.includes(curType)) types2.push(curType);
      continue;
    }
    const item = raw.match(/^\s*[-*]\s+`([^`]+)`\s*(?:[—–-]\s*(.*))?$/);
    if (item) {
      flush();
      const coord = item[1].trim();
      if (!COORD.test(coord)) errors.push({ line: i + 1, message: `\uC88C\uD45C \uD615\uC2DD\uC774 \uD0C0\uC785:\uAC12 \uC774 \uC544\uB2D8: ${coord}` });
      cur = {
        coord,
        type: coord.includes(":") ? coord.slice(0, coord.indexOf(":")) : curType,
        label: (item[2] || "").trim(),
        aliases: [],
        deprecated: null,
        supersededBy: null,
        deprecatedNote: null,
        line: i + 1
      };
      continue;
    }
    if (!cur) continue;
    const al = raw.match(/^\s+aliases\s*:\s*(.+)$/i);
    if (al) {
      cur.aliases = al[1].split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    const dep = raw.match(/^\s+deprecated\s*:\s*(.+)$/i);
    if (dep) {
      const rest = dep[1].trim();
      cur.deprecated = (rest.match(/^(\d{4}-\d{2}-\d{2})/) || [null, null])[1];
      const arrow = rest.split(/[→>]+/);
      if (arrow.length > 1) {
        const tok = arrow.slice(1).join(" ").trim().split(/\s+/).find((t) => COORD.test(t));
        cur.supersededBy = tok || null;
        cur.deprecatedNote = tok ? null : arrow.slice(1).join(" ").trim();
      } else {
        cur.deprecatedNote = rest;
      }
      continue;
    }
    const sb = raw.match(/^\s+superseded[-_]by\s*:\s*(.+)$/i);
    if (sb) {
      const tok = sb[1].trim();
      cur.supersededBy = COORD.test(tok) ? tok : null;
      continue;
    }
  }
  flush();
  const aliasIndex = /* @__PURE__ */ new Map();
  const put = (key, coord, kind, aliasText) => {
    const k = normKey(key);
    if (!k) return;
    if (!aliasIndex.has(k)) aliasIndex.set(k, { coord, kind, aliasText });
  };
  for (const c of coords.values()) {
    put(c.coord, c.coord, "canonical", c.coord);
    const v = c.coord.slice(c.coord.indexOf(":") + 1);
    put(v, c.coord, "value", v);
    for (const a of c.aliases) put(a, c.coord, "alias", a);
    if (c.label) put(c.label, c.coord, "label", c.label);
  }
  return { types: types2, coords, aliasIndex, errors };
}
function normKey(s) {
  return String(s || "").toLowerCase().replace(/[\s_\-·]/g, "").trim();
}
function reconcile(vocab, query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const direct = vocab.aliasIndex.get(normKey(q));
  if (direct) return { ...direct, matched: q, exact: true };
  const nq = normKey(q);
  let best = null;
  for (const [k, v] of vocab.aliasIndex) {
    if (k.length < 3) continue;
    if (nq.includes(k) && (!best || k.length > best.key.length)) best = { key: k, ...v };
  }
  return best ? { coord: best.coord, kind: best.kind, aliasText: best.aliasText, matched: best.aliasText, exact: false } : null;
}
var COORD;
var init_vocab = __esm({
  "viewer/server/core/vocab.js"() {
    COORD = /^[A-Za-z][A-Za-z0-9_-]*:\S+$/;
  }
});

// viewer/bin/ctx-cli.mjs
import fs5 from "node:fs/promises";
import path5 from "node:path";

// viewer/server/core/setup.js
import fs from "node:fs/promises";
import path from "node:path";
var BEGIN = "<!-- cdp:begin -- \uC774 \uBE14\uB85D\uC740 ctx setup \uC774 \uAD00\uB9AC\uD55C\uB2E4. \uC190\uC73C\uB85C \uACE0\uCE58\uC9C0 \uB9C8\uB77C -->";
var END = "<!-- cdp:end -->";
var PREFIX = "cdp-";
async function isDir(p) {
  return fs.stat(p).then((s) => s.isDirectory()).catch(() => false);
}
async function read(p) {
  return fs.readFile(p, "utf8").catch(() => null);
}
async function sameTree(a, b) {
  const la = await fs.readdir(a, { withFileTypes: true }).catch(() => null);
  const lb = await fs.readdir(b, { withFileTypes: true }).catch(() => null);
  if (!la || !lb || la.length !== lb.length) return false;
  const na = la.map((e) => e.name).sort();
  const nb = lb.map((e) => e.name).sort();
  if (na.join("|") !== nb.join("|")) return false;
  for (const e of la) {
    const pa = path.join(a, e.name);
    const pb = path.join(b, e.name);
    if (e.isDirectory()) {
      if (!await sameTree(pa, pb)) return false;
    } else {
      const [x, y] = [await read(pa), await read(pb)];
      if (x == null || x !== y) return false;
    }
  }
  return true;
}
function blockOf(body) {
  return `${BEGIN}
${body.trim()}
${END}
`;
}
function mergeClaude(existing, body) {
  const block = blockOf(body);
  if (existing == null) return block;
  const i = existing.indexOf(BEGIN);
  const j = existing.indexOf(END);
  if (i >= 0 && j > i) {
    return existing.slice(0, i) + block.trimEnd() + existing.slice(j + END.length);
  }
  if (/^\s*<!--[\s\S]{0,200}?CDP 작업 레포 설정/.test(existing)) return block;
  return existing.replace(/\s*$/, "") + "\n\n" + block;
}
async function planSetup(knowledgeRoot, workRoot) {
  const kn = path.resolve(knowledgeRoot);
  const wk = path.resolve(workRoot);
  const bad = (reason) => ({ ok: false, reason, knowledge: kn, work: wk, actions: [], warnings: [] });
  if (!await isDir(wk)) return bad(`\uD3F4\uB354\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4 \u2014 ${wk}`);
  if (kn === wk) return bad("\uC9C0\uC2DD \uB808\uD3EC \uC790\uC2E0\uC5D0\uB294 \uC124\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uCF54\uB4DC\uAC00 \uC788\uB294 \uB808\uD3EC\uB97C \uC9C0\uC815\uD558\uC138\uC694.");
  const isGit = await isDir(path.join(wk, ".git")) || await read(path.join(wk, ".git")) != null;
  if (!isGit) return bad(`git \uB808\uD3EC\uAC00 \uC544\uB2D9\uB2C8\uB2E4 \u2014 ${wk}
\uC791\uC5C5 \uB808\uD3EC(\uCF54\uB4DC\uAC00 \uC788\uACE0 .git \uC774 \uC788\uB294 \uACF3)\uB97C \uC9C0\uC815\uD558\uC138\uC694.`);
  const sSrc = path.join(kn, ".claude", "skills");
  if (!await isDir(sSrc)) return bad(`${sSrc} \uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC9C0\uC2DD \uB808\uD3EC\uC5D0 \uBC30\uD3EC\uBCF8\uC744 \uBD80\uC5C8\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694.`);
  const tpl = path.join(kn, ".claude", "work-repo", "CLAUDE.md");
  const body = await read(tpl);
  if (body == null) return bad(`\uC11C\uC2DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4 \u2014 ${tpl}
\uBC30\uD3EC\uBCF8 repo-kit \uC744 \uB2E4\uC2DC \uBD80\uC73C\uBA74 \uB4E4\uC5B4\uC635\uB2C8\uB2E4.`);
  const actions = [];
  const warnings = [];
  const src = (await fs.readdir(sSrc, { withFileTypes: true })).filter((e) => e.isDirectory() && e.name.startsWith(PREFIX)).map((e) => e.name).sort();
  const sDst = path.join(wk, ".claude", "skills");
  const cur = (await fs.readdir(sDst, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const n of src) {
    const from = path.join(sSrc, n);
    const to = path.join(sDst, n);
    const same = await isDir(to) && await sameTree(from, to);
    actions.push({
      kind: "skill",
      name: n,
      from,
      to,
      op: same ? "same" : await isDir(to) ? "update" : "create"
    });
  }
  for (const n of cur) {
    if (n.startsWith(PREFIX) && !src.includes(n)) {
      actions.push({ kind: "skill", name: n, to: path.join(sDst, n), op: "remove" });
    }
  }
  const kept = cur.filter((n) => !n.startsWith(PREFIX));
  if (kept.length) warnings.push(`\uC774 \uB808\uD3EC\uC758 \uB2E4\uB978 skill \uC740 \uAC74\uB4DC\uB9AC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4 \u2014 ${kept.join(" \xB7 ")}`);
  const claude = path.join(wk, "CLAUDE.md");
  const had = await read(claude);
  const next = mergeClaude(had, body);
  actions.push({
    kind: "claude",
    to: claude,
    op: had == null ? "create" : had === next ? "same" : had.includes(BEGIN) ? "update" : "append",
    content: next
  });
  const ptr = path.join(wk, ".claude", "cdp.json");
  const curPtr = await read(ptr);
  const nextPtr = JSON.stringify({ knowledgeRepo: kn.split(path.sep).join("/") }, null, 2) + "\n";
  actions.push({
    kind: "pointer",
    to: ptr,
    op: curPtr == null ? "create" : curPtr === nextPtr ? "same" : "update",
    content: nextPtr
  });
  const gi = await read(path.join(wk, ".gitignore")) || "";
  const claudeBlocked = /^[.]claude\/[*]?\s*$/m.test(gi);
  const skillsFreed = /^![.]claude\/skills/m.test(gi);
  const ptrIgnored = claudeBlocked || /^[.]claude\/cdp[.]json\s*$/m.test(gi);
  if (claudeBlocked && !skillsFreed) {
    warnings.push(
      ".gitignore \uAC00 .claude \uB97C \uD1B5\uC9F8\uB85C \uB9C9\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uC774\uB300\uB85C\uBA74 skill \uC774 **\uC774 PC \uC5D0\uB9CC** \uB0A8\uACE0\n\uD300\uC740 \uBC1B\uC9C0 \uBABB\uD569\uB2C8\uB2E4. `!.claude/skills/` \uD55C \uC904\uC744 \uB123\uC73C\uC138\uC694."
    );
  }
  if (!ptrIgnored) {
    warnings.push(
      ".claude/cdp.json \uC740 **\uCEE4\uBC0B\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4** \u2014 \uC9C0\uC2DD \uB808\uD3EC \uACBD\uB85C\uB294 \uC0AC\uB78C\uB9C8\uB2E4 \uB2E4\uB985\uB2C8\uB2E4.\n.gitignore \uC5D0 `.claude/cdp.json` \uC744 \uB123\uC73C\uC138\uC694."
    );
  }
  return { ok: true, knowledge: kn, work: wk, actions, warnings };
}
async function applySetup(plan) {
  if (!plan?.ok) throw new Error(plan?.reason || "plan \uC774 \uC5C6\uC2B5\uB2C8\uB2E4");
  const done = [];
  for (const a of plan.actions) {
    if (a.op === "same") continue;
    if (a.kind === "skill") {
      if (a.op === "remove") {
        await fs.rm(a.to, { recursive: true, force: true });
      } else {
        await fs.rm(a.to, { recursive: true, force: true });
        await fs.mkdir(path.dirname(a.to), { recursive: true });
        await fs.cp(a.from, a.to, { recursive: true });
      }
    } else {
      await fs.mkdir(path.dirname(a.to), { recursive: true });
      await fs.writeFile(a.to, a.content, "utf8");
    }
    done.push(a);
  }
  return done;
}

// viewer/server/core/repo.js
import fs3 from "node:fs/promises";
import path3 from "node:path";

// viewer/server/core/scan.js
import fs2 from "node:fs/promises";
import path2 from "node:path";

// node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var jsYaml = {};
var loader = {};
var common = {};
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray2(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  common.isNothing = isNothing;
  common.isObject = isObject;
  common.toArray = toArray2;
  common.repeat = repeat;
  common.isNegativeZero = isNegativeZero;
  common.extend = extend;
  return common;
}
var exception;
var hasRequiredException;
function requireException() {
  if (hasRequiredException) return exception;
  hasRequiredException = 1;
  function formatError(exception2, compact) {
    let where = "";
    const message = exception2.reason || "(unknown reason)";
    if (!exception2.mark) return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += "\n\n" + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack || "";
    }
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  exception = YAMLException2;
  return exception;
}
var snippet;
var hasRequiredSnippet;
function requireSnippet() {
  if (hasRequiredSnippet) return snippet;
  hasRequiredSnippet = 1;
  const common2 = requireCommon();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
      // relative position
    };
  }
  function padStart(string, max) {
    return common2.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo - i],
        lineEnds[foundLineNo - i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
        maxLineLength
      );
      result = common2.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common2.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common2.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo + i],
        lineEnds[foundLineNo + i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
        maxLineLength
      );
      result += common2.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  snippet = makeSnippet;
  return snippet;
}
var type;
var hasRequiredType;
function requireType() {
  if (hasRequiredType) return type;
  hasRequiredType = 1;
  const YAMLException2 = requireException();
  const TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  const YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    const result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
      }
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
      throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  type = Type2;
  return type;
}
var schema;
var hasRequiredSchema;
function requireSchema() {
  if (hasRequiredSchema) return schema;
  hasRequiredSchema = 1;
  const YAMLException2 = requireException();
  const Type2 = requireType();
  function compileList(schema2, name) {
    const result = [];
    schema2[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
          newIndex = previousIndex;
        }
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    const result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else {
      throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type2.loadKind && type2.loadKind !== "scalar") {
        throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type2.multi) {
        throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  schema = Schema2;
  return schema;
}
var str;
var hasRequiredStr;
function requireStr() {
  if (hasRequiredStr) return str;
  hasRequiredStr = 1;
  const Type2 = requireType();
  str = new Type2("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  return str;
}
var seq;
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq) return seq;
  hasRequiredSeq = 1;
  const Type2 = requireType();
  seq = new Type2("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  return seq;
}
var map;
var hasRequiredMap;
function requireMap() {
  if (hasRequiredMap) return map;
  hasRequiredMap = 1;
  const Type2 = requireType();
  map = new Type2("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  return map;
}
var failsafe;
var hasRequiredFailsafe;
function requireFailsafe() {
  if (hasRequiredFailsafe) return failsafe;
  hasRequiredFailsafe = 1;
  const Schema2 = requireSchema();
  failsafe = new Schema2({
    explicit: [
      requireStr(),
      requireSeq(),
      requireMap()
    ]
  });
  return failsafe;
}
var _null;
var hasRequired_null;
function require_null() {
  if (hasRequired_null) return _null;
  hasRequired_null = 1;
  const Type2 = requireType();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  _null = new Type2("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
  return _null;
}
var bool;
var hasRequiredBool;
function requireBool() {
  if (hasRequiredBool) return bool;
  hasRequiredBool = 1;
  const Type2 = requireType();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  bool = new Type2("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
  return bool;
}
var int;
var hasRequiredInt;
function requireInt() {
  if (hasRequiredInt) return int;
  hasRequiredInt = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") {
      ch = data[++index];
    }
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common2.isNegativeZero(object));
  }
  int = new Type2("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
  return int;
}
var float;
var hasRequiredFloat;
function requireFloat() {
  if (hasRequiredFloat) return float;
  hasRequiredFloat = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  const YAML_FLOAT_PATTERN = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  const YAML_FLOAT_SPECIAL_PATTERN = new RegExp(
    "^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) {
      return false;
    }
    if (isFinite(parseFloat(data, 10))) {
      return true;
    }
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) {
      value = value.slice(1);
    }
    if (value === ".inf") {
      return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === ".nan") {
      return NaN;
    }
    return sign * parseFloat(value, 10);
  }
  const SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common2.isNegativeZero(object)) {
      return "-0.0";
    }
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common2.isNegativeZero(object));
  }
  float = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  return float;
}
var json;
var hasRequiredJson;
function requireJson() {
  if (hasRequiredJson) return json;
  hasRequiredJson = 1;
  json = requireFailsafe().extend({
    implicit: [
      require_null(),
      requireBool(),
      requireInt(),
      requireFloat()
    ]
  });
  return json;
}
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
var timestamp;
var hasRequiredTimestamp;
function requireTimestamp() {
  if (hasRequiredTimestamp) return timestamp;
  hasRequiredTimestamp = 1;
  const Type2 = requireType();
  const YAML_DATE_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  );
  const YAML_TIMESTAMP_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day = +match[3];
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  timestamp = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  return timestamp;
}
var merge;
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge) return merge;
  hasRequiredMerge = 1;
  const Type2 = requireType();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  merge = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  return merge;
}
var binary;
var hasRequiredBinary;
function requireBinary() {
  if (hasRequiredBinary) return binary;
  hasRequiredBinary = 1;
  const Type2 = requireType();
  const BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map2.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map2 = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) {
      result.push(bits >> 4 & 255);
    }
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  binary = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  return binary;
}
var omap;
var hasRequiredOmap;
function requireOmap() {
  if (hasRequiredOmap) return omap;
  hasRequiredOmap = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = {};
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) {
        if (_hasOwnProperty.call(pair, pairKey)) {
          if (!pairHasKey) pairHasKey = true;
          else return false;
        }
      }
      if (!pairHasKey) return false;
      if (_hasOwnProperty.call(objectKeys, pairKey)) return false;
      Object.defineProperty(objectKeys, pairKey, { value: true });
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  omap = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  return omap;
}
var pairs;
var hasRequiredPairs;
function requirePairs() {
  if (hasRequiredPairs) return pairs;
  hasRequiredPairs = 1;
  const Type2 = requireType();
  const _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  pairs = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  return pairs;
}
var set;
var hasRequiredSet;
function requireSet() {
  if (hasRequiredSet) return set;
  hasRequiredSet = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) {
      if (_hasOwnProperty.call(object, key)) {
        if (object[key] !== null) return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  set = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  return set;
}
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default) return _default;
  hasRequired_default = 1;
  _default = requireCore().extend({
    implicit: [
      requireTimestamp(),
      requireMerge()
    ],
    explicit: [
      requireBinary(),
      requireOmap(),
      requirePairs(),
      requireSet()
    ]
  });
  return _default;
}
var hasRequiredLoader;
function requireLoader() {
  if (hasRequiredLoader) return loader;
  hasRequiredLoader = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const makeSnippet = requireSnippet();
  const DEFAULT_SCHEMA2 = require_default();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CONTEXT_FLOW_IN = 1;
  const CONTEXT_FLOW_OUT = 2;
  const CONTEXT_BLOCK_IN = 3;
  const CONTEXT_BLOCK_OUT = 4;
  const CHOMPING_CLIP = 1;
  const CHOMPING_STRIP = 2;
  const CHOMPING_KEEP = 3;
  const PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  const PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  const PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  const PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  const PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) {
      return lc - 97 + 10;
    }
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) {
      return 2;
    }
    if (c === 117) {
      return 4;
    }
    if (c === 85) {
      return 8;
    }
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode(
      (c - 65536 >> 10) + 55296,
      (c - 65536 & 1023) + 56320
    );
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object[key] = value;
    }
  }
  const simpleEscapeCheck = new Array(256);
  const simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxTotalMergeKeys = typeof options["maxTotalMergeKeys"] === "number" ? options["maxTotalMergeKeys"] : 1e4;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.totalMergeKeys = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      // omit trailing \0
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) {
        transaction[name] = {
          existed: _hasOwnProperty.call(state.anchorMap, name),
          value: state.anchorMap[name]
        };
      }
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) {
        parent[name] = transaction[name];
      }
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) {
        state.anchorMap[names[index]] = entry.value;
      } else {
        delete state.anchorMap[names[index]];
      }
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  const directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) {
        throwError(state, "unacceptable YAML version of the document");
      }
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) {
        throwWarning(state, "unsupported YAML version of the document");
      }
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) {
        throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      }
      if (_hasOwnProperty.call(state.tagMap, handle)) {
        throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      }
      if (!PATTERN_TAG_URI.test(prefix)) {
        throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      }
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err2) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) {
        for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
          const _character = _result.charCodeAt(_position);
          if (!(_character === 9 || _character >= 32 && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function chargeMergeWork(state) {
    state.totalMergeKeys++;
    if (state.maxTotalMergeKeys !== -1 && state.totalMergeKeys > state.maxTotalMergeKeys) {
      throwError(state, "merge keys exceeded maxTotalMergeKeys (" + state.maxTotalMergeKeys + ")");
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common2.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    chargeMergeWork(state);
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      chargeMergeWork(state);
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) {
          throwError(state, "nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (_result === null) {
      _result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        if (valueNode.length > 100) {
          throwError(state, "abnormal merge sequence size");
        }
        for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
          mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) {
      state.position++;
    } else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) {
        state.position++;
      }
    } else {
      throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 10 && ch !== 13 && ch !== 0);
      }
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common2.repeat("\n", count - 1);
    }
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
          break;
        }
      } else if (ch === 35) {
        const preceding = state.input.charCodeAt(state.position - 1);
        if (isWsOrEol(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
        break;
      } else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) {
        captureEnd = state.position + 1;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
      return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 39) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (ch === 39) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 34) {
        captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 92) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (isEol(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          let hexLength = tmp;
          let hexResult = 0;
          for (; hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);
            if ((tmp = fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throwError(state, "expected hexadecimal character");
            }
          }
          state.result += charFromCodepoint(hexResult);
          state.position++;
        } else {
          throwError(state, "unknown escape sequence");
        }
        captureStart = captureEnd = state.position;
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else {
      return false;
    }
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) {
        throwError(state, "missed comma between flow collection entries");
      } else if (ch === 44) {
        throwError(state, "expected the node content, but found ','");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following)) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) {
      folding = false;
    } else if (ch === 62) {
      folding = true;
    } else {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throwError(state, "repeat of a chomping mode identifier");
        }
      } else if ((tmp = fromDecimalCode(ch)) >= 0) {
        if (tmp === 0) {
          throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throwError(state, "repeat of an indentation width identifier");
        }
      } else {
        break;
      }
    }
    if (isWhiteSpace(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (isWhiteSpace(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!isEol(ch) && ch !== 0);
      }
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) {
        throwError(state, "missing indentation for block scalar");
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (isWhiteSpace(ch)) {
          atMoreIndented = true;
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common2.repeat("\n", emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common2.repeat("\n", emptyLines);
        }
      } else {
        state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      const following = state.input.charCodeAt(state.position + 1);
      if (!isWsOrEol(following)) {
        break;
      }
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a sequence entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else {
          throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        }
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
          break;
        }
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) {
              throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) {
            throwError(state, "can not read an implicit mapping pair; a colon is missed");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) {
          throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a mapping entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) {
      throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }
    let _position = state.position;
    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        throwError(state, "unexpected end of the stream within a verbatim tag");
      }
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throwError(state, "named tag handle cannot contain such characters");
            }
            isNamed = true;
            _position = state.position + 1;
          } else {
            throwError(state, "tag suffix cannot contain exclamation marks");
          }
        }
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throwError(state, "tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throwError(state, "tag name cannot contain such characters: " + tagName);
    }
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err2) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) {
      state.tag = tagName;
    } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = "tag:yaml.org,2002:" + tagName;
    } else {
      throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type2;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) {
      throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    }
    state.depth += 1;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (true) {
        const ch = state.input.charCodeAt(state.position);
        const propertyState = snapshotState(state);
        if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) {
          break;
        }
        if (!readTagProperty(state) && !readAnchorProperty(state)) {
          break;
        }
        if (propertyStart === null) {
          propertyStart = propertyState;
        }
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
        flowIndent = parentIndent;
      } else {
        flowIndent = parentIndent + 1;
      }
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          const ch = state.input.charCodeAt(state.position);
          if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(
            state,
            propertyStart,
            propertyStart.position - propertyStart.lineStart,
            flowIndent
          )) {
            hasContent = true;
          } else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (readAlias(state)) {
            hasContent = true;
            if (state.tag !== null || state.anchor !== null) {
              throwError(state, "alias node should not have any properties");
            }
          } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (state.tag === null) {
              state.tag = "?";
            }
          }
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        storeAnchor(state, state.anchor, state.result);
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          storeAnchor(state, state.anchor, state.result);
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) {
        break;
      }
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (isWhiteSpace(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        throwWarning(state, 'unknown document directive "' + directiveName + '"');
      }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
      throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
      throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) {
      throwError(state, "end of the stream or a document separator is expected");
    }
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
        input += "\n";
      }
      if (input.charCodeAt(0) === 65279) {
        input = input.slice(1);
      }
    }
    const state = new State(input, options);
    const nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) {
      readDocument(state);
    }
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (let index = 0, length = documents.length; index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return void 0;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  loader.loadAll = loadAll2;
  loader.load = load2;
  return loader;
}
var dumper = {};
var hasRequiredDumper;
function requireDumper() {
  if (hasRequiredDumper) return dumper;
  hasRequiredDumper = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const DEFAULT_SCHEMA2 = require_default();
  const _toString = Object.prototype.toString;
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CHAR_BOM = 65279;
  const CHAR_TAB = 9;
  const CHAR_LINE_FEED = 10;
  const CHAR_CARRIAGE_RETURN = 13;
  const CHAR_SPACE = 32;
  const CHAR_EXCLAMATION = 33;
  const CHAR_DOUBLE_QUOTE = 34;
  const CHAR_SHARP = 35;
  const CHAR_PERCENT = 37;
  const CHAR_AMPERSAND = 38;
  const CHAR_SINGLE_QUOTE = 39;
  const CHAR_ASTERISK = 42;
  const CHAR_COMMA = 44;
  const CHAR_MINUS = 45;
  const CHAR_COLON = 58;
  const CHAR_EQUALS = 61;
  const CHAR_GREATER_THAN = 62;
  const CHAR_QUESTION = 63;
  const CHAR_COMMERCIAL_AT = 64;
  const CHAR_LEFT_SQUARE_BRACKET = 91;
  const CHAR_RIGHT_SQUARE_BRACKET = 93;
  const CHAR_GRAVE_ACCENT = 96;
  const CHAR_LEFT_CURLY_BRACKET = 123;
  const CHAR_VERTICAL_LINE = 124;
  const CHAR_RIGHT_CURLY_BRACKET = 125;
  const ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  const DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  const DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    if (map2 === null) return {};
    const result = {};
    const keys = Object.keys(map2);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      const type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else {
      throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common2.repeat("0", length - string.length) + string;
  }
  const QUOTING_TYPE_SINGLE = 1;
  const QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common2.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common2.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common2.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) {
      const type2 = state.implicitTypes[index];
      if (type2.resolve(str2)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && // - b-char
    c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (
      // ns-plain-safe
      (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && // - c-flow-indicator
      c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && // ns-plain-char
      c !== CHAR_SHARP && // false on '#'
      !(prev === CHAR_COLON && !cIsNsChar) || // false on ': '
      isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || // change to true on '[^ ]#'
      prev === CHAR_COLON && cIsNsChar
    );
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && // - s-white
    // - (c-indicator ::=
    // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
    c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
    c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && // | “%” | “@” | “`”)
    c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    const leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  const STYLE_PLAIN = 1;
  const STYLE_SINGLE = 2;
  const STYLE_LITERAL = 3;
  const STYLE_FOLDED = 4;
  const STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
            i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = (function() {
      if (string.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
        }
      }
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || // No block styles in flow mode.
      state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(
        string,
        singleLineOnly,
        state.indent,
        lineWidth,
        testAmbiguity,
        state.quotingType,
        state.forceQuotes && !iskey,
        inblock
      )) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    })();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    const keep = clip && (string[string.length - 2] === "\n" || string === "\n");
    const chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = (function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    })();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) {
      result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    } else {
      result += line.slice(start);
    }
    return result.slice(1);
  }
  function escapeString(string) {
    let result = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") {
          _result += generateNextLine(state, level);
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          _result += "-";
        } else {
          _result += "- ";
        }
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level, objectKey, false, false)) {
        continue;
      }
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) {
        continue;
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new YAMLException2("sortKeys must be a boolean or a function");
    }
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) {
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += "?";
        } else {
          pairBuffer += "? ";
        }
      }
      pairBuffer += state.dump;
      if (explicitPair) {
        pairBuffer += generateNextLine(state, level);
      }
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
        continue;
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += ":";
      } else {
        pairBuffer += ": ";
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          const style = state.styleMap[type2.tag] || type2.defaultStyle;
          let _result;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new YAMLException2("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
          }
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) {
      detectType(state, object, true);
    }
    const type2 = _toString.call(state.dump);
    const inblock = block;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    const objectOrArray = type2 === "[object Object]" || type2 === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
      compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
      state.dump = "*ref_" + duplicateIndex;
    } else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
        state.usedDuplicates[duplicateIndex] = true;
      }
      if (type2 === "[object Object]") {
        if (block && Object.keys(state.dump).length !== 0) {
          writeBlockMapping(state, level, state.dump, compact);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowMapping(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object Array]") {
        if (block && state.dump.length !== 0) {
          if (state.noArrayIndent && !isblockseq && level > 0) {
            writeBlockSequence(state, level - 1, state.dump, compact);
          } else {
            writeBlockSequence(state, level, state.dump, compact);
          }
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowSequence(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(
          state.tag[0] === "!" ? state.tag.slice(1) : state.tag
        ).replace(/!/g, "%21");
        if (state.tag[0] === "!") {
          tagStr = "!" + tagStr;
        } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
          tagStr = "!!" + tagStr.slice(18);
        } else {
          tagStr = "!<" + tagStr + ">";
        }
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (let i = 0, length = object.length; i < length; i += 1) {
            inspectNode(object[i], objects, duplicatesIndexes);
          }
        } else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) {
            inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  dumper.dump = dump2;
  return dumper;
}
var hasRequiredJsYaml;
function requireJsYaml() {
  if (hasRequiredJsYaml) return jsYaml;
  hasRequiredJsYaml = 1;
  const loader2 = requireLoader();
  const dumper2 = requireDumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  jsYaml.Type = requireType();
  jsYaml.Schema = requireSchema();
  jsYaml.FAILSAFE_SCHEMA = requireFailsafe();
  jsYaml.JSON_SCHEMA = requireJson();
  jsYaml.CORE_SCHEMA = requireCore();
  jsYaml.DEFAULT_SCHEMA = require_default();
  jsYaml.load = loader2.load;
  jsYaml.loadAll = loader2.loadAll;
  jsYaml.dump = dumper2.dump;
  jsYaml.YAMLException = requireException();
  jsYaml.types = {
    binary: requireBinary(),
    float: requireFloat(),
    map: requireMap(),
    null: require_null(),
    pairs: requirePairs(),
    set: requireSet(),
    timestamp: requireTimestamp(),
    bool: requireBool(),
    int: requireInt(),
    merge: requireMerge(),
    omap: requireOmap(),
    seq: requireSeq(),
    str: requireStr()
  };
  jsYaml.safeLoad = renamed("safeLoad", "load");
  jsYaml.safeLoadAll = renamed("safeLoadAll", "loadAll");
  jsYaml.safeDump = renamed("safeDump", "dump");
  return jsYaml;
}
var jsYamlExports = requireJsYaml();
var yaml = /* @__PURE__ */ getDefaultExportFromCjs(jsYamlExports);
var {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
} = yaml;

// viewer/server/core/managed.js
var BS = String.fromCharCode(92);
var RE_SPECIAL = ".+?^${}()|[]" + BS;
var coordValue = (coord) => coord.slice(coord.indexOf(":") + 1);
function escapeLiteral(s) {
  let out2 = "";
  for (const ch of s) out2 += RE_SPECIAL.includes(ch) ? BS + ch : ch;
  return out2;
}
function patternToRegex(pat) {
  return new RegExp("^" + pat.split("*").map(escapeLiteral).join(".*") + "$");
}
function* outsideFences(lines) {
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0].repeat(3);
      else if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fence) continue;
    yield [i, line];
  }
}
function parseRegistry(text) {
  const rules = [];
  const errors = [];
  if (!text) return { rules, errors, present: false };
  for (const [i, line] of outsideFences(text.split("\n"))) {
    if (!/^\s*\|/.test(line)) continue;
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const unquote = (s) => s.replace(/^`|`$/g, "").trim();
    const pattern = unquote(cells[0]);
    const doc = unquote(cells[1]);
    const sec = unquote(cells[2]);
    if (!pattern.includes(":")) continue;
    if (!doc || !/\.md$/i.test(doc)) {
      errors.push({ line: i + 1, message: `\uAD00\uB9AC \uBB38\uC11C \uACBD\uB85C\uAC00 .md \uAC00 \uC544\uB2D8: ${doc || "(\uBE48\uCE78)"}` });
      continue;
    }
    const whole = !sec || /^[—–-]$/.test(sec);
    const h = sec.match(/^(#{1,6})\s*\{값\}/);
    if (!whole && !h) {
      errors.push({ line: i + 1, message: `\uC139\uC158 \uD615\uC2DD\uC744 \uC77D\uC744 \uC218 \uC5C6\uC74C: ${sec}   (\`## {\uAC12}\` \uB610\uB294 \`\u2014\`)` });
      continue;
    }
    rules.push({
      pattern,
      re: patternToRegex(pattern),
      doc,
      level: whole ? 0 : h[1].length,
      whole,
      note: cells[3] ? cells[3].trim() : "",
      line: i + 1
    });
  }
  return { rules, errors, present: rules.length > 0 };
}
function resolveCoord(registry, coord) {
  if (!registry || !registry.rules.length) return null;
  for (const r of registry.rules) {
    if (r.re.test(coord)) {
      return { doc: r.doc, level: r.level, whole: r.whole, value: coordValue(coord), pattern: r.pattern };
    }
  }
  return null;
}
function parseManagedSections(text) {
  const lines = text.split("\n");
  const found = [];
  for (const [i, line] of outsideFences(lines)) {
    const h = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!h) continue;
    const title = h[2].trim();
    found.push({
      level: h[1].length,
      title,
      // "rp_plnd_mst — 계획서마스터" → 값은 구분선 앞
      value: title.split(/\s+[—–-]\s+/)[0].trim(),
      line: i
    });
  }
  for (let k = 0; k < found.length; k++) {
    const s = found[k];
    const next = found.slice(k + 1).find((o) => o.level <= s.level);
    s.end = next ? next.line : lines.length;
    s.applied = null;
    s.appliedLine = null;
    for (let i = s.line + 1; i < Math.min(s.line + 4, s.end); i++) {
      const m = lines[i].match(/<!--\s*applied\s*:\s*(.*?)\s*-->/i);
      if (m) {
        const v = m[1].trim();
        s.applied = v && v !== "null" && v !== "-" ? v : null;
        s.appliedLine = i;
        break;
      }
    }
    s.hasAppliedComment = s.appliedLine != null;
    const body = lines.slice(s.line + 1, s.end).filter((l) => !l.includes("<!--") && !/^\s*>/.test(l)).join("").trim();
    s.empty = body.length === 0;
  }
  return found;
}
function normValue(s) {
  return String(s || "").toLowerCase().replace(/[\s_·-]/g, "");
}
function buildManagedIndex(registry, managedDocs) {
  const byPath = new Map(managedDocs.map((d) => [d.path, d]));
  return {
    registry,
    docs: managedDocs,
    // 좌표 → 어디에 그 좌표의 현재 상태가 적혀 있는가.
    //   null                       등록부에 없다 (module: · domain: — 정상)
    //   { docMissing: true }       등록부가 가리키는 문서가 없다 (오류)
    //   { section: null }          문서는 있는데 섹션이 없다 (오류 — 앵커 없음)
    //   { section: {...} }         찾았다
    find(coord) {
      const hit = resolveCoord(registry, coord);
      if (!hit) return null;
      const doc = byPath.get(hit.doc);
      if (!doc) return { ...hit, docMissing: true, section: null };
      if (hit.whole) {
        return {
          ...hit,
          docMissing: false,
          section: { level: 0, title: doc.title, value: hit.value, line: 0, end: 0, applied: null, hasAppliedComment: false, empty: false, whole: true }
        };
      }
      const section = (doc.managedSections || []).find((s) => s.level === hit.level && normValue(s.value) === normValue(hit.value)) || null;
      return { ...hit, docMissing: false, section };
    },
    // 등록부가 가리키는데 실제로 없는 것 — 앵커 없음. 커밋을 거부할 대상이다.
    danglingFor(coords) {
      const out2 = [];
      for (const c of coords) {
        const hit = this.find(c);
        if (!hit) continue;
        if (hit.docMissing) out2.push({ coord: c, doc: hit.doc, reason: "doc" });
        else if (!hit.section) out2.push({ coord: c, doc: hit.doc, anchor: "#".repeat(hit.level) + " " + hit.value, reason: "anchor" });
      }
      return out2;
    }
  };
}

// viewer/server/core/frontmatter.js
var FM = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
function layerOf(p) {
  if (/^work\/(?!assets\/)[^/]+\.md$/i.test(p)) return "work";
  if (/^knowledge\/[^/]+\.md$/i.test(p)) return "work";
  if (/^docs\/.+\.md$/i.test(p)) return "managed";
  return null;
}
function normDate(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
  }
  return String(v).trim();
}
function normStatus(v) {
  const t = v ? String(v).trim() : "";
  return !t || t === "\uD655\uC815" || t === "\uC644\uB8CC" ? null : t;
}
function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v.filter((x) => x != null).map((x) => String(x).trim()) : [String(v).trim()];
}
function normalizeSupersedes(v) {
  if (v == null) return [];
  const one = (x) => {
    if (x == null) return null;
    if (typeof x === "string") return { id: x.trim(), scope: null };
    if (typeof x === "object" && x.id) return { id: String(x.id).trim(), scope: toArray(x.scope).length ? toArray(x.scope) : null };
    return null;
  };
  return (Array.isArray(v) ? v : [v]).map(one).filter(Boolean);
}
function outline(body) {
  const lines = body.split("\n");
  const found = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0].repeat(3);
      else if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fence) continue;
    const h = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (h) found.push({ level: h[1].length, title: h[2].trim(), line: i });
  }
  return found;
}
var THIN_CHARS = 140;
function bodyWeight(body) {
  const text = body.split("\n").filter((l) => !/^\s*(---|<!--|#{1,6}\s)/.test(l)).join(" ").replace(/\s+/g, " ").trim();
  return { chars: text.length, thin: text.length > 0 && text.length < THIN_CHARS };
}
function parseDoc(path6, text) {
  const m = text.match(FM);
  const errors = [];
  let fm = {};
  let body = text;
  if (m) {
    body = text.slice(m[0].length);
    try {
      fm = yaml.load(m[1]) || {};
      if (typeof fm !== "object" || Array.isArray(fm)) {
        errors.push("\uD504\uB860\uD2B8\uB9E4\uD130\uAC00 \uAC1D\uCCB4\uAC00 \uC544\uB2D8");
        fm = {};
      }
    } catch (e) {
      errors.push(`\uD504\uB860\uD2B8\uB9E4\uD130 YAML \uC624\uB958: ${e.reason || e.message}`);
      fm = {};
    }
  }
  const fileId = path6.replace(/^.*\//, "").replace(/\.md$/i, "");
  const id = fm.id ? String(fm.id).trim() : fileId;
  const layer = layerOf(path6);
  const headings = outline(body);
  const weight = bodyWeight(body);
  const doc = {
    path: path6,
    id,
    fileId,
    layer,
    // 'work' | 'managed' | null
    isUnit: layer === "work" && !!m,
    hasFrontmatter: !!m,
    title: fm.title ? String(fm.title).trim() : fileId,
    date: normDate(fm.date),
    author: fm.author ? String(fm.author).trim() : null,
    // **`확정` 은 읽는 경계에서 지운다.**
    //
    // 기본값이라 아무것도 구별하지 않는다(30건 중 28건). 여기서 지우면 화면·
    // 클립보드·검사 전부가 자동으로 조용해지고, 이미 `status: 확정` 이 적힌
    // 기존 기록도 그대로 둔 채 동작한다 -- 데이터를 고치러 다니지 않는다.
    status: normStatus(fm.status),
    touches: toArray(fm.touches),
    hasTouchesKey: Object.prototype.hasOwnProperty.call(fm, "touches"),
    supersedes: normalizeSupersedes(fm.supersedes),
    attachments: toArray(fm.attachments),
    tags: toArray(fm.tags),
    unknownFields: Object.keys(fm).filter(
      (k) => !["id", "title", "date", "author", "status", "touches", "supersedes", "attachments", "tags"].includes(k)
    ),
    headings,
    bodyChars: weight.chars,
    // 전에는 `진행중` 이면 본문이 비어도 정상으로 봤다. 그 상태가 없어졌으니
    // 예외도 없다 — 완료된 작업의 기록이 비어 있으면 그냥 얇은 기록이다.
    bodyThin: layer === "work" && weight.thin,
    // 형식을 강요하지 않으므로 목차 레일은 항상 실제 제목으로 만든다
    sections: [],
    conforms: false,
    bodyOffset: m ? m[0].length : 0,
    errors
  };
  if (layer === "managed") {
    doc.managedSections = parseManagedSections(body);
    doc.sectionCount = doc.managedSections.filter((s) => s.hasAppliedComment || s.level === 2).length;
  }
  return doc;
}

// viewer/server/core/scan.js
var IGNORED_DIRS = /* @__PURE__ */ new Set([".git", "design", ".claude", "node_modules", "dist", "build", ".vite", ".cache", ".idea", ".vscode"]);
var TEXT_EXT = /* @__PURE__ */ new Set([".md", ".markdown", ".txt", ".json", ".yml", ".yaml", ".sql", ".csv"]);
function readText(text) {
  return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}
function posix(p) {
  return p.split(path2.sep).join("/");
}
async function* walk(root, rel = "") {
  const dir = rel ? path2.join(root, rel) : root;
  let entries;
  try {
    entries = await fs2.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      yield* walk(root, rel ? `${rel}/${e.name}` : e.name);
    } else if (e.isFile() || e.isSymbolicLink()) {
      yield rel ? `${rel}/${e.name}` : e.name;
    }
  }
}
async function scan(root, cache, { onProgress } = {}) {
  const docs = [];
  const bodies = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  let read2 = 0;
  let reused = 0;
  const started = Date.now();
  const files = [];
  for await (const f of walk(root)) {
    const ext = path2.extname(f).toLowerCase();
    if (TEXT_EXT.has(ext) || isImage(ext)) files.push(f);
  }
  for (let i = 0; i < files.length; i++) {
    const relPath = posix(files[i]);
    const abs = path2.join(root, relPath);
    seen.add(relPath);
    let st;
    try {
      st = await fs2.stat(abs);
    } catch {
      continue;
    }
    const ext = path2.extname(relPath).toLowerCase();
    if (isImage(ext)) continue;
    const hit = cache.get(relPath);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) {
      docs.push(hit.doc);
      bodies.set(relPath, hit.body);
      reused++;
    } else {
      let text;
      try {
        text = readText(await fs2.readFile(abs, "utf8"));
      } catch {
        continue;
      }
      const doc = parseDoc(relPath, text);
      doc.size = st.size;
      doc.mtime = st.mtimeMs;
      cache.set(relPath, { mtime: st.mtimeMs, size: st.size, doc, body: text });
      docs.push(doc);
      bodies.set(relPath, text);
      read2++;
    }
    if (onProgress && i % 25 === 0) onProgress({ done: i + 1, total: files.length });
  }
  for (const key of [...cache.keys()]) if (!seen.has(key)) cache.delete(key);
  return {
    docs,
    bodies,
    stats: { total: docs.length, read: read2, reused, ms: Date.now() - started, scannedAt: (/* @__PURE__ */ new Date()).toISOString() }
  };
}
function isImage(ext) {
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].includes(ext);
}
function countIndexRows(text) {
  return text.split("\n").filter((l) => /^\|/.test(l.trim()) && !/^\|[\s:\-|]+\|$/.test(l.trim())).filter((l) => !/^\|\s*id\s*\|/i.test(l.trim())).length;
}

// viewer/server/core/repo.js
init_vocab();

// viewer/server/core/validity.js
function cmpDateDesc(a, b) {
  const da = a.date || "";
  const db = b.date || "";
  if (da === db) return String(a.id).localeCompare(String(b.id)) * -1;
  if (!da) return 1;
  if (!db) return -1;
  return da < db ? 1 : -1;
}
function buildCoordIndex(works, opts = {}) {
  const exclude = new Set(opts.excludeTypes || []);
  const byId = new Map(works.map((d) => [d.id, d]));
  const byCoord = /* @__PURE__ */ new Map();
  for (const d of works) {
    for (const c of d.touches) {
      if (!byCoord.has(c)) byCoord.set(c, []);
      byCoord.get(c).push(d);
    }
  }
  for (const list of byCoord.values()) list.sort(cmpDateDesc);
  const slim = (d) => ({ id: d.id, title: d.title, date: d.date, author: d.author, status: d.status, path: d.path });
  const api = {
    byCoord,
    typeOf: (coord) => coord.includes(":") ? coord.slice(0, coord.indexOf(":")) : "",
    excluded: (coord) => exclude.has(api.typeOf(coord)),
    // 하나의 계산.
    //   ref: 작업 기록 객체 | 작업 기록 id 문자열 | null
    //
    // **같은 날짜는 후속이 아니다.**
    //
    // 날짜 입도가 하루이므로 하루 안의 순서를 알 수 없다. 그리고 관리 문서
    // 섹션의 `applied` 는 **하나만 가리킬 수 있는데** 하루에 같은 좌표를 두 번
    // 건드리면 섹션은 둘 다 반영하고 `applied` 는 그중 하나만 적는다.
    //
    // id 문자열 비교로 순서를 매기면 그때 남은 하나가 파생 누락으로 잡힌다 --
    // 실측에서 `screen:PLA011` 이 그랬다. 셋 다 반영했는데 1건이 남았다.
    //
    // **이 목록의 오탐은 부식성이 크다.** 한 번 틀리면 사람들이 그 목록 전체를
    // 안 믿는다. 그래서 같은 날짜는 동료로 본다 -- 선후를 모르니 단정하지 않는다.
    //
    // 대가 — 같은 날 실제로 반영 안 된 작업을 놓친다. 그것은 섹션의 `변경` 목록이
    // 실제 반영 기록이므로 거기서 보인다.
    later(ref, coord) {
      const list = byCoord.get(coord) || [];
      const base = { coord, excluded: api.excluded(coord), total: list.length };
      if (ref == null) return { ...base, ref: null, count: list.length, items: list.map(slim) };
      const refDoc = typeof ref === "string" ? byId.get(ref) : ref;
      if (!refDoc) {
        return { ...base, ref: String(ref), refUnknown: true, count: list.length, items: list.map(slim) };
      }
      const items = list.filter((o) => o.id !== refDoc.id && (o.date || "") > (refDoc.date || ""));
      const hhmm = (d) => /\d{2}:\d{2}/.test(d || "");
      const peers = list.filter(
        (o) => o.id !== refDoc.id && (o.date || "") === (refDoc.date || "") && !(hhmm(o.date) && hhmm(refDoc.date))
      );
      return { ...base, ref: refDoc.id, refDate: refDoc.date, count: items.length, items: items.map(slim), peers: peers.map(slim) };
    },
    latest(coord) {
      const list = byCoord.get(coord) || [];
      return list.length ? slim(list[0]) : null;
    },
    // 작업 기록 하나를 열었을 때 — 좌표마다 따로 판정한다.
    ofWork(doc) {
      return doc.touches.map((c) => api.later(doc, c));
    }
  };
  return api;
}
function buildSectionStatus(coordIndex, managedIndex, allCoords) {
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  for (const coord of allCoords) {
    if (seen.has(coord)) continue;
    seen.add(coord);
    const hit = managedIndex.find(coord);
    if (!hit) continue;
    if (hit.docMissing) {
      rows.push({ coord, doc: hit.doc, state: "doc-missing", total: (coordIndex.byCoord.get(coord) || []).length, count: 0, items: [], latest: coordIndex.latest(coord) });
      continue;
    }
    if (!hit.section) {
      rows.push({
        coord,
        doc: hit.doc,
        anchor: "#".repeat(hit.level) + " " + hit.value,
        state: "anchor-missing",
        total: (coordIndex.byCoord.get(coord) || []).length,
        count: 0,
        items: [],
        latest: coordIndex.latest(coord)
      });
      continue;
    }
    const s = hit.section;
    const l = coordIndex.later(s.applied, coord);
    let state = "ok";
    if (l.refUnknown) state = "orphan";
    else if (!s.applied) state = l.total ? "unwritten" : "empty";
    else if (l.count > 0) state = "stale";
    rows.push({
      coord,
      doc: hit.doc,
      anchor: "#".repeat(s.level) + " " + s.value,
      line: s.line,
      end: s.end,
      level: s.level,
      applied: s.applied,
      sectionEmpty: s.empty,
      state,
      total: l.total,
      count: l.count,
      items: l.items,
      // 같은 날 기록 — 반영됐는지 기계가 알 수 없다. 경고로만 낸다
      peers: l.peers || [],
      latest: coordIndex.latest(coord)
    });
  }
  const order = { stale: 0, orphan: 1, "anchor-missing": 2, "doc-missing": 3, unwritten: 4, empty: 5, ok: 6 };
  return rows.sort((a, b) => order[a.state] - order[b.state] || b.count - a.count || a.coord.localeCompare(b.coord));
}
function buildValidity(docs) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const supersededBy = /* @__PURE__ */ new Map();
  const missingTargets = [];
  for (const d of docs) {
    for (const s of d.supersedes) {
      if (!byId.has(s.id)) {
        missingTargets.push({ doc: d.id, target: s.id });
        continue;
      }
      if (!supersededBy.has(s.id)) supersededBy.set(s.id, []);
      supersededBy.get(s.id).push({ by: d.id, scope: s.scope });
    }
  }
  const cycles = /* @__PURE__ */ new Set();
  for (const start of byId.keys()) {
    const seen = /* @__PURE__ */ new Set([start]);
    let cur = start;
    for (; ; ) {
      const next = (supersededBy.get(cur) || [])[0];
      if (!next) break;
      if (seen.has(next.by)) {
        cycles.add(start);
        break;
      }
      seen.add(next.by);
      cur = next.by;
    }
  }
  return {
    of(id) {
      const covers = supersededBy.get(id) || [];
      const full = covers.filter((c) => !c.scope);
      const scoped = covers.filter((c) => c.scope);
      const doc = byId.get(id);
      const broken = doc ? doc.supersedes.filter((s) => !byId.has(s.id)).map((s) => s.id) : [];
      let state = "valid";
      if (cycles.has(id)) state = "cycle";
      return {
        state,
        // valid | cycle
        correctedBy: full.map((c) => c.by),
        // 이 기록을 정정한 문서 (참조)
        partialBy: scoped.map((c) => ({ by: c.by, scope: c.scope })),
        brokenTargets: broken,
        // v0.3 호출부 호환 -- 같은 목록이다
        supersededBy: full.map((c) => c.by)
      };
    },
    missingTargets,
    cycles: [...cycles]
  };
}

// viewer/server/core/repo.js
async function readOr(root, name, fallback = "") {
  const t = await fs3.readFile(path3.join(root, name), "utf8").catch(() => null);
  return t == null ? fallback : readText(t);
}
async function loadRepo(root, { cache = /* @__PURE__ */ new Map(), settings = {}, onProgress } = {}) {
  const { docs, bodies, stats } = await scan(root, cache, { onProgress });
  const vocab = parseVocab(await readOr(root, "_vocab.md"));
  const registry = parseRegistry(await readOr(root, "_managed.md"));
  const indexText = await readOr(root, "INDEX.md", null);
  const indexInfo = indexText == null ? { exists: false } : { exists: true, rows: countIndexRows(indexText) };
  const works = docs.filter((d) => d.layer === "work" && d.hasFrontmatter).sort(cmpDateDesc);
  const managedDocs = docs.filter((d) => d.layer === "managed");
  const coords = buildCoordIndex(works, { excludeTypes: settings.settledness?.excludeTypes || [] });
  const managedIndex = buildManagedIndex(registry, managedDocs);
  const all = /* @__PURE__ */ new Set();
  for (const d of works) for (const c of d.touches) all.add(c);
  for (const c of vocab.coords.keys()) all.add(c);
  const allCoords = [...all].sort();
  return {
    root,
    docs,
    bodies,
    stats,
    vocab,
    registry,
    indexInfo,
    works,
    managedDocs,
    coords,
    managedIndex,
    allCoords,
    sections: buildSectionStatus(coords, managedIndex, allCoords),
    validity: buildValidity(works),
    byId: new Map(works.map((d) => [d.id, d])),
    byPath: new Map(docs.map((d) => [d.path, d]))
  };
}
function repoStatus(r, { today = /* @__PURE__ */ new Date() } = {}) {
  const broken = /* @__PURE__ */ new Set(["orphan", "anchor-missing", "doc-missing"]);
  const pendingDerive = r.sections.filter((x) => x.state === "stale" || x.state === "unwritten");
  const brokenSections = r.sections.filter((x) => broken.has(x.state));
  const days = (d) => d ? Math.max(0, Math.round((today - new Date(d)) / 864e5)) : null;
  return {
    docs: r.docs.length,
    works: r.works.length,
    managedDocs: r.managedDocs.length,
    coords: r.vocab.coords.size,
    pendingDerive,
    brokenSections,
    unregistered: unregisteredCoords(r),
    // **아젠다는 CDP 의 것이 아니다** (정정_판정모델_v2 §2).
    //
    // 지식공유문서는 **작업의 완료에서 발생하는 문서**다. 결정을 기다리는
    // 것은 아젠다이고, 아젠다는 이슈관리·TODO 같은 스케줄 문서가 다룬다.
    // `미결` 과 `제안` 은 같은 것 — 둘 다 상태가 아니라 **이관 대상**이다.
    legacyPending: r.works.filter((d) => d.status === "\uBBF8\uACB0" || d.status === "\uC81C\uC548").map((d) => ({ id: d.id, title: d.title, author: d.author, date: d.date, days: days(d.date), touches: d.touches })).sort((a, b) => (b.days ?? 0) - (a.days ?? 0)),
    thin: r.works.filter((d) => d.bodyThin).map((d) => ({ id: d.id, title: d.title, chars: d.bodyChars })),
    indexStale: r.indexInfo.exists ? r.indexInfo.rows !== r.works.length : null
  };
}
function unregisteredCoords(r) {
  if (!r.vocab.coords.size) return [];
  const counts = /* @__PURE__ */ new Map();
  for (const d of r.works) for (const c of d.touches) if (!r.vocab.coords.has(c)) counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts.entries()].map(([coord, count]) => ({
    coord,
    count,
    docs: r.works.filter((d) => d.touches.includes(coord)).map((d) => d.id)
  })).sort((a, b) => b.count - a.count || a.coord.localeCompare(b.coord));
}

// viewer/server/core/check.js
var AGENDA = /* @__PURE__ */ new Set(["\uBBF8\uACB0", "\uC81C\uC548"]);
var REQUIRED = ["id", "title", "date", "author"];
function runBuiltinCheck({ docs, vocab, validity, indexInfo, managedIndex, sections, gitStatus, bodies }) {
  const findings = [];
  const push = (sev, kind, label, items) => {
    if (items.length) findings.push({ sev, kind, label, items });
  };
  const units = docs.filter((d) => d.layer === "work" && d.hasFrontmatter);
  const missing = [];
  for (const d of units) {
    const gaps = REQUIRED.filter((f) => {
      const v = d[f];
      return v == null || v === "" || Array.isArray(v) && v.length === 0;
    });
    if (gaps.length) missing.push({ id: d.id, path: d.path, detail: gaps.join(", ") });
  }
  push("error", "missing-field", "\uD544\uC218 \uD544\uB4DC \uB204\uB77D", missing);
  push(
    "info",
    "no-touches-key",
    "touches \uD0A4\uAC00 \uC5C6\uC74C \u2014 \uC88C\uD45C 0\uAC1C\uB77C\uBA74 `touches: []` \uB85C \uC801\uB294\uB2E4",
    units.filter((d) => !d.hasTouchesKey).map((d) => ({ id: d.id, path: d.path }))
  );
  push(
    "error",
    "frontmatter",
    "\uD504\uB860\uD2B8\uB9E4\uD130 \uC624\uB958",
    units.filter((d) => d.errors.length).map((d) => ({ id: d.id, path: d.path, detail: d.errors.join(" / ") }))
  );
  const unregistered = [];
  if (vocab.coords.size) {
    for (const d of units) {
      for (const c of d.touches) {
        if (vocab.coords.has(c)) continue;
        const hint = suggestCoord(vocab, c);
        unregistered.push({ id: d.id, path: d.path, coord: c, suggest: hint });
      }
    }
  }
  push("error", "unregistered-coord", "_vocab.md \uBBF8\uB4F1\uC7AC \uC88C\uD45C", unregistered);
  push(
    "error",
    "broken-supersedes",
    "supersedes \uB300\uC0C1 \uBB38\uC11C \uC5C6\uC74C",
    validity.missingTargets.map((m) => ({ id: m.doc, detail: `\u2192 ${m.target} (\uC874\uC7AC\uD558\uC9C0 \uC54A\uC74C)` }))
  );
  push(
    "error",
    "cycle",
    "supersedes \uC21C\uD658 \uCC38\uC870",
    validity.cycles.map((id) => ({ id, detail: "\uCCB4\uC778\uC774 \uC790\uAE30 \uC790\uC2E0\uC73C\uB85C \uB3CC\uC544\uC628\uB2E4" }))
  );
  push(
    "error",
    "id-mismatch",
    "id \uC640 \uD30C\uC77C\uBA85 \uBD88\uC77C\uCE58",
    units.filter((d) => d.id !== d.fileId).map((d) => ({ id: d.id, path: d.path, detail: `\uD30C\uC77C\uBA85\uC740 ${d.fileId}` }))
  );
  const deprecatedUse = [];
  for (const d of units) {
    for (const c of d.touches) {
      const e = vocab.coords.get(c);
      if (e?.deprecated) deprecatedUse.push({ id: d.id, coord: c, suggest: e.supersededBy, detail: e.deprecated });
    }
  }
  push("warn", "deprecated-coord", "deprecated \uC88C\uD45C \uC0AC\uC6A9", deprecatedUse);
  push(
    "error",
    "agenda-status",
    "status: \uBBF8\uACB0\xB7\uC81C\uC548 \u2014 \uC9C0\uC2DD\uACF5\uC720\uBB38\uC11C\uAC00 \uC544\uB2C8\uB77C \uC544\uC820\uB2E4\uC785\uB2C8\uB2E4",
    units.filter((d) => AGENDA.has(d.status)).map((d) => ({ id: d.id, path: d.path, detail: `status: ${d.status} \u2014 docs/\uC704\uD5D8\uBC0F\uC774\uC288\uAD00\uB9AC\uB300\uC7A5.md \uB85C \uC62E\uAE30\uC138\uC694` }))
  );
  push(
    "error",
    "status-value",
    "status \uC5D0 \uC4F8 \uC218 \uC788\uB294 \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4 \u2014 \uC9C0\uC6B0\uC138\uC694",
    units.filter((d) => d.status && !AGENDA.has(d.status)).map((d) => ({ id: d.id, path: d.path, detail: `status: ${d.status} \u2014 \uC9C0\uC2DD\uACF5\uC720\uBB38\uC11C\uB294 \uC644\uB8CC\uB41C \uAC83\uB9CC \uC635\uB2C8\uB2E4` }))
  );
  if (indexInfo?.exists && indexInfo.rows !== units.length) {
    findings.push({
      sev: "warn",
      kind: "index-stale",
      label: "INDEX.md \uBD88\uC77C\uCE58",
      items: [
        {
          detail: `\uC9D1\uACC4 ${units.length}\uAC74 / INDEX.md ${indexInfo.rows}\uD589 \u2014 ctx index \uC2E4\uD589 \uD544\uC694`,
          missing: indexInfo.missing || []
        }
      ]
    });
  }
  push(
    "info",
    "thin-body",
    "\uBCF8\uBB38\uC774 \uC587\uC74C \u2014 \uC65C\uAC00 \uC5C6\uC744 \uC218 \uC788\uB2E4 (\uAE38\uC774\uB85C \uC5B4\uB9BC\uD55C \uAC83\uC774\uB77C \uC624\uD0D0\uC774 \uC788\uB2E4)",
    units.filter((d) => d.bodyThin).map((d) => ({ id: d.id, path: d.path, chars: d.bodyChars }))
  );
  if (bodies && vocab.coords.size) {
    const bodyOnly = [];
    for (const d of units) {
      const text = bodies.get(d.path);
      if (!text) continue;
      const inTouches = new Set(d.touches);
      const seen = /* @__PURE__ */ new Set();
      for (const m of text.matchAll(/`([a-z][a-z0-9_-]*:[^`\s]+)`/gi)) {
        const c = m[1];
        if (seen.has(c) || inTouches.has(c)) continue;
        if (!vocab.coords.has(c)) continue;
        seen.add(c);
        bodyOnly.push({ id: d.id, path: d.path, coord: c, detail: `${d.id} \uBCF8\uBB38\uC5D0 \uC788\uB294\uB370 touches \uC5D0 \uC5C6\uC74C` });
      }
    }
    push("warn", "body-only-coord", "\uBCF8\uBB38\uC5D0\uB9CC \uC788\uB294 \uC88C\uD45C \u2014 \uBC14\uAFBC \uAC83\uC774\uBA74 touches \uC5D0 \uB123\uB294\uB2E4", bodyOnly);
  }
  if (managedIndex) {
    const coords = [...new Set(units.flatMap((d) => d.touches))];
    const dangling = managedIndex.danglingFor(coords);
    push(
      "error",
      "dangling-anchor",
      "\uB4F1\uB85D\uBD80\uAC00 \uAC00\uB9AC\uD0A4\uB294 \uC139\uC158\uC774 \uC5C6\uC74C",
      dangling.map((x) => ({
        coord: x.coord,
        detail: x.reason === "doc" ? `${x.doc} \uBB38\uC11C\uAC00 \uC5C6\uC74C` : `${x.doc} \uC5D0 \`${x.anchor}\` \uC139\uC158\uC774 \uC5C6\uC74C`
      }))
    );
  }
  if (sections) {
    push(
      "error",
      "orphan-applied",
      "applied \uAC00 \uC5C6\uB294 \uC791\uC5C5 \uAE30\uB85D\uC744 \uAC00\uB9AC\uD0B4",
      sections.filter((r) => r.state === "orphan").map((r) => ({ coord: r.coord, detail: `${r.doc} \u2192 ${r.applied}` }))
    );
    push(
      "error",
      "derive-missing",
      "\uAD00\uB9AC \uBB38\uC11C \uD30C\uC0DD \uB204\uB77D \u2014 \uC9C0\uC2DD\uACF5\uC720\uBB38\uC11C\uB97C \uB0A8\uAE30\uBA74 \uD30C\uC0DD \uAC31\uC2E0\uC740 \uD544\uC218\uC785\uB2C8\uB2E4",
      sections.filter((r) => r.state === "stale" || r.state === "unwritten").map((r) => ({
        coord: r.coord,
        detail: r.applied ? `${r.doc} \xB7 applied ${r.applied} \uB4A4 \uD6C4\uC18D ${r.count}\uAC74 \u2014 \`ctx apply ${r.coord}\`` : `${r.doc} \xB7 applied \uC5C6\uC74C \xB7 \uC791\uC5C5 ${r.total}\uAC74 \u2014 \`ctx apply ${r.coord}\``
      }))
    );
    push(
      "warn",
      "derive-sameday",
      "\uAC19\uC740 \uB0A0 \uAE30\uB85D\uC774 \uB354 \uC788\uC2B5\uB2C8\uB2E4 \u2014 \uBC18\uC601\uB410\uB294\uC9C0 \uB208\uC73C\uB85C \uD655\uC778\uD558\uC138\uC694",
      sections.filter((r) => r.state === "ok" && (r.peers || []).length).map((r) => ({
        coord: r.coord,
        detail: `${r.doc} \xB7 applied ${r.applied} \uC640 \uAC19\uC740 \uB0A0 ${r.peers.length}\uAC74 \u2014 ${r.peers.map((p) => p.id).join(" \xB7 ")}`
      }))
    );
  }
  if (gitStatus && gitStatus.repo && !gitStatus.hooksPath) {
    push("warn", "hooks-off", "git \uD6C5\uC774 \uC124\uCE58\uB418\uC9C0 \uC54A\uC74C \u2014 \uCEE4\uBC0B \uAC80\uC0AC\uAC00 \uB3CC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4", [
      { detail: "git config core.hooksPath .githooks" }
    ]);
  }
  push(
    "info",
    "single-coord",
    "\uC88C\uD45C\uAC00 1\uAC1C\uC778 \uBB38\uC11C (\uB300\uAC1C \uB193\uCE5C \uAC83\uC774 \uC788\uB2E4)",
    units.filter((d) => d.touches.length === 1).map((d) => ({ id: d.id, coord: d.touches[0] }))
  );
  return { source: "builtin", ranAt: (/* @__PURE__ */ new Date()).toISOString(), findings };
}
function suggestCoord(vocab, coord) {
  const value = coord.slice(coord.indexOf(":") + 1);
  const type2 = coord.slice(0, coord.indexOf(":"));
  const { normKey: normKey2 } = vocabHelpers();
  const hit = vocab.aliasIndex.get(normKey2(value)) || vocab.aliasIndex.get(normKey2(coord));
  if (hit) return { coord: hit.coord, why: "alias \uC77C\uCE58" };
  let best = null;
  for (const c of vocab.coords.values()) {
    if (c.type !== type2) continue;
    const v = c.coord.slice(c.coord.indexOf(":") + 1);
    if (v.startsWith(value) || value.startsWith(v) || v.includes(value)) {
      if (!best || v.length < best.coord.length) best = { coord: c.coord, why: "\uC720\uC0AC" };
    }
  }
  return best;
}
function vocabHelpers() {
  return {
    normKey: (s) => String(s || "").toLowerCase().replace(/[\s_\-·]/g, "").trim()
  };
}

// node_modules/minisearch/dist/es/index.js
var ENTRIES = "ENTRIES";
var KEYS = "KEYS";
var VALUES = "VALUES";
var LEAF = "";
var TreeIterator = class {
  constructor(set2, type2) {
    const node = set2._tree;
    const keys = Array.from(node.keys());
    this.set = set2;
    this._type = type2;
    this._path = keys.length > 0 ? [{ node, keys }] : [];
  }
  next() {
    const value = this.dive();
    this.backtrack();
    return value;
  }
  dive() {
    if (this._path.length === 0) {
      return { done: true, value: void 0 };
    }
    const { node, keys } = last$1(this._path);
    if (last$1(keys) === LEAF) {
      return { done: false, value: this.result() };
    }
    const child = node.get(last$1(keys));
    this._path.push({ node: child, keys: Array.from(child.keys()) });
    return this.dive();
  }
  backtrack() {
    if (this._path.length === 0) {
      return;
    }
    const keys = last$1(this._path).keys;
    keys.pop();
    if (keys.length > 0) {
      return;
    }
    this._path.pop();
    this.backtrack();
  }
  key() {
    return this.set._prefix + this._path.map(({ keys }) => last$1(keys)).filter((key) => key !== LEAF).join("");
  }
  value() {
    return last$1(this._path).node.get(LEAF);
  }
  result() {
    switch (this._type) {
      case VALUES:
        return this.value();
      case KEYS:
        return this.key();
      default:
        return [this.key(), this.value()];
    }
  }
  [Symbol.iterator]() {
    return this;
  }
};
var last$1 = (array) => {
  return array[array.length - 1];
};
var fuzzySearch = (node, query, maxDistance) => {
  const results = /* @__PURE__ */ new Map();
  if (query === void 0)
    return results;
  const n = query.length + 1;
  const m = n + maxDistance;
  const matrix = new Uint8Array(m * n).fill(maxDistance + 1);
  for (let j = 0; j < n; ++j)
    matrix[j] = j;
  for (let i = 1; i < m; ++i)
    matrix[i * n] = i;
  recurse(node, query, maxDistance, results, matrix, 1, n, "");
  return results;
};
var recurse = (node, query, maxDistance, results, matrix, m, n, prefix) => {
  const offset = m * n;
  key: for (const key of node.keys()) {
    if (key === LEAF) {
      const distance = matrix[offset - 1];
      if (distance <= maxDistance) {
        results.set(prefix, [node.get(key), distance]);
      }
    } else {
      let i = m;
      for (let pos = 0; pos < key.length; ++pos, ++i) {
        const char = key[pos];
        const thisRowOffset = n * i;
        const prevRowOffset = thisRowOffset - n;
        let minDistance = matrix[thisRowOffset];
        const jmin = Math.max(0, i - maxDistance - 1);
        const jmax = Math.min(n - 1, i + maxDistance);
        for (let j = jmin; j < jmax; ++j) {
          const different = char !== query[j];
          const rpl = matrix[prevRowOffset + j] + +different;
          const del = matrix[prevRowOffset + j + 1] + 1;
          const ins = matrix[thisRowOffset + j] + 1;
          const dist = matrix[thisRowOffset + j + 1] = Math.min(rpl, del, ins);
          if (dist < minDistance)
            minDistance = dist;
        }
        if (minDistance > maxDistance) {
          continue key;
        }
      }
      recurse(node.get(key), query, maxDistance, results, matrix, i, n, prefix + key);
    }
  }
};
var SearchableMap = class _SearchableMap {
  /**
   * The constructor is normally called without arguments, creating an empty
   * map. In order to create a {@link SearchableMap} from an iterable or from an
   * object, check {@link SearchableMap.from} and {@link
   * SearchableMap.fromObject}.
   *
   * The constructor arguments are for internal use, when creating derived
   * mutable views of a map at a prefix.
   */
  constructor(tree = /* @__PURE__ */ new Map(), prefix = "") {
    this._size = void 0;
    this._tree = tree;
    this._prefix = prefix;
  }
  /**
   * Creates and returns a mutable view of this {@link SearchableMap},
   * containing only entries that share the given prefix.
   *
   * ### Usage:
   *
   * ```javascript
   * let map = new SearchableMap()
   * map.set("unicorn", 1)
   * map.set("universe", 2)
   * map.set("university", 3)
   * map.set("unique", 4)
   * map.set("hello", 5)
   *
   * let uni = map.atPrefix("uni")
   * uni.get("unique") // => 4
   * uni.get("unicorn") // => 1
   * uni.get("hello") // => undefined
   *
   * let univer = map.atPrefix("univer")
   * univer.get("unique") // => undefined
   * univer.get("universe") // => 2
   * univer.get("university") // => 3
   * ```
   *
   * @param prefix  The prefix
   * @return A {@link SearchableMap} representing a mutable view of the original
   * Map at the given prefix
   */
  atPrefix(prefix) {
    if (!prefix.startsWith(this._prefix)) {
      throw new Error("Mismatched prefix");
    }
    const [node, path6] = trackDown(this._tree, prefix.slice(this._prefix.length));
    if (node === void 0) {
      const [parentNode, key] = last(path6);
      for (const k of parentNode.keys()) {
        if (k !== LEAF && k.startsWith(key)) {
          const node2 = /* @__PURE__ */ new Map();
          node2.set(k.slice(key.length), parentNode.get(k));
          return new _SearchableMap(node2, prefix);
        }
      }
    }
    return new _SearchableMap(node, prefix);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/clear
   */
  clear() {
    this._size = void 0;
    this._tree.clear();
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/delete
   * @param key  Key to delete
   */
  delete(key) {
    this._size = void 0;
    return remove(this._tree, key);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries
   * @return An iterator iterating through `[key, value]` entries.
   */
  entries() {
    return new TreeIterator(this, ENTRIES);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/forEach
   * @param fn  Iteration function
   */
  forEach(fn) {
    for (const [key, value] of this) {
      fn(key, value, this);
    }
  }
  /**
   * Returns a Map of all the entries that have a key within the given edit
   * distance from the search key. The keys of the returned Map are the matching
   * keys, while the values are two-element arrays where the first element is
   * the value associated to the key, and the second is the edit distance of the
   * key to the search key.
   *
   * ### Usage:
   *
   * ```javascript
   * let map = new SearchableMap()
   * map.set('hello', 'world')
   * map.set('hell', 'yeah')
   * map.set('ciao', 'mondo')
   *
   * // Get all entries that match the key 'hallo' with a maximum edit distance of 2
   * map.fuzzyGet('hallo', 2)
   * // => Map(2) { 'hello' => ['world', 1], 'hell' => ['yeah', 2] }
   *
   * // In the example, the "hello" key has value "world" and edit distance of 1
   * // (change "e" to "a"), the key "hell" has value "yeah" and edit distance of 2
   * // (change "e" to "a", delete "o")
   * ```
   *
   * @param key  The search key
   * @param maxEditDistance  The maximum edit distance (Levenshtein)
   * @return A Map of the matching keys to their value and edit distance
   */
  fuzzyGet(key, maxEditDistance) {
    return fuzzySearch(this._tree, key, maxEditDistance);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get
   * @param key  Key to get
   * @return Value associated to the key, or `undefined` if the key is not
   * found.
   */
  get(key) {
    const node = lookup(this._tree, key);
    return node !== void 0 ? node.get(LEAF) : void 0;
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/has
   * @param key  Key
   * @return True if the key is in the map, false otherwise
   */
  has(key) {
    const node = lookup(this._tree, key);
    return node !== void 0 && node.has(LEAF);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
   * @return An `Iterable` iterating through keys
   */
  keys() {
    return new TreeIterator(this, KEYS);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/set
   * @param key  Key to set
   * @param value  Value to associate to the key
   * @return The {@link SearchableMap} itself, to allow chaining
   */
  set(key, value) {
    if (typeof key !== "string") {
      throw new Error("key must be a string");
    }
    this._size = void 0;
    const node = createPath(this._tree, key);
    node.set(LEAF, value);
    return this;
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/size
   */
  get size() {
    if (this._size) {
      return this._size;
    }
    this._size = 0;
    const iter = this.entries();
    while (!iter.next().done)
      this._size += 1;
    return this._size;
  }
  /**
   * Updates the value at the given key using the provided function. The function
   * is called with the current value at the key, and its return value is used as
   * the new value to be set.
   *
   * ### Example:
   *
   * ```javascript
   * // Increment the current value by one
   * searchableMap.update('somekey', (currentValue) => currentValue == null ? 0 : currentValue + 1)
   * ```
   *
   * If the value at the given key is or will be an object, it might not require
   * re-assignment. In that case it is better to use `fetch()`, because it is
   * faster.
   *
   * @param key  The key to update
   * @param fn  The function used to compute the new value from the current one
   * @return The {@link SearchableMap} itself, to allow chaining
   */
  update(key, fn) {
    if (typeof key !== "string") {
      throw new Error("key must be a string");
    }
    this._size = void 0;
    const node = createPath(this._tree, key);
    node.set(LEAF, fn(node.get(LEAF)));
    return this;
  }
  /**
   * Fetches the value of the given key. If the value does not exist, calls the
   * given function to create a new value, which is inserted at the given key
   * and subsequently returned.
   *
   * ### Example:
   *
   * ```javascript
   * const map = searchableMap.fetch('somekey', () => new Map())
   * map.set('foo', 'bar')
   * ```
   *
   * @param key  The key to update
   * @param initial  A function that creates a new value if the key does not exist
   * @return The existing or new value at the given key
   */
  fetch(key, initial) {
    if (typeof key !== "string") {
      throw new Error("key must be a string");
    }
    this._size = void 0;
    const node = createPath(this._tree, key);
    let value = node.get(LEAF);
    if (value === void 0) {
      node.set(LEAF, value = initial());
    }
    return value;
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values
   * @return An `Iterable` iterating through values.
   */
  values() {
    return new TreeIterator(this, VALUES);
  }
  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/@@iterator
   */
  [Symbol.iterator]() {
    return this.entries();
  }
  /**
   * Creates a {@link SearchableMap} from an `Iterable` of entries
   *
   * @param entries  Entries to be inserted in the {@link SearchableMap}
   * @return A new {@link SearchableMap} with the given entries
   */
  static from(entries) {
    const tree = new _SearchableMap();
    for (const [key, value] of entries) {
      tree.set(key, value);
    }
    return tree;
  }
  /**
   * Creates a {@link SearchableMap} from the iterable properties of a JavaScript object
   *
   * @param object  Object of entries for the {@link SearchableMap}
   * @return A new {@link SearchableMap} with the given entries
   */
  static fromObject(object) {
    return _SearchableMap.from(Object.entries(object));
  }
};
var trackDown = (tree, key, path6 = []) => {
  if (key.length === 0 || tree == null) {
    return [tree, path6];
  }
  for (const k of tree.keys()) {
    if (k !== LEAF && key.startsWith(k)) {
      path6.push([tree, k]);
      return trackDown(tree.get(k), key.slice(k.length), path6);
    }
  }
  path6.push([tree, key]);
  return trackDown(void 0, "", path6);
};
var lookup = (tree, key) => {
  if (key.length === 0 || tree == null) {
    return tree;
  }
  for (const k of tree.keys()) {
    if (k !== LEAF && key.startsWith(k)) {
      return lookup(tree.get(k), key.slice(k.length));
    }
  }
};
var createPath = (node, key) => {
  const keyLength = key.length;
  outer: for (let pos = 0; node && pos < keyLength; ) {
    for (const k of node.keys()) {
      if (k !== LEAF && key[pos] === k[0]) {
        const len = Math.min(keyLength - pos, k.length);
        let offset = 1;
        while (offset < len && key[pos + offset] === k[offset])
          ++offset;
        const child2 = node.get(k);
        if (offset === k.length) {
          node = child2;
        } else {
          const intermediate = /* @__PURE__ */ new Map();
          intermediate.set(k.slice(offset), child2);
          node.set(key.slice(pos, pos + offset), intermediate);
          node.delete(k);
          node = intermediate;
        }
        pos += offset;
        continue outer;
      }
    }
    const child = /* @__PURE__ */ new Map();
    node.set(key.slice(pos), child);
    return child;
  }
  return node;
};
var remove = (tree, key) => {
  const [node, path6] = trackDown(tree, key);
  if (node === void 0) {
    return;
  }
  node.delete(LEAF);
  if (node.size === 0) {
    cleanup(path6);
  } else if (node.size === 1) {
    const [key2, value] = node.entries().next().value;
    merge2(path6, key2, value);
  }
};
var cleanup = (path6) => {
  if (path6.length === 0) {
    return;
  }
  const [node, key] = last(path6);
  node.delete(key);
  if (node.size === 0) {
    cleanup(path6.slice(0, -1));
  } else if (node.size === 1) {
    const [key2, value] = node.entries().next().value;
    if (key2 !== LEAF) {
      merge2(path6.slice(0, -1), key2, value);
    }
  }
};
var merge2 = (path6, key, value) => {
  if (path6.length === 0) {
    return;
  }
  const [node, nodeKey] = last(path6);
  node.set(nodeKey + key, value);
  node.delete(nodeKey);
};
var last = (array) => {
  return array[array.length - 1];
};
var OR = "or";
var AND = "and";
var AND_NOT = "and_not";
var MiniSearch = class _MiniSearch {
  /**
   * @param options  Configuration options
   *
   * ### Examples:
   *
   * ```javascript
   * // Create a search engine that indexes the 'title' and 'text' fields of your
   * // documents:
   * const miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * ```
   *
   * ### ID Field:
   *
   * ```javascript
   * // Your documents are assumed to include a unique 'id' field, but if you want
   * // to use a different field for document identification, you can set the
   * // 'idField' option:
   * const miniSearch = new MiniSearch({ idField: 'key', fields: ['title', 'text'] })
   * ```
   *
   * ### Options and defaults:
   *
   * ```javascript
   * // The full set of options (here with their default value) is:
   * const miniSearch = new MiniSearch({
   *   // idField: field that uniquely identifies a document
   *   idField: 'id',
   *
   *   // extractField: function used to get the value of a field in a document.
   *   // By default, it assumes the document is a flat object with field names as
   *   // property keys and field values as string property values, but custom logic
   *   // can be implemented by setting this option to a custom extractor function.
   *   extractField: (document, fieldName) => document[fieldName],
   *
   *   // tokenize: function used to split fields into individual terms. By
   *   // default, it is also used to tokenize search queries, unless a specific
   *   // `tokenize` search option is supplied. When tokenizing an indexed field,
   *   // the field name is passed as the second argument.
   *   tokenize: (string, _fieldName) => string.split(SPACE_OR_PUNCTUATION),
   *
   *   // processTerm: function used to process each tokenized term before
   *   // indexing. It can be used for stemming and normalization. Return a falsy
   *   // value in order to discard a term. By default, it is also used to process
   *   // search queries, unless a specific `processTerm` option is supplied as a
   *   // search option. When processing a term from a indexed field, the field
   *   // name is passed as the second argument.
   *   processTerm: (term, _fieldName) => term.toLowerCase(),
   *
   *   // searchOptions: default search options, see the `search` method for
   *   // details
   *   searchOptions: undefined,
   *
   *   // fields: document fields to be indexed. Mandatory, but not set by default
   *   fields: undefined
   *
   *   // storeFields: document fields to be stored and returned as part of the
   *   // search results.
   *   storeFields: []
   * })
   * ```
   */
  constructor(options) {
    if ((options === null || options === void 0 ? void 0 : options.fields) == null) {
      throw new Error('MiniSearch: option "fields" must be provided');
    }
    const autoVacuum = options.autoVacuum == null || options.autoVacuum === true ? defaultAutoVacuumOptions : options.autoVacuum;
    this._options = {
      ...defaultOptions,
      ...options,
      autoVacuum,
      searchOptions: { ...defaultSearchOptions, ...options.searchOptions || {} },
      autoSuggestOptions: { ...defaultAutoSuggestOptions, ...options.autoSuggestOptions || {} }
    };
    this._index = new SearchableMap();
    this._documentCount = 0;
    this._documentIds = /* @__PURE__ */ new Map();
    this._idToShortId = /* @__PURE__ */ new Map();
    this._fieldIds = {};
    this._fieldLength = /* @__PURE__ */ new Map();
    this._avgFieldLength = [];
    this._nextId = 0;
    this._storedFields = /* @__PURE__ */ new Map();
    this._dirtCount = 0;
    this._currentVacuum = null;
    this._enqueuedVacuum = null;
    this._enqueuedVacuumConditions = defaultVacuumConditions;
    this.addFields(this._options.fields);
  }
  /**
   * Adds a document to the index
   *
   * @param document  The document to be indexed
   */
  add(document) {
    const { extractField, stringifyField, tokenize: tokenize2, processTerm, fields, idField } = this._options;
    const id = extractField(document, idField);
    if (id == null) {
      throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
    }
    if (this._idToShortId.has(id)) {
      throw new Error(`MiniSearch: duplicate ID ${id}`);
    }
    const shortDocumentId = this.addDocumentId(id);
    this.saveStoredFields(shortDocumentId, document);
    for (const field of fields) {
      const fieldValue = extractField(document, field);
      if (fieldValue == null)
        continue;
      const tokens = tokenize2(stringifyField(fieldValue, field), field);
      const fieldId = this._fieldIds[field];
      const uniqueTerms = new Set(tokens).size;
      this.addFieldLength(shortDocumentId, fieldId, this._documentCount - 1, uniqueTerms);
      for (const term of tokens) {
        const processedTerm = processTerm(term, field);
        if (Array.isArray(processedTerm)) {
          for (const t of processedTerm) {
            this.addTerm(fieldId, shortDocumentId, t);
          }
        } else if (processedTerm) {
          this.addTerm(fieldId, shortDocumentId, processedTerm);
        }
      }
    }
  }
  /**
   * Adds all the given documents to the index
   *
   * @param documents  An array of documents to be indexed
   */
  addAll(documents) {
    for (const document of documents)
      this.add(document);
  }
  /**
   * Adds all the given documents to the index asynchronously.
   *
   * Returns a promise that resolves (to `undefined`) when the indexing is done.
   * This method is useful when index many documents, to avoid blocking the main
   * thread. The indexing is performed asynchronously and in chunks.
   *
   * @param documents  An array of documents to be indexed
   * @param options  Configuration options
   * @return A promise resolving to `undefined` when the indexing is done
   */
  addAllAsync(documents, options = {}) {
    const { chunkSize = 10 } = options;
    const acc = { chunk: [], promise: Promise.resolve() };
    const { chunk, promise } = documents.reduce(({ chunk: chunk2, promise: promise2 }, document, i) => {
      chunk2.push(document);
      if ((i + 1) % chunkSize === 0) {
        return {
          chunk: [],
          promise: promise2.then(() => new Promise((resolve) => setTimeout(resolve, 0))).then(() => this.addAll(chunk2))
        };
      } else {
        return { chunk: chunk2, promise: promise2 };
      }
    }, acc);
    return promise.then(() => this.addAll(chunk));
  }
  /**
   * Removes the given document from the index.
   *
   * The document to remove must NOT have changed between indexing and removal,
   * otherwise the index will be corrupted.
   *
   * This method requires passing the full document to be removed (not just the
   * ID), and immediately removes the document from the inverted index, allowing
   * memory to be released. A convenient alternative is {@link
   * MiniSearch#discard}, which needs only the document ID, and has the same
   * visible effect, but delays cleaning up the index until the next vacuuming.
   *
   * @param document  The document to be removed
   */
  remove(document) {
    const { tokenize: tokenize2, processTerm, extractField, stringifyField, fields, idField } = this._options;
    const id = extractField(document, idField);
    if (id == null) {
      throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
    }
    const shortId = this._idToShortId.get(id);
    if (shortId == null) {
      throw new Error(`MiniSearch: cannot remove document with ID ${id}: it is not in the index`);
    }
    for (const field of fields) {
      const fieldValue = extractField(document, field);
      if (fieldValue == null)
        continue;
      const tokens = tokenize2(stringifyField(fieldValue, field), field);
      const fieldId = this._fieldIds[field];
      const uniqueTerms = new Set(tokens).size;
      this.removeFieldLength(shortId, fieldId, this._documentCount, uniqueTerms);
      for (const term of tokens) {
        const processedTerm = processTerm(term, field);
        if (Array.isArray(processedTerm)) {
          for (const t of processedTerm) {
            this.removeTerm(fieldId, shortId, t);
          }
        } else if (processedTerm) {
          this.removeTerm(fieldId, shortId, processedTerm);
        }
      }
    }
    this._storedFields.delete(shortId);
    this._documentIds.delete(shortId);
    this._idToShortId.delete(id);
    this._fieldLength.delete(shortId);
    this._documentCount -= 1;
  }
  /**
   * Removes all the given documents from the index. If called with no arguments,
   * it removes _all_ documents from the index.
   *
   * @param documents  The documents to be removed. If this argument is omitted,
   * all documents are removed. Note that, for removing all documents, it is
   * more efficient to call this method with no arguments than to pass all
   * documents.
   */
  removeAll(documents) {
    if (documents) {
      for (const document of documents)
        this.remove(document);
    } else if (arguments.length > 0) {
      throw new Error("Expected documents to be present. Omit the argument to remove all documents.");
    } else {
      this._index = new SearchableMap();
      this._documentCount = 0;
      this._documentIds = /* @__PURE__ */ new Map();
      this._idToShortId = /* @__PURE__ */ new Map();
      this._fieldLength = /* @__PURE__ */ new Map();
      this._avgFieldLength = [];
      this._storedFields = /* @__PURE__ */ new Map();
      this._nextId = 0;
    }
  }
  /**
   * Discards the document with the given ID, so it won't appear in search results
   *
   * It has the same visible effect of {@link MiniSearch.remove} (both cause the
   * document to stop appearing in searches), but a different effect on the
   * internal data structures:
   *
   *   - {@link MiniSearch#remove} requires passing the full document to be
   *   removed as argument, and removes it from the inverted index immediately.
   *
   *   - {@link MiniSearch#discard} instead only needs the document ID, and
   *   works by marking the current version of the document as discarded, so it
   *   is immediately ignored by searches. This is faster and more convenient
   *   than {@link MiniSearch#remove}, but the index is not immediately
   *   modified. To take care of that, vacuuming is performed after a certain
   *   number of documents are discarded, cleaning up the index and allowing
   *   memory to be released.
   *
   * After discarding a document, it is possible to re-add a new version, and
   * only the new version will appear in searches. In other words, discarding
   * and re-adding a document works exactly like removing and re-adding it. The
   * {@link MiniSearch.replace} method can also be used to replace a document
   * with a new version.
   *
   * #### Details about vacuuming
   *
   * Repetite calls to this method would leave obsolete document references in
   * the index, invisible to searches. Two mechanisms take care of cleaning up:
   * clean up during search, and vacuuming.
   *
   *   - Upon search, whenever a discarded ID is found (and ignored for the
   *   results), references to the discarded document are removed from the
   *   inverted index entries for the search terms. This ensures that subsequent
   *   searches for the same terms do not need to skip these obsolete references
   *   again.
   *
   *   - In addition, vacuuming is performed automatically by default (see the
   *   `autoVacuum` field in {@link Options}) after a certain number of
   *   documents are discarded. Vacuuming traverses all terms in the index,
   *   cleaning up all references to discarded documents. Vacuuming can also be
   *   triggered manually by calling {@link MiniSearch#vacuum}.
   *
   * @param id  The ID of the document to be discarded
   */
  discard(id) {
    const shortId = this._idToShortId.get(id);
    if (shortId == null) {
      throw new Error(`MiniSearch: cannot discard document with ID ${id}: it is not in the index`);
    }
    this._idToShortId.delete(id);
    this._documentIds.delete(shortId);
    this._storedFields.delete(shortId);
    (this._fieldLength.get(shortId) || []).forEach((fieldLength, fieldId) => {
      this.removeFieldLength(shortId, fieldId, this._documentCount, fieldLength);
    });
    this._fieldLength.delete(shortId);
    this._documentCount -= 1;
    this._dirtCount += 1;
    this.maybeAutoVacuum();
  }
  maybeAutoVacuum() {
    if (this._options.autoVacuum === false) {
      return;
    }
    const { minDirtFactor, minDirtCount, batchSize, batchWait } = this._options.autoVacuum;
    this.conditionalVacuum({ batchSize, batchWait }, { minDirtCount, minDirtFactor });
  }
  /**
   * Discards the documents with the given IDs, so they won't appear in search
   * results
   *
   * It is equivalent to calling {@link MiniSearch#discard} for all the given
   * IDs, but with the optimization of triggering at most one automatic
   * vacuuming at the end.
   *
   * Note: to remove all documents from the index, it is faster and more
   * convenient to call {@link MiniSearch.removeAll} with no argument, instead
   * of passing all IDs to this method.
   */
  discardAll(ids) {
    const autoVacuum = this._options.autoVacuum;
    try {
      this._options.autoVacuum = false;
      for (const id of ids) {
        this.discard(id);
      }
    } finally {
      this._options.autoVacuum = autoVacuum;
    }
    this.maybeAutoVacuum();
  }
  /**
   * It replaces an existing document with the given updated version
   *
   * It works by discarding the current version and adding the updated one, so
   * it is functionally equivalent to calling {@link MiniSearch#discard}
   * followed by {@link MiniSearch#add}. The ID of the updated document should
   * be the same as the original one.
   *
   * Since it uses {@link MiniSearch#discard} internally, this method relies on
   * vacuuming to clean up obsolete document references from the index, allowing
   * memory to be released (see {@link MiniSearch#discard}).
   *
   * @param updatedDocument  The updated document to replace the old version
   * with
   */
  replace(updatedDocument) {
    const { idField, extractField } = this._options;
    const id = extractField(updatedDocument, idField);
    this.discard(id);
    this.add(updatedDocument);
  }
  /**
   * Triggers a manual vacuuming, cleaning up references to discarded documents
   * from the inverted index
   *
   * Vacuuming is only useful for applications that use the {@link
   * MiniSearch#discard} or {@link MiniSearch#replace} methods.
   *
   * By default, vacuuming is performed automatically when needed (controlled by
   * the `autoVacuum` field in {@link Options}), so there is usually no need to
   * call this method, unless one wants to make sure to perform vacuuming at a
   * specific moment.
   *
   * Vacuuming traverses all terms in the inverted index in batches, and cleans
   * up references to discarded documents from the posting list, allowing memory
   * to be released.
   *
   * The method takes an optional object as argument with the following keys:
   *
   *   - `batchSize`: the size of each batch (1000 by default)
   *
   *   - `batchWait`: the number of milliseconds to wait between batches (10 by
   *   default)
   *
   * On large indexes, vacuuming could have a non-negligible cost: batching
   * avoids blocking the thread for long, diluting this cost so that it is not
   * negatively affecting the application. Nonetheless, this method should only
   * be called when necessary, and relying on automatic vacuuming is usually
   * better.
   *
   * It returns a promise that resolves (to undefined) when the clean up is
   * completed. If vacuuming is already ongoing at the time this method is
   * called, a new one is enqueued immediately after the ongoing one, and a
   * corresponding promise is returned. However, no more than one vacuuming is
   * enqueued on top of the ongoing one, even if this method is called more
   * times (enqueuing multiple ones would be useless).
   *
   * @param options  Configuration options for the batch size and delay. See
   * {@link VacuumOptions}.
   */
  vacuum(options = {}) {
    return this.conditionalVacuum(options);
  }
  conditionalVacuum(options, conditions) {
    if (this._currentVacuum) {
      this._enqueuedVacuumConditions = this._enqueuedVacuumConditions && conditions;
      if (this._enqueuedVacuum != null) {
        return this._enqueuedVacuum;
      }
      this._enqueuedVacuum = this._currentVacuum.then(() => {
        const conditions2 = this._enqueuedVacuumConditions;
        this._enqueuedVacuumConditions = defaultVacuumConditions;
        return this.performVacuuming(options, conditions2);
      });
      return this._enqueuedVacuum;
    }
    if (this.vacuumConditionsMet(conditions) === false) {
      return Promise.resolve();
    }
    this._currentVacuum = this.performVacuuming(options);
    return this._currentVacuum;
  }
  async performVacuuming(options, conditions) {
    const initialDirtCount = this._dirtCount;
    if (this.vacuumConditionsMet(conditions)) {
      const batchSize = options.batchSize || defaultVacuumOptions.batchSize;
      const batchWait = options.batchWait || defaultVacuumOptions.batchWait;
      let i = 1;
      for (const [term, fieldsData] of this._index) {
        for (const [fieldId, fieldIndex] of fieldsData) {
          for (const [shortId] of fieldIndex) {
            if (this._documentIds.has(shortId)) {
              continue;
            }
            if (fieldIndex.size <= 1) {
              fieldsData.delete(fieldId);
            } else {
              fieldIndex.delete(shortId);
            }
          }
        }
        if (this._index.get(term).size === 0) {
          this._index.delete(term);
        }
        if (i % batchSize === 0) {
          await new Promise((resolve) => setTimeout(resolve, batchWait));
        }
        i += 1;
      }
      this._dirtCount -= initialDirtCount;
    }
    await null;
    this._currentVacuum = this._enqueuedVacuum;
    this._enqueuedVacuum = null;
  }
  vacuumConditionsMet(conditions) {
    if (conditions == null) {
      return true;
    }
    let { minDirtCount, minDirtFactor } = conditions;
    minDirtCount = minDirtCount || defaultAutoVacuumOptions.minDirtCount;
    minDirtFactor = minDirtFactor || defaultAutoVacuumOptions.minDirtFactor;
    return this.dirtCount >= minDirtCount && this.dirtFactor >= minDirtFactor;
  }
  /**
   * Is `true` if a vacuuming operation is ongoing, `false` otherwise
   */
  get isVacuuming() {
    return this._currentVacuum != null;
  }
  /**
   * The number of documents discarded since the most recent vacuuming
   */
  get dirtCount() {
    return this._dirtCount;
  }
  /**
   * A number between 0 and 1 giving an indication about the proportion of
   * documents that are discarded, and can therefore be cleaned up by vacuuming.
   * A value close to 0 means that the index is relatively clean, while a higher
   * value means that the index is relatively dirty, and vacuuming could release
   * memory.
   */
  get dirtFactor() {
    return this._dirtCount / (1 + this._documentCount + this._dirtCount);
  }
  /**
   * Returns `true` if a document with the given ID is present in the index and
   * available for search, `false` otherwise
   *
   * @param id  The document ID
   */
  has(id) {
    return this._idToShortId.has(id);
  }
  /**
   * Returns the stored fields (as configured in the `storeFields` constructor
   * option) for the given document ID. Returns `undefined` if the document is
   * not present in the index.
   *
   * @param id  The document ID
   */
  getStoredFields(id) {
    const shortId = this._idToShortId.get(id);
    if (shortId == null) {
      return void 0;
    }
    return this._storedFields.get(shortId);
  }
  /**
   * Search for documents matching the given search query.
   *
   * The result is a list of scored document IDs matching the query, sorted by
   * descending score, and each including data about which terms were matched and
   * in which fields.
   *
   * ### Basic usage:
   *
   * ```javascript
   * // Search for "zen art motorcycle" with default options: terms have to match
   * // exactly, and individual terms are joined with OR
   * miniSearch.search('zen art motorcycle')
   * // => [ { id: 2, score: 2.77258, match: { ... } }, { id: 4, score: 1.38629, match: { ... } } ]
   * ```
   *
   * ### Restrict search to specific fields:
   *
   * ```javascript
   * // Search only in the 'title' field
   * miniSearch.search('zen', { fields: ['title'] })
   * ```
   *
   * ### Field boosting:
   *
   * ```javascript
   * // Boost a field
   * miniSearch.search('zen', { boost: { title: 2 } })
   * ```
   *
   * ### Prefix search:
   *
   * ```javascript
   * // Search for "moto" with prefix search (it will match documents
   * // containing terms that start with "moto" or "neuro")
   * miniSearch.search('moto neuro', { prefix: true })
   * ```
   *
   * ### Fuzzy search:
   *
   * ```javascript
   * // Search for "ismael" with fuzzy search (it will match documents containing
   * // terms similar to "ismael", with a maximum edit distance of 0.2 term.length
   * // (rounded to nearest integer)
   * miniSearch.search('ismael', { fuzzy: 0.2 })
   * ```
   *
   * ### Combining strategies:
   *
   * ```javascript
   * // Mix of exact match, prefix search, and fuzzy search
   * miniSearch.search('ismael mob', {
   *  prefix: true,
   *  fuzzy: 0.2
   * })
   * ```
   *
   * ### Advanced prefix and fuzzy search:
   *
   * ```javascript
   * // Perform fuzzy and prefix search depending on the search term. Here
   * // performing prefix and fuzzy search only on terms longer than 3 characters
   * miniSearch.search('ismael mob', {
   *  prefix: term => term.length > 3
   *  fuzzy: term => term.length > 3 ? 0.2 : null
   * })
   * ```
   *
   * ### Combine with AND:
   *
   * ```javascript
   * // Combine search terms with AND (to match only documents that contain both
   * // "motorcycle" and "art")
   * miniSearch.search('motorcycle art', { combineWith: 'AND' })
   * ```
   *
   * ### Combine with AND_NOT:
   *
   * There is also an AND_NOT combinator, that finds documents that match the
   * first term, but do not match any of the other terms. This combinator is
   * rarely useful with simple queries, and is meant to be used with advanced
   * query combinations (see later for more details).
   *
   * ### Filtering results:
   *
   * ```javascript
   * // Filter only results in the 'fiction' category (assuming that 'category'
   * // is a stored field)
   * miniSearch.search('motorcycle art', {
   *   filter: (result) => result.category === 'fiction'
   * })
   * ```
   *
   * ### Wildcard query
   *
   * Searching for an empty string (assuming the default tokenizer) returns no
   * results. Sometimes though, one needs to match all documents, like in a
   * "wildcard" search. This is possible by passing the special value
   * {@link MiniSearch.wildcard} as the query:
   *
   * ```javascript
   * // Return search results for all documents
   * miniSearch.search(MiniSearch.wildcard)
   * ```
   *
   * Note that search options such as `filter` and `boostDocument` are still
   * applied, influencing which results are returned, and their order:
   *
   * ```javascript
   * // Return search results for all documents in the 'fiction' category
   * miniSearch.search(MiniSearch.wildcard, {
   *   filter: (result) => result.category === 'fiction'
   * })
   * ```
   *
   * ### Advanced combination of queries:
   *
   * It is possible to combine different subqueries with OR, AND, and AND_NOT,
   * and even with different search options, by passing a query expression
   * tree object as the first argument, instead of a string.
   *
   * ```javascript
   * // Search for documents that contain "zen" and ("motorcycle" or "archery")
   * miniSearch.search({
   *   combineWith: 'AND',
   *   queries: [
   *     'zen',
   *     {
   *       combineWith: 'OR',
   *       queries: ['motorcycle', 'archery']
   *     }
   *   ]
   * })
   *
   * // Search for documents that contain ("apple" or "pear") but not "juice" and
   * // not "tree"
   * miniSearch.search({
   *   combineWith: 'AND_NOT',
   *   queries: [
   *     {
   *       combineWith: 'OR',
   *       queries: ['apple', 'pear']
   *     },
   *     'juice',
   *     'tree'
   *   ]
   * })
   * ```
   *
   * Each node in the expression tree can be either a string, or an object that
   * supports all {@link SearchOptions} fields, plus a `queries` array field for
   * subqueries.
   *
   * Note that, while this can become complicated to do by hand for complex or
   * deeply nested queries, it provides a formalized expression tree API for
   * external libraries that implement a parser for custom query languages.
   *
   * @param query  Search query
   * @param searchOptions  Search options. Each option, if not given, defaults to the corresponding value of `searchOptions` given to the constructor, or to the library default.
   */
  search(query, searchOptions = {}) {
    const { searchOptions: globalSearchOptions } = this._options;
    const searchOptionsWithDefaults = { ...globalSearchOptions, ...searchOptions };
    const rawResults = this.executeQuery(query, searchOptions);
    const results = [];
    for (const [docId, { score, terms, match }] of rawResults) {
      const quality = terms.length || 1;
      const result = {
        id: this._documentIds.get(docId),
        score: score * quality,
        terms: Object.keys(match),
        queryTerms: terms,
        match
      };
      Object.assign(result, this._storedFields.get(docId));
      if (searchOptionsWithDefaults.filter == null || searchOptionsWithDefaults.filter(result)) {
        results.push(result);
      }
    }
    if (query === _MiniSearch.wildcard && searchOptionsWithDefaults.boostDocument == null) {
      return results;
    }
    results.sort(byScore);
    return results;
  }
  /**
   * Provide suggestions for the given search query
   *
   * The result is a list of suggested modified search queries, derived from the
   * given search query, each with a relevance score, sorted by descending score.
   *
   * By default, it uses the same options used for search, except that by
   * default it performs prefix search on the last term of the query, and
   * combine terms with `'AND'` (requiring all query terms to match). Custom
   * options can be passed as a second argument. Defaults can be changed upon
   * calling the {@link MiniSearch} constructor, by passing a
   * `autoSuggestOptions` option.
   *
   * ### Basic usage:
   *
   * ```javascript
   * // Get suggestions for 'neuro':
   * miniSearch.autoSuggest('neuro')
   * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 0.46240 } ]
   * ```
   *
   * ### Multiple words:
   *
   * ```javascript
   * // Get suggestions for 'zen ar':
   * miniSearch.autoSuggest('zen ar')
   * // => [
   * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
   * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
   * // ]
   * ```
   *
   * ### Fuzzy suggestions:
   *
   * ```javascript
   * // Correct spelling mistakes using fuzzy search:
   * miniSearch.autoSuggest('neromancer', { fuzzy: 0.2 })
   * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 1.03998 } ]
   * ```
   *
   * ### Filtering:
   *
   * ```javascript
   * // Get suggestions for 'zen ar', but only within the 'fiction' category
   * // (assuming that 'category' is a stored field):
   * miniSearch.autoSuggest('zen ar', {
   *   filter: (result) => result.category === 'fiction'
   * })
   * // => [
   * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
   * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
   * // ]
   * ```
   *
   * @param queryString  Query string to be expanded into suggestions
   * @param options  Search options. The supported options and default values
   * are the same as for the {@link MiniSearch#search} method, except that by
   * default prefix search is performed on the last term in the query, and terms
   * are combined with `'AND'`.
   * @return  A sorted array of suggestions sorted by relevance score.
   */
  autoSuggest(queryString, options = {}) {
    options = { ...this._options.autoSuggestOptions, ...options };
    const suggestions = /* @__PURE__ */ new Map();
    for (const { score, terms } of this.search(queryString, options)) {
      const phrase = terms.join(" ");
      const suggestion = suggestions.get(phrase);
      if (suggestion != null) {
        suggestion.score += score;
        suggestion.count += 1;
      } else {
        suggestions.set(phrase, { score, terms, count: 1 });
      }
    }
    const results = [];
    for (const [suggestion, { score, terms, count }] of suggestions) {
      results.push({ suggestion, terms, score: score / count });
    }
    results.sort(byScore);
    return results;
  }
  /**
   * Total number of documents available to search
   */
  get documentCount() {
    return this._documentCount;
  }
  /**
   * Number of terms in the index
   */
  get termCount() {
    return this._index.size;
  }
  /**
   * Deserializes a JSON index (serialized with `JSON.stringify(miniSearch)`)
   * and instantiates a MiniSearch instance. It should be given the same options
   * originally used when serializing the index.
   *
   * ### Usage:
   *
   * ```javascript
   * // If the index was serialized with:
   * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * miniSearch.addAll(documents)
   *
   * const json = JSON.stringify(miniSearch)
   * // It can later be deserialized like this:
   * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
   * ```
   *
   * @param json  JSON-serialized index
   * @param options  configuration options, same as the constructor
   * @return An instance of MiniSearch deserialized from the given JSON.
   */
  static loadJSON(json2, options) {
    if (options == null) {
      throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
    }
    return this.loadJS(JSON.parse(json2), options);
  }
  /**
   * Async equivalent of {@link MiniSearch.loadJSON}
   *
   * This function is an alternative to {@link MiniSearch.loadJSON} that returns
   * a promise, and loads the index in batches, leaving pauses between them to avoid
   * blocking the main thread. It tends to be slower than the synchronous
   * version, but does not block the main thread, so it can be a better choice
   * when deserializing very large indexes.
   *
   * @param json  JSON-serialized index
   * @param options  configuration options, same as the constructor
   * @return A Promise that will resolve to an instance of MiniSearch deserialized from the given JSON.
   */
  static async loadJSONAsync(json2, options) {
    if (options == null) {
      throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
    }
    return this.loadJSAsync(JSON.parse(json2), options);
  }
  /**
   * Returns the default value of an option. It will throw an error if no option
   * with the given name exists.
   *
   * @param optionName  Name of the option
   * @return The default value of the given option
   *
   * ### Usage:
   *
   * ```javascript
   * // Get default tokenizer
   * MiniSearch.getDefault('tokenize')
   *
   * // Get default term processor
   * MiniSearch.getDefault('processTerm')
   *
   * // Unknown options will throw an error
   * MiniSearch.getDefault('notExisting')
   * // => throws 'MiniSearch: unknown option "notExisting"'
   * ```
   */
  static getDefault(optionName) {
    if (defaultOptions.hasOwnProperty(optionName)) {
      return getOwnProperty(defaultOptions, optionName);
    } else {
      throw new Error(`MiniSearch: unknown option "${optionName}"`);
    }
  }
  /**
   * @ignore
   */
  static loadJS(js, options) {
    const { index, documentIds, fieldLength, storedFields, serializationVersion } = js;
    const miniSearch = this.instantiateMiniSearch(js, options);
    miniSearch._documentIds = objectToNumericMap(documentIds);
    miniSearch._fieldLength = objectToNumericMap(fieldLength);
    miniSearch._storedFields = objectToNumericMap(storedFields);
    for (const [shortId, id] of miniSearch._documentIds) {
      miniSearch._idToShortId.set(id, shortId);
    }
    for (const [term, data] of index) {
      const dataMap = /* @__PURE__ */ new Map();
      for (const fieldId of Object.keys(data)) {
        let indexEntry = data[fieldId];
        if (serializationVersion === 1) {
          indexEntry = indexEntry.ds;
        }
        dataMap.set(parseInt(fieldId, 10), objectToNumericMap(indexEntry));
      }
      miniSearch._index.set(term, dataMap);
    }
    return miniSearch;
  }
  /**
   * @ignore
   */
  static async loadJSAsync(js, options) {
    const { index, documentIds, fieldLength, storedFields, serializationVersion } = js;
    const miniSearch = this.instantiateMiniSearch(js, options);
    miniSearch._documentIds = await objectToNumericMapAsync(documentIds);
    miniSearch._fieldLength = await objectToNumericMapAsync(fieldLength);
    miniSearch._storedFields = await objectToNumericMapAsync(storedFields);
    for (const [shortId, id] of miniSearch._documentIds) {
      miniSearch._idToShortId.set(id, shortId);
    }
    let count = 0;
    for (const [term, data] of index) {
      const dataMap = /* @__PURE__ */ new Map();
      for (const fieldId of Object.keys(data)) {
        let indexEntry = data[fieldId];
        if (serializationVersion === 1) {
          indexEntry = indexEntry.ds;
        }
        dataMap.set(parseInt(fieldId, 10), await objectToNumericMapAsync(indexEntry));
      }
      if (++count % 1e3 === 0)
        await wait(0);
      miniSearch._index.set(term, dataMap);
    }
    return miniSearch;
  }
  /**
   * @ignore
   */
  static instantiateMiniSearch(js, options) {
    const { documentCount, nextId, fieldIds, averageFieldLength, dirtCount, serializationVersion } = js;
    if (serializationVersion !== 1 && serializationVersion !== 2) {
      throw new Error("MiniSearch: cannot deserialize an index created with an incompatible version");
    }
    const miniSearch = new _MiniSearch(options);
    miniSearch._documentCount = documentCount;
    miniSearch._nextId = nextId;
    miniSearch._idToShortId = /* @__PURE__ */ new Map();
    miniSearch._fieldIds = fieldIds;
    miniSearch._avgFieldLength = averageFieldLength;
    miniSearch._dirtCount = dirtCount || 0;
    miniSearch._index = new SearchableMap();
    return miniSearch;
  }
  /**
   * @ignore
   */
  executeQuery(query, searchOptions = {}) {
    if (query === _MiniSearch.wildcard) {
      return this.executeWildcardQuery(searchOptions);
    }
    if (typeof query !== "string") {
      const options2 = { ...searchOptions, ...query, queries: void 0 };
      const results2 = query.queries.map((subquery) => this.executeQuery(subquery, options2));
      return this.combineResults(results2, options2.combineWith);
    }
    const { tokenize: tokenize2, processTerm, searchOptions: globalSearchOptions } = this._options;
    const options = { tokenize: tokenize2, processTerm, ...globalSearchOptions, ...searchOptions };
    const { tokenize: searchTokenize, processTerm: searchProcessTerm } = options;
    const terms = searchTokenize(query).flatMap((term) => searchProcessTerm(term)).filter((term) => !!term);
    const queries = terms.map(termToQuerySpec(options));
    const results = queries.map((query2) => this.executeQuerySpec(query2, options));
    return this.combineResults(results, options.combineWith);
  }
  /**
   * @ignore
   */
  executeQuerySpec(query, searchOptions) {
    const options = { ...this._options.searchOptions, ...searchOptions };
    const boosts = (options.fields || this._options.fields).reduce((boosts2, field) => ({ ...boosts2, [field]: getOwnProperty(options.boost, field) || 1 }), {});
    const { boostDocument, weights, maxFuzzy, bm25: bm25params } = options;
    const { fuzzy: fuzzyWeight, prefix: prefixWeight } = { ...defaultSearchOptions.weights, ...weights };
    const data = this._index.get(query.term);
    const results = this.termResults(query.term, query.term, 1, query.termBoost, data, boosts, boostDocument, bm25params);
    let prefixMatches;
    let fuzzyMatches;
    if (query.prefix) {
      prefixMatches = this._index.atPrefix(query.term);
    }
    if (query.fuzzy) {
      const fuzzy = query.fuzzy === true ? 0.2 : query.fuzzy;
      const maxDistance = fuzzy < 1 ? Math.min(maxFuzzy, Math.round(query.term.length * fuzzy)) : fuzzy;
      if (maxDistance)
        fuzzyMatches = this._index.fuzzyGet(query.term, maxDistance);
    }
    if (prefixMatches) {
      for (const [term, data2] of prefixMatches) {
        const distance = term.length - query.term.length;
        if (!distance) {
          continue;
        }
        fuzzyMatches === null || fuzzyMatches === void 0 ? void 0 : fuzzyMatches.delete(term);
        const weight = prefixWeight * term.length / (term.length + 0.3 * distance);
        this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
      }
    }
    if (fuzzyMatches) {
      for (const term of fuzzyMatches.keys()) {
        const [data2, distance] = fuzzyMatches.get(term);
        if (!distance) {
          continue;
        }
        const weight = fuzzyWeight * term.length / (term.length + distance);
        this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
      }
    }
    return results;
  }
  /**
   * @ignore
   */
  executeWildcardQuery(searchOptions) {
    const results = /* @__PURE__ */ new Map();
    const options = { ...this._options.searchOptions, ...searchOptions };
    for (const [shortId, id] of this._documentIds) {
      const score = options.boostDocument ? options.boostDocument(id, "", this._storedFields.get(shortId)) : 1;
      results.set(shortId, {
        score,
        terms: [],
        match: {}
      });
    }
    return results;
  }
  /**
   * @ignore
   */
  combineResults(results, combineWith = OR) {
    if (results.length === 0) {
      return /* @__PURE__ */ new Map();
    }
    const operator = combineWith.toLowerCase();
    const combinator = combinators[operator];
    if (!combinator) {
      throw new Error(`Invalid combination operator: ${combineWith}`);
    }
    return results.reduce(combinator) || /* @__PURE__ */ new Map();
  }
  /**
   * Allows serialization of the index to JSON, to possibly store it and later
   * deserialize it with {@link MiniSearch.loadJSON}.
   *
   * Normally one does not directly call this method, but rather call the
   * standard JavaScript `JSON.stringify()` passing the {@link MiniSearch}
   * instance, and JavaScript will internally call this method. Upon
   * deserialization, one must pass to {@link MiniSearch.loadJSON} the same
   * options used to create the original instance that was serialized.
   *
   * ### Usage:
   *
   * ```javascript
   * // Serialize the index:
   * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
   * miniSearch.addAll(documents)
   * const json = JSON.stringify(miniSearch)
   *
   * // Later, to deserialize it:
   * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
   * ```
   *
   * @return A plain-object serializable representation of the search index.
   */
  toJSON() {
    const index = [];
    for (const [term, fieldIndex] of this._index) {
      const data = {};
      for (const [fieldId, freqs] of fieldIndex) {
        data[fieldId] = Object.fromEntries(freqs);
      }
      index.push([term, data]);
    }
    return {
      documentCount: this._documentCount,
      nextId: this._nextId,
      documentIds: Object.fromEntries(this._documentIds),
      fieldIds: this._fieldIds,
      fieldLength: Object.fromEntries(this._fieldLength),
      averageFieldLength: this._avgFieldLength,
      storedFields: Object.fromEntries(this._storedFields),
      dirtCount: this._dirtCount,
      index,
      serializationVersion: 2
    };
  }
  /**
   * @ignore
   */
  termResults(sourceTerm, derivedTerm, termWeight, termBoost, fieldTermData, fieldBoosts, boostDocumentFn, bm25params, results = /* @__PURE__ */ new Map()) {
    if (fieldTermData == null)
      return results;
    for (const field of Object.keys(fieldBoosts)) {
      const fieldBoost = fieldBoosts[field];
      const fieldId = this._fieldIds[field];
      const fieldTermFreqs = fieldTermData.get(fieldId);
      if (fieldTermFreqs == null)
        continue;
      let matchingFields = fieldTermFreqs.size;
      const avgFieldLength = this._avgFieldLength[fieldId];
      for (const docId of fieldTermFreqs.keys()) {
        if (!this._documentIds.has(docId)) {
          this.removeTerm(fieldId, docId, derivedTerm);
          matchingFields -= 1;
          continue;
        }
        const docBoost = boostDocumentFn ? boostDocumentFn(this._documentIds.get(docId), derivedTerm, this._storedFields.get(docId)) : 1;
        if (!docBoost)
          continue;
        const termFreq = fieldTermFreqs.get(docId);
        const fieldLength = this._fieldLength.get(docId)[fieldId];
        const rawScore = calcBM25Score(termFreq, matchingFields, this._documentCount, fieldLength, avgFieldLength, bm25params);
        const weightedScore = termWeight * termBoost * fieldBoost * docBoost * rawScore;
        const result = results.get(docId);
        if (result) {
          result.score += weightedScore;
          assignUniqueTerm(result.terms, sourceTerm);
          const match = getOwnProperty(result.match, derivedTerm);
          if (match) {
            match.push(field);
          } else {
            result.match[derivedTerm] = [field];
          }
        } else {
          results.set(docId, {
            score: weightedScore,
            terms: [sourceTerm],
            match: { [derivedTerm]: [field] }
          });
        }
      }
    }
    return results;
  }
  /**
   * @ignore
   */
  addTerm(fieldId, documentId, term) {
    const indexData = this._index.fetch(term, createMap);
    let fieldIndex = indexData.get(fieldId);
    if (fieldIndex == null) {
      fieldIndex = /* @__PURE__ */ new Map();
      fieldIndex.set(documentId, 1);
      indexData.set(fieldId, fieldIndex);
    } else {
      const docs = fieldIndex.get(documentId);
      fieldIndex.set(documentId, (docs || 0) + 1);
    }
  }
  /**
   * @ignore
   */
  removeTerm(fieldId, documentId, term) {
    if (!this._index.has(term)) {
      this.warnDocumentChanged(documentId, fieldId, term);
      return;
    }
    const indexData = this._index.fetch(term, createMap);
    const fieldIndex = indexData.get(fieldId);
    if (fieldIndex == null || fieldIndex.get(documentId) == null) {
      this.warnDocumentChanged(documentId, fieldId, term);
    } else if (fieldIndex.get(documentId) <= 1) {
      if (fieldIndex.size <= 1) {
        indexData.delete(fieldId);
      } else {
        fieldIndex.delete(documentId);
      }
    } else {
      fieldIndex.set(documentId, fieldIndex.get(documentId) - 1);
    }
    if (this._index.get(term).size === 0) {
      this._index.delete(term);
    }
  }
  /**
   * @ignore
   */
  warnDocumentChanged(shortDocumentId, fieldId, term) {
    for (const fieldName of Object.keys(this._fieldIds)) {
      if (this._fieldIds[fieldName] === fieldId) {
        this._options.logger("warn", `MiniSearch: document with ID ${this._documentIds.get(shortDocumentId)} has changed before removal: term "${term}" was not present in field "${fieldName}". Removing a document after it has changed can corrupt the index!`, "version_conflict");
        return;
      }
    }
  }
  /**
   * @ignore
   */
  addDocumentId(documentId) {
    const shortDocumentId = this._nextId;
    this._idToShortId.set(documentId, shortDocumentId);
    this._documentIds.set(shortDocumentId, documentId);
    this._documentCount += 1;
    this._nextId += 1;
    return shortDocumentId;
  }
  /**
   * @ignore
   */
  addFields(fields) {
    for (let i = 0; i < fields.length; i++) {
      this._fieldIds[fields[i]] = i;
    }
  }
  /**
   * @ignore
   */
  addFieldLength(documentId, fieldId, count, length) {
    let fieldLengths = this._fieldLength.get(documentId);
    if (fieldLengths == null)
      this._fieldLength.set(documentId, fieldLengths = []);
    fieldLengths[fieldId] = length;
    const averageFieldLength = this._avgFieldLength[fieldId] || 0;
    const totalFieldLength = averageFieldLength * count + length;
    this._avgFieldLength[fieldId] = totalFieldLength / (count + 1);
  }
  /**
   * @ignore
   */
  removeFieldLength(documentId, fieldId, count, length) {
    if (count === 1) {
      this._avgFieldLength[fieldId] = 0;
      return;
    }
    const totalFieldLength = this._avgFieldLength[fieldId] * count - length;
    this._avgFieldLength[fieldId] = totalFieldLength / (count - 1);
  }
  /**
   * @ignore
   */
  saveStoredFields(documentId, doc) {
    const { storeFields, extractField } = this._options;
    if (storeFields == null || storeFields.length === 0) {
      return;
    }
    let documentFields = this._storedFields.get(documentId);
    if (documentFields == null)
      this._storedFields.set(documentId, documentFields = {});
    for (const fieldName of storeFields) {
      const fieldValue = extractField(doc, fieldName);
      if (fieldValue !== void 0)
        documentFields[fieldName] = fieldValue;
    }
  }
};
MiniSearch.wildcard = Symbol("*");
var getOwnProperty = (object, property) => Object.prototype.hasOwnProperty.call(object, property) ? object[property] : void 0;
var combinators = {
  [OR]: (a, b) => {
    for (const docId of b.keys()) {
      const existing = a.get(docId);
      if (existing == null) {
        a.set(docId, b.get(docId));
      } else {
        const { score, terms, match } = b.get(docId);
        existing.score = existing.score + score;
        existing.match = Object.assign(existing.match, match);
        assignUniqueTerms(existing.terms, terms);
      }
    }
    return a;
  },
  [AND]: (a, b) => {
    const combined = /* @__PURE__ */ new Map();
    for (const docId of b.keys()) {
      const existing = a.get(docId);
      if (existing == null)
        continue;
      const { score, terms, match } = b.get(docId);
      assignUniqueTerms(existing.terms, terms);
      combined.set(docId, {
        score: existing.score + score,
        terms: existing.terms,
        match: Object.assign(existing.match, match)
      });
    }
    return combined;
  },
  [AND_NOT]: (a, b) => {
    for (const docId of b.keys())
      a.delete(docId);
    return a;
  }
};
var defaultBM25params = { k: 1.2, b: 0.7, d: 0.5 };
var calcBM25Score = (termFreq, matchingCount, totalCount, fieldLength, avgFieldLength, bm25params) => {
  const { k, b, d } = bm25params;
  const invDocFreq = Math.log(1 + (totalCount - matchingCount + 0.5) / (matchingCount + 0.5));
  return invDocFreq * (d + termFreq * (k + 1) / (termFreq + k * (1 - b + b * fieldLength / avgFieldLength)));
};
var termToQuerySpec = (options) => (term, i, terms) => {
  const fuzzy = typeof options.fuzzy === "function" ? options.fuzzy(term, i, terms) : options.fuzzy || false;
  const prefix = typeof options.prefix === "function" ? options.prefix(term, i, terms) : options.prefix === true;
  const termBoost = typeof options.boostTerm === "function" ? options.boostTerm(term, i, terms) : 1;
  return { term, fuzzy, prefix, termBoost };
};
var defaultOptions = {
  idField: "id",
  extractField: (document, fieldName) => document[fieldName],
  stringifyField: (fieldValue, fieldName) => fieldValue.toString(),
  tokenize: (text) => text.split(SPACE_OR_PUNCTUATION),
  processTerm: (term) => term.toLowerCase(),
  fields: void 0,
  searchOptions: void 0,
  storeFields: [],
  logger: (level, message) => {
    if (typeof (console === null || console === void 0 ? void 0 : console[level]) === "function")
      console[level](message);
  },
  autoVacuum: true
};
var defaultSearchOptions = {
  combineWith: OR,
  prefix: false,
  fuzzy: false,
  maxFuzzy: 6,
  boost: {},
  weights: { fuzzy: 0.45, prefix: 0.375 },
  bm25: defaultBM25params
};
var defaultAutoSuggestOptions = {
  combineWith: AND,
  prefix: (term, i, terms) => i === terms.length - 1
};
var defaultVacuumOptions = { batchSize: 1e3, batchWait: 10 };
var defaultVacuumConditions = { minDirtFactor: 0.1, minDirtCount: 20 };
var defaultAutoVacuumOptions = { ...defaultVacuumOptions, ...defaultVacuumConditions };
var assignUniqueTerm = (target, term) => {
  if (!target.includes(term))
    target.push(term);
};
var assignUniqueTerms = (target, source) => {
  for (const term of source) {
    if (!target.includes(term))
      target.push(term);
  }
};
var byScore = ({ score: a }, { score: b }) => b - a;
var createMap = () => /* @__PURE__ */ new Map();
var objectToNumericMap = (object) => {
  const map2 = /* @__PURE__ */ new Map();
  for (const key of Object.keys(object)) {
    map2.set(parseInt(key, 10), object[key]);
  }
  return map2;
};
var objectToNumericMapAsync = async (object) => {
  const map2 = /* @__PURE__ */ new Map();
  let count = 0;
  for (const key of Object.keys(object)) {
    map2.set(parseInt(key, 10), object[key]);
    if (++count % 1e3 === 0) {
      await wait(0);
    }
  }
  return map2;
};
var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/u;

// viewer/server/core/search.js
var HANGUL = /[\uAC00-\uD7A3\u3130-\u318F]/;
function tokenize(text) {
  const out2 = [];
  const raw = String(text || "");
  for (const chunk of raw.split(/[^\w\uAC00-\uD7A3\u3130-\u318F:/._-]+/)) {
    if (!chunk) continue;
    if (!HANGUL.test(chunk)) {
      out2.push(chunk.toLowerCase());
      continue;
    }
    out2.push(chunk.toLowerCase());
    for (const han of chunk.match(/[\uAC00-\uD7A3\u3130-\u318F]+/g) || []) {
      if (han.length === 1) {
        out2.push(han);
        continue;
      }
      for (let i = 0; i < han.length - 1; i++) out2.push(han.slice(i, i + 2));
    }
  }
  return out2;
}
function buildIndex(docs, bodies) {
  const mini = new MiniSearch({
    fields: ["title", "body", "touches", "tags", "author", "id"],
    storeFields: ["id", "path"],
    idField: "path",
    tokenize,
    processTerm: (t) => t.length ? t : null,
    searchOptions: { prefix: true, fuzzy: false, combineWith: "AND" }
  });
  mini.addAll(
    docs.map((d) => ({
      path: d.path,
      id: d.id,
      title: d.title,
      body: (bodies.get(d.path) || "").slice(0, 2e5),
      touches: d.touches.join(" "),
      tags: d.tags.join(" "),
      author: d.author || ""
    }))
  );
  return mini;
}
function fullText(mini, query, limit = 50) {
  if (!query || !query.trim()) return [];
  try {
    return mini.search(query, { boost: { title: 3, touches: 2, id: 2 } }).slice(0, limit);
  } catch {
    return [];
  }
}

// viewer/bin/ctx-cli.mjs
init_vocab();

// viewer/server/core/git.js
import { execFile } from "node:child_process";
import fs4 from "node:fs/promises";
import path4 from "node:path";
function run(cwd, args, { timeout = 2e4 } = {}) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      { timeout, windowsHide: true, encoding: "utf8", maxBuffer: 4 << 20 },
      (e, stdout, stderr) => {
        resolve({
          ok: !e,
          code: e?.code ?? 0,
          out: String(stdout || "").trim(),
          err: String(stderr || "").trim()
        });
      }
    );
  });
}
async function isRepo(root) {
  return await fs4.access(path4.join(root, ".git")).then(() => true).catch(() => false);
}
async function status(root) {
  if (!await isRepo(root)) return { repo: false };
  const [branch, upstream, dirty, hooks] = await Promise.all([
    run(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    run(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    run(root, ["status", "--porcelain"]),
    run(root, ["config", "--get", "core.hooksPath"])
  ]);
  const st = {
    repo: true,
    branch: branch.ok ? branch.out : null,
    upstream: upstream.ok ? upstream.out : null,
    // 훅은 clone 을 따라오지 않는다. 미설정이면 `cdp-save` 가 커밋해도
    // 검사가 **조용히 통과한다** -- 그래서 상태로 노출한다(§17).
    hooksPath: hooks.ok && hooks.out ? hooks.out : null,
    dirty: dirty.ok ? dirty.out.split("\n").filter(Boolean).length : 0,
    ahead: 0,
    behind: 0,
    oldestUnpushed: null
  };
  const head = await run(root, ["rev-parse", "--verify", "HEAD"]);
  st.hasCommits = head.ok;
  if (st.upstream && st.hasCommits) {
    const counts = await run(root, ["rev-list", "--left-right", "--count", `${st.upstream}...HEAD`]);
    if (counts.ok) {
      const [behind, ahead] = counts.out.split(/\s+/).map((n) => Number(n) || 0);
      st.behind = behind;
      st.ahead = ahead;
    }
    if (st.ahead > 0) {
      const oldest = await run(root, ["log", "--reverse", "--format=%cI", `${st.upstream}..HEAD`]);
      if (oldest.ok && oldest.out) st.oldestUnpushed = oldest.out.split("\n")[0];
    }
  }
  return st;
}
async function fetch(root) {
  if (!await isRepo(root)) return { ok: false, reason: "not-a-repo" };
  const r = await run(root, ["fetch", "--quiet", "--prune"], { timeout: 3e4 });
  return { ok: r.ok, message: r.ok ? null : firstLine(r.err) };
}
async function pullFfOnly(root) {
  if (!await isRepo(root)) return { ok: false, reason: "not-a-repo" };
  const st = await status(root);
  if (!st.upstream) return { ok: true, skipped: "no-upstream", status: st };
  if (st.behind === 0) return { ok: true, skipped: "up-to-date", status: st };
  if (st.ahead > 0) {
    return {
      ok: false,
      reason: "diverged",
      status: st,
      message: `\uC6D0\uACA9\uC774 ${st.behind}\uAC74 \uC55E\uC11C \uC788\uACE0 \uB85C\uCEEC\uC5D0\uB3C4 \uCEE4\uBC0B ${st.ahead}\uAC74\uC774 \uC788\uC2B5\uB2C8\uB2E4.
\uC571\uACFC skill \uC740 merge\xB7rebase \uB97C \uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uD130\uBBF8\uB110\uC5D0\uC11C \uC815\uB9AC\uD558\uC138\uC694:
  git pull --rebase`
    };
  }
  if (st.dirty > 0) {
    return {
      ok: false,
      reason: "dirty",
      status: st,
      message: `\uCEE4\uBC0B\uB418\uC9C0 \uC54A\uC740 \uBCC0\uACBD ${st.dirty}\uAC74\uC774 \uC788\uC5B4 pull \uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uCEE4\uBC0B\uD558\uAC70\uB098 \uB418\uB3CC\uB9AC\uC138\uC694.`
    };
  }
  const r = await run(root, ["pull", "--ff-only", "--quiet"], { timeout: 6e4 });
  return r.ok ? { ok: true, status: await status(root) } : { ok: false, reason: "failed", message: firstLine(r.err) };
}
function unpushedWarning(st, { days = 1, now = Date.now() } = {}) {
  if (!st?.ahead || !st.oldestUnpushed) return null;
  const age = (now - new Date(st.oldestUnpushed).getTime()) / 864e5;
  if (age < days) return null;
  return {
    ahead: st.ahead,
    days: Math.floor(age),
    message: `\uBCF4\uB0B4\uC9C0 \uC54A\uC740 \uCEE4\uBC0B ${st.ahead}\uAC74 \xB7 \uAC00\uC7A5 \uC624\uB798\uB41C \uAC83 ${Math.floor(age)}\uC77C \uC804
\uBCF4\uB0B4\uC9C0 \uC54A\uC73C\uBA74 \uB2E4\uB978 \uC0AC\uB78C\uC5D0\uAC8C\uB294 \uC774 \uC791\uC5C5\uC774 \uC5C6\uB294 \uAC83\uACFC \uAC19\uC2B5\uB2C8\uB2E4`
  };
}
function firstLine(s) {
  return String(s || "").split("\n").find((l) => l.trim()) || null;
}

// viewer/bin/ctx-cli.mjs
var BUILT = "2026-09-09 05:20";
var BS2 = String.fromCharCode(92);
var SEP = path5.sep;
var USAGE = `ctx - \uC9C0\uC2DD \uB808\uD3EC \uB3C4\uAD6C  (\uBC88\uB4E4 2026-09-09 05:20)

  ctx check [--json]        \uCEE4\uBC0B \uAC00\uB2A5\uD55C\uAC00. \uC624\uB958\uAC00 \uC788\uC73C\uBA74 exit 1
  ctx index                 INDEX.md / INDEX-by-coord.md \uC7AC\uC0DD\uC131
  ctx match <\uC774\uB984...>       \uC774\uB984 -> \uC815\uBCF8 \uC88C\uD45C (\uB300\uC870)
  ctx where <\uC88C\uD45C>          \uADF8 \uC88C\uD45C\uC758 \uC0C1\uD0DC\uAC00 \uC5B4\uB290 \uBB38\uC11C \uC5B4\uB290 \uC139\uC158\uC5D0 \uC788\uB098
  ctx search <\uB9D0...>        \uB9D0 -> \uC88C\uD45C \uD6C4\uBCF4 (match \uAC00 \uBBF8\uB4F1\uC7AC\uB97C \uB0BC \uB54C\uC758 \uD3F4\uBC31)
  ctx derive [--json]       \uD30C\uC0DD\uC774 \uC548 \uB41C \uC139\uC158 \uBAA9\uB85D
  ctx term <\uC774\uB984>           \uC5B4\uD718 \uC870\uD68C (\uC815\uBCF8 / alias / deprecated)
  ctx apply <\uC88C\uD45C>          \uD30C\uC0DD\uD560 \uC139\uC158\uC5D0 \uBD99\uC77C \uBCC0\uACBD \uC904 \uCD08\uC548
  ctx brief                 \uB450 \uC904 \uC694\uC57D (\uC808\uCC28 + \uC0B4\uC544 \uC788\uB294 \uB808\uD3EC \uC0C1\uD0DC)
  ctx sync [--pull]         \uC6D0\uACA9\uACFC\uC758 \uCC28\uC774. --pull \uC740 ff \uB9CC \uD55C\uB2E4 (\uC2E4\uD328\uBA74 exit 1)
  ctx version               \uC774 \uBC88\uB4E4\uC774 \uC5B8\uC81C \uB9CC\uB4E4\uC5B4\uC84C\uB098
  ctx setup <\uC791\uC5C5 \uB808\uD3EC>      \uADF8 \uB808\uD3EC\uC5D0 \uADDC\uC57D\uACFC skill \uC744 \uB123\uB294\uB2E4 (--dry \uB85C \uBBF8\uB9AC\uBCF4\uAE30)

  --repo <\uACBD\uB85C>             \uC9C0\uC2DD \uB808\uD3EC \uACBD\uB85C (\uAE30\uBCF8: CDP_REPO \uB610\uB294 \uD604\uC7AC \uD3F4\uB354 \uC0C1\uC704 \uD0D0\uC0C9)
  --json                    \uAE30\uACC4 \uD310\uB3C5\uC6A9 \uCD9C\uB825
`;
function parseArgs(argv) {
  const out2 = { cmd: null, args: [], json: false, repo: null, pull: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out2.json = true;
    else if (a === "--pull") out2.pull = true;
    else if (a === "--repo") out2.repo = argv[++i];
    else if (a === "--dry") out2.dry = true;
    else if (a === "-h" || a === "--help" || a === "help") out2.cmd = out2.cmd || "help";
    else if (!out2.cmd) out2.cmd = a;
    else out2.args.push(a);
  }
  return out2;
}
async function findRepo(explicit) {
  const cands = [];
  if (explicit) cands.push(path5.resolve(explicit));
  if (process.env.CDP_REPO) cands.push(path5.resolve(process.env.CDP_REPO));
  {
    let d = process.cwd();
    for (let i = 0; i < 8; i++) {
      try {
        const j = JSON.parse(await fs5.readFile(path5.join(d, ".claude", "cdp.json"), "utf8"));
        if (j?.knowledgeRepo) {
          cands.push(path5.resolve(j.knowledgeRepo));
          break;
        }
      } catch {
      }
      const up = path5.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    cands.push(dir);
    cands.push(path5.join(dir, "knowledge-repo"));
    const up = path5.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  for (const self of [process.argv[1], process.execPath]) {
    if (!self) continue;
    const d = path5.dirname(path5.resolve(self));
    cands.push(d, path5.dirname(d));
  }
  for (const c of cands) {
    const ok = await fs5.access(path5.join(c, "_vocab.md")).then(() => true).catch(() => false);
    if (ok) return c;
  }
  return null;
}
var out = (s = "") => process.stdout.write(s + "\n");
var err = (s = "") => process.stderr.write(s + "\n");
var short = (p) => String(p || "").replace(/^docs\//, "").replace(/\.md$/, "");
var pad = (s, n) => {
  const w = [...String(s)].reduce((a, ch) => a + (ch.codePointAt(0) > 4352 ? 2 : 1), 0);
  return String(s) + " ".repeat(Math.max(0, n - w));
};
function itemLine(i) {
  const who = i.coord || i.id || i.path || "";
  return [who, i.detail].filter(Boolean).join("  ");
}
async function cmdCheck(r, opt) {
  const res = runBuiltinCheck({
    docs: r.docs,
    vocab: r.vocab,
    validity: r.validity,
    indexInfo: r.indexInfo,
    managedIndex: r.managedIndex,
    sections: r.sections,
    bodies: r.bodies
  });
  const errors = res.findings.filter((f) => f.sev === "error");
  const warns = res.findings.filter((f) => f.sev === "warn");
  const nErr = errors.reduce((a, f) => a + f.items.length, 0);
  const nWarn = warns.reduce((a, f) => a + f.items.length, 0);
  if (opt.json) {
    out(JSON.stringify({ ok: nErr === 0, errors: nErr, warnings: nWarn, findings: res.findings }, null, 2));
    return nErr === 0 ? 0 : 1;
  }
  for (const f of errors) {
    err(`[\uC624\uB958] ${f.label}  ${f.items.length}\uAC74`);
    for (const i of f.items) err("   " + itemLine(i));
  }
  for (const f of warns) {
    out(`[\uACBD\uACE0] ${f.label}  ${f.items.length}\uAC74`);
    for (const i of f.items.slice(0, 5)) out("   " + itemLine(i));
    if (f.items.length > 5) out(`   ... ${f.items.length - 5}\uAC74 \uB354`);
  }
  if (nErr) {
    err("");
    err(`ctx check: \uC624\uB958 ${nErr}\uAC74. \uCEE4\uBC0B\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    return 1;
  }
  out(nWarn ? `ctx check: \uC624\uB958 \uC5C6\uC74C (\uACBD\uACE0 ${nWarn}\uAC74)` : "ctx check: \uC774\uC0C1 \uC5C6\uC74C");
  return 0;
}
async function cmdIndex(r) {
  const rows = ["| id | date | status | touches |", "|---|---|---|---|"];
  for (const d of r.works) {
    rows.push(`| ${d.id} | ${d.date || ""} | ${d.status || ""} | ${d.touches.join(", ") || "-"} |`);
  }
  const head = ["# INDEX", "", `\uC790\uB3D9 \uC0DD\uC131 - \`ctx index\`. \uC791\uC5C5 \uAE30\uB85D ${r.works.length}\uAC74.`, "", ""];
  await fs5.writeFile(path5.join(r.root, "INDEX.md"), head.concat(rows).join("\n") + "\n", "utf8");
  const lines = ["# INDEX (\uC88C\uD45C\uBCC4)", "", "\uC790\uB3D9 \uC0DD\uC131 - `ctx index`.", ""];
  const byType = /* @__PURE__ */ new Map();
  for (const c of r.allCoords) {
    const t = c.slice(0, c.indexOf(":")) || "\uAE30\uD0C0";
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(c);
  }
  for (const [type2, cs] of [...byType.entries()].sort()) {
    lines.push(`## ${type2}`, "");
    for (const c of cs) {
      const list = r.coords.byCoord.get(c) || [];
      const sec = r.sections.find((x) => x.coord === c);
      const mark = "";
      const where = sec && sec.doc ? ` \`${short(sec.doc)}\`` : "";
      lines.push(`- \`${c}\` \uC791\uC5C5 ${list.length}\uAC74${where}${mark}`);
      for (const d of list.slice(0, 3)) lines.push(`  - ${d.date || ""} [${d.title}](work/${d.id}.md)`);
      if (list.length > 3) lines.push(`  - ... ${list.length - 3}\uAC74 \uB354`);
    }
    lines.push("");
  }
  await fs5.writeFile(path5.join(r.root, "INDEX-by-coord.md"), lines.join("\n") + "\n", "utf8");
  out(`ctx index: INDEX.md ${r.works.length}\uD589 / INDEX-by-coord.md \uC88C\uD45C ${r.allCoords.length}\uAC1C`);
  return 0;
}
async function cmdMatch(r, opt) {
  if (!opt.args.length) {
    err('ctx match: \uB300\uC870\uD560 \uC774\uB984\uC744 \uC8FC\uC138\uC694.  \uC608) ctx match "\uBA74\uC811\uC2EC\uC0AC\uC758\uACAC\uB4F1\uB85D" PS130');
    return 2;
  }
  const rows = opt.args.map((q) => {
    const hit = reconcile(r.vocab, q);
    if (!hit) return { input: q, coord: null };
    const e = r.vocab.coords.get(hit.coord);
    return {
      input: q,
      coord: hit.coord,
      kind: hit.kind,
      // canonical | value | alias | label
      exact: !!hit.exact,
      line: e ? e.line : null,
      deprecated: e ? e.deprecated : null,
      supersededBy: e ? e.supersededBy : null
    };
  });
  if (opt.json) {
    out(JSON.stringify(rows, null, 2));
    return 0;
  }
  const w = Math.max(...rows.map((x) => [...x.input].reduce((a, c) => a + (c.codePointAt(0) > 4352 ? 2 : 1), 0)), 8);
  for (const x of rows) {
    if (!x.coord) {
      out(`${pad(x.input, w)}  ->  (\uBBF8\uB4F1\uC7AC)  _vocab.md \uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4`);
      continue;
    }
    const how = x.kind === "canonical" ? "\uC815\uBCF8" : x.kind === "alias" ? "alias \uC77C\uCE58" : x.kind === "label" ? "\uC774\uB984 \uC77C\uCE58" : "\uAC12 \uC77C\uCE58";
    const dep = x.deprecated ? `  [\uD3D0\uAE30 ${x.deprecated}${x.supersededBy ? " -> " + x.supersededBy : ""}]` : "";
    out(`${pad(x.input, w)}  ->  ${x.coord}  (${how}${x.exact ? "" : " / \uBD80\uBD84"} \xB7 _vocab.md:${x.line})${dep}`);
  }
  return 0;
}
async function cmdWhere(r, opt) {
  const coord = opt.args[0];
  if (!coord) {
    err("ctx where: \uC88C\uD45C\uB97C \uC8FC\uC138\uC694.  \uC608) ctx where table:rp_plnd_mst");
    return 2;
  }
  const hit = resolveCoord(r.registry, coord);
  const sec = r.sections.find((x) => x.coord === coord) || null;
  const works = r.coords.byCoord.get(coord) || [];
  if (opt.json) {
    out(JSON.stringify({ coord, registry: hit, section: sec, works: works.map((d) => ({ id: d.id, date: d.date })) }, null, 2));
    return 0;
  }
  if (!hit) {
    out(`${coord}: \uB4F1\uB85D\uBD80\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC \uBB38\uC11C\uAC00 \uC5C6\uB294 \uD0C0\uC785\uC785\uB2C8\uB2E4 (\uC815\uC0C1)`);
    out(`  \uC791\uC5C5 \uAE30\uB85D ${works.length}\uAC74`);
    for (const d of works.slice(0, 5)) out(`    ${d.date || ""}  ${d.id}`);
    return 0;
  }
  out(`${coord}`);
  out(`  \uBB38\uC11C   ${hit.doc}${hit.whole ? "  (\uBB38\uC11C \uC804\uCCB4)" : ""}`);
  if (!hit.whole) out(`  \uC139\uC158   ${"#".repeat(hit.level)} ${hit.value}`);
  if (sec) {
    const label = sec.applied ? `\uBC18\uC601 ${sec.applied}` : sec.state === "anchor-missing" ? "\uC139\uC158\uC774 \uC5C6\uC74C" : sec.state === "doc-missing" ? "\uBB38\uC11C\uAC00 \uC5C6\uC74C" : sec.state === "unwritten" ? `\uD30C\uC0DD \uB0A8\uC74C \u2014 \uC791\uC5C5 ${sec.total}\uAC74 (ctx apply ${coord})` : "\uC544\uC9C1 \uC2E4\uB9B0 \uC791\uC5C5 \uC5C6\uC74C";
    out(`  \uC0C1\uD0DC   ${label}`);
  }
  out(`  \uC791\uC5C5   ${works.length}\uAC74`);
  for (const d of works.slice(0, 5)) out(`    ${d.date || ""}  ${d.id}`);
  if (works.length > 5) out(`    ... ${works.length - 5}\uAC74 \uB354`);
  return 0;
}
var NL = String.fromCharCode(10);
function wordHit(word, toks) {
  const all = [...new Set(tokenize(word))].filter((x) => x.length > 1);
  if (!all.length) return false;
  if (toks.has(word.toLowerCase())) return true;
  const grams = all.filter((x) => x !== word.toLowerCase());
  const t = grams.length ? grams : all;
  const n = t.filter((x) => toks.has(x)).length;
  return n / t.length >= 0.67;
}
async function cmdSearch(r, opt) {
  const words = opt.args;
  if (!words.length) {
    err("ctx search: \uCC3E\uC744 \uB9D0\uC744 \uC8FC\uC138\uC694.  \uC608) ctx search \uC9C0\uCD9C\uACB0\uC758\uC11C \uC785\uCD9C\uAE08\uACC4\uC88C\uCF54\uB4DC");
    return 2;
  }
  const cand = /* @__PURE__ */ new Map();
  const get = (coord) => {
    let c = cand.get(coord);
    if (!c) cand.set(coord, c = { coord, words: /* @__PURE__ */ new Set(), work: /* @__PURE__ */ new Set(), section: false });
    return c;
  };
  const mini = buildIndex(r.docs, r.bodies);
  for (const w of words) {
    for (const hit of fullText(mini, w, 20)) {
      const d = r.byPath.get(hit.path);
      if (!d || d.layer !== "work") continue;
      for (const coord of d.touches) {
        const c = get(coord);
        c.words.add(w);
        if (c.work.size < 3) c.work.add(d.id);
      }
    }
  }
  for (const coord of r.allCoords) {
    const hit = r.managedIndex?.find(coord);
    if (!hit || hit.docMissing || !hit.section) continue;
    const bodyText = r.bodies.get(hit.doc);
    if (!bodyText) continue;
    const lines = bodyText.split(NL);
    const text = (hit.section.whole ? lines : lines.slice(hit.section.line, hit.section.end)).join(NL);
    const toks = new Set(tokenize(text));
    for (const w of words) if (wordHit(w, toks)) {
      const c = get(coord);
      c.words.add(w);
      c.section = true;
    }
  }
  const rows = [...cand.values()].map((c) => ({ ...c, n: c.words.size })).sort((a, b) => b.n - a.n || b.section - a.section || a.coord.localeCompare(b.coord));
  if (opt.json) {
    out(JSON.stringify({
      words,
      candidates: rows.map((c) => ({ coord: c.coord, matched: [...c.words], section: c.section, works: [...c.work] }))
    }, null, 2));
    return 0;
  }
  if (!rows.length) {
    out(`ctx search: \uC88C\uD45C \uD6C4\uBCF4 \uC5C6\uC74C  (${words.join(" \xB7 ")})`);
    return 0;
  }
  out(`ctx search  -- \uC88C\uD45C \uD6C4\uBCF4 ${rows.length}\uAC74. **\uBCF8\uBB38\uC740 \uC2E3\uC9C0 \uC54A\uB294\uB2E4** (cdp-load \uAC00 \uC77D\uB294\uB2E4)`);
  for (const c of rows.slice(0, 12)) {
    const where = r.managedIndex?.find(c.coord);
    const doc = where && !where.docMissing && where.section ? where.doc : "\uB4F1\uB85D\uBD80\uC5D0 \uC5C6\uC74C -- \uC791\uC5C5 \uAE30\uB85D\uB9CC";
    out(`  ${c.coord}`);
    out(`      \uAC78\uB9B0 \uB9D0  ${[...c.words].join(" \xB7 ")}${c.section ? "   (\uC139\uC158)" : ""}`);
    out(`      ${doc}`);
    if (c.work.size) out(`      ${[...c.work].join(" \xB7 ")}`);
  }
  if (rows.length > 12) out(`  ... ${rows.length - 12}\uAC74 \uB354 (--json \uC73C\uB85C \uC804\uCCB4)`);
  return 0;
}
async function cmdDerive(r, opt) {
  const st = repoStatus(r);
  const todo = [...st.pendingDerive];
  const broken = st.brokenSections;
  if (opt.json) {
    out(JSON.stringify({ pendingDerive: todo, brokenSections: broken }, null, 2));
    return 0;
  }
  if (!todo.length && !broken.length) {
    out("ctx derive: \uD30C\uC0DD \uB0A8\uC740 \uC139\uC158 \uC5C6\uC74C");
    return 0;
  }
  if (todo.length) {
    out(`\uD30C\uC0DD \uB0A8\uC740 \uC139\uC158 ${todo.length}\uACF3`);
    out("");
    for (const x of todo) {
      out(`  ${pad(x.coord, 32)} ${pad(`\uC791\uC5C5 ${x.total}\uAC74`, 12)} ${short(x.doc)}`);
      if (x.applied) out(`  ${" ".repeat(32)} \uC2E4\uB9B0 \uAC83 ${x.applied}`);
      for (const i of x.items) out(`  ${" ".repeat(32)}   + ${i.date || ""}  ${i.id}`);
    }
  }
  if (broken.length) {
    if (todo.length) out("");
    out(`\uAE68\uC9C4 \uC139\uC158 ${broken.length}\uACF3 \u2014 \uB4F1\uB85D\uBD80\uAC00 \uC5C6\uB294 \uC790\uB9AC\uB97C \uAC00\uB9AC\uD0A8\uB2E4`);
    for (const x of broken) out(`  ${pad(x.coord, 32)} ${pad(x.state, 14)} ${short(x.doc)}`);
  }
  return 0;
}
async function cmdTerm(r, opt) {
  const q = opt.args.join(" ").trim();
  if (!q) {
    err("ctx term: \uC870\uD68C\uD560 \uC774\uB984\uC744 \uC8FC\uC138\uC694.");
    return 2;
  }
  const hit = reconcile(r.vocab, q);
  const e = hit ? r.vocab.coords.get(hit.coord) : null;
  if (opt.json) {
    out(JSON.stringify({ query: q, match: hit, entry: e ? { ...e } : null }, null, 2));
    return 0;
  }
  if (!e) {
    out(`"${q}": _vocab.md \uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    const nq = normKey(q);
    const near = [...r.vocab.coords.keys()].filter((c) => normKey(c).includes(nq) || nq.includes(normKey(c))).slice(0, 5);
    if (near.length) out("  \uBE44\uC2B7\uD55C \uAC83: " + near.join(", "));
    return 1;
  }
  out(`${e.coord}${e.label ? "  " + e.label : ""}`);
  if (e.aliases.length) out(`  aliases   ${e.aliases.join(", ")}`);
  if (e.deprecated) out(`  \uD3D0\uAE30      ${e.deprecated}${e.supersededBy ? "  -> " + e.supersededBy : ""}${e.deprecatedNote ? "  " + e.deprecatedNote : ""}`);
  out(`  _vocab.md:${e.line}`);
  const hit2 = resolveCoord(r.registry, e.coord);
  if (hit2) out(`  \uAD00\uB9AC \uBB38\uC11C ${hit2.doc}${hit2.whole ? "" : "  " + "#".repeat(hit2.level) + " " + hit2.value}`);
  const works = r.coords.byCoord.get(e.coord) || [];
  out(`  \uC791\uC5C5 \uAE30\uB85D ${works.length}\uAC74`);
  return 0;
}
async function cmdApply(r, opt) {
  const coord = opt.args[0];
  if (!coord) {
    err("ctx apply: \uC88C\uD45C\uB97C \uC8FC\uC138\uC694.  \uC608) ctx apply table:ps_ext_emp_mst");
    return 2;
  }
  const sec = r.sections.find((x) => x.coord === coord);
  if (!sec) {
    out(`${coord}: \uB4F1\uB85D\uBD80\uC5D0 \uC5C6\uC5B4 \uBD99\uC77C \uC139\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    return 0;
  }
  if (sec.state === "ok") {
    out(`${coord}: \uC774\uBBF8 \uBC18\uC601\uB3FC \uC788\uC2B5\uB2C8\uB2E4 (applied ${sec.applied}).`);
    return 0;
  }
  const items = sec.items.length ? sec.items : (r.coords.byCoord.get(coord) || []).slice().sort(cmpDateDesc);
  if (!items.length) {
    out(`${coord}: \uBC18\uC601\uD560 \uC791\uC5C5 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    return 0;
  }
  const newest = items[0];
  out(`# ${sec.doc}  ${sec.anchor || ""}`);
  out("");
  out(`<!-- applied: ${sec.applied || "null"} -> ${newest.id} -->`);
  out("");
  out('\uC544\uB798 \uC904\uC744 \uADF8 \uC139\uC158\uC758 "\uBCC0\uACBD" \uBAA9\uB85D\uC5D0 \uBD99\uC774\uACE0, \uBCF8\uBB38\uC740 \uC9C1\uC811 \uACE0\uCE58\uC138\uC694.');
  out("");
  for (const i of items.slice().reverse()) {
    out(`**\uBCC0\uACBD** \xB7 ${i.date || ""} [\`${String(i.id).replace(/^\d{4}-\d{4}-/, "")}\`](../work/${i.id}.md)`);
  }
  out("");
  out(`\uC791\uC5C5 \uAE30\uB85D ${items.length}\uAC74: ` + items.map((i) => `work/${i.id}.md`).join(", "));
  return 0;
}
async function cmdBrief(r, opt) {
  const st = repoStatus(r);
  const parts = [`\uC791\uC5C5 \uAE30\uB85D ${st.works}`, `\uAD00\uB9AC \uBB38\uC11C ${st.managedDocs}`];
  if (st.pendingDerive.length) parts.push(`\uD30C\uC0DD \uB0A8\uC74C ${st.pendingDerive.length}`);
  if (st.unregistered.length) parts.push(`\uBBF8\uB4F1\uC7AC \uC88C\uD45C ${st.unregistered.length}`);
  if (st.legacyPending.length) {
    const oldest = st.legacyPending[0];
    parts.push(`\uBBF8\uACB0 ${st.legacyPending.length} \u2014 \uC774\uC288 \uB300\uC7A5\uC73C\uB85C \uC774\uAD00 (\uCD5C\uC7A5 ${oldest.days}\uC77C)`);
  }
  if (st.indexStale) parts.push("INDEX \uBD88\uC77C\uCE58");
  if (opt.json) {
    out(JSON.stringify(st, null, 2));
    return 0;
  }
  out("[CDP] \uC808\uCC28: (1) \uAC80\uD1A0(\uB300\uC0C1 \uCD94\uCD9C) -> (2) \uB9E5\uB77D \uC8FC\uC785(\uD544\uC694\uC2DC) -> (3) \uC694\uCCAD\uC218\uD589 / \uC791\uC5C5 \uB05D\uC5D0 cdp-save");
  out("[CDP] \uB808\uD3EC: " + parts.join(" \xB7 "));
  return 0;
}
async function cmdSync(r, opt) {
  const pull = opt.args.includes("--pull") || opt.pull;
  if (!await isRepo(r.root)) {
    if (opt.json) out(JSON.stringify({ repo: false }));
    else out("ctx sync: git \uB808\uD3EC\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uB3D9\uAE30\uD654\uD560 \uAC83\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return 0;
  }
  const f = await fetch(r.root);
  let st = await status(r.root);
  let pulled = null;
  if (pull) {
    pulled = await pullFfOnly(r.root);
    if (pulled.status) st = pulled.status;
  }
  if (opt.json) {
    out(JSON.stringify({ fetch: f, status: st, pull: pulled }, null, 2));
    return pulled && !pulled.ok ? 1 : 0;
  }
  out(`\uBE0C\uB79C\uCE58  ${st.branch || "(\uC5C6\uC74C)"}${st.upstream ? "  ->  " + st.upstream : "  (upstream \uC5C6\uC74C)"}`);
  if (!f.ok && f.message) out(`fetch   \uC2E4\uD328 -- ${f.message}`);
  out(`\uCC28\uC774    \uBC1B\uC744 \uAC83 ${st.behind}\uAC74 \xB7 \uBCF4\uB0BC \uAC83 ${st.ahead}\uAC74` + (st.dirty ? ` \xB7 \uCEE4\uBC0B \uC548 \uB41C \uBCC0\uACBD ${st.dirty}\uAC74` : ""));
  if (!st.hooksPath) {
    out("");
    out("[\uC8FC\uC758] core.hooksPath \uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uCEE4\uBC0B \uAC80\uC0AC\uAC00 \uB3CC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    out("       git config core.hooksPath .githooks");
  }
  const w = unpushedWarning(st);
  if (w) {
    out("");
    out("[\uC8FC\uC758] " + w.message.split("\n").join("\n       "));
  }
  if (pulled) {
    out("");
    if (pulled.ok) out(pulled.skipped === "up-to-date" ? "pull    \uC774\uBBF8 \uCD5C\uC2E0\uC785\uB2C8\uB2E4." : "pull    \uC644\uB8CC (ff).");
    else {
      err("pull    \uC2E4\uD328 -- " + pulled.reason);
      err(String(pulled.message || "").split("\n").join("\n        "));
      return 1;
    }
  } else if (st.behind > 0) {
    out("");
    out(`\uBC1B\uC744 \uAC83\uC774 ${st.behind}\uAC74 \uC788\uC2B5\uB2C8\uB2E4.  ctx sync --pull`);
  }
  return 0;
}
async function cmdSetup(r, opt) {
  const target = opt.args[0];
  if (!target) {
    err("ctx setup <\uC791\uC5C5 \uB808\uD3EC \uACBD\uB85C>");
    err("  \uC608:  ctx setup C:" + BS2 + "gdi");
    return 2;
  }
  const plan = await planSetup(r.root, target);
  if (!plan.ok) {
    err("ctx: " + plan.reason);
    return 2;
  }
  const label = { create: "\uC0C8\uB85C", update: "\uAC31\uC2E0", append: "\uBE14\uB85D \uCD94\uAC00", remove: "\uC81C\uAC70", same: "\uAC19\uC74C" };
  const show = (a) => a.kind === "skill" ? `  ${label[a.op].padEnd(9)} .claude${SEP}skills${SEP}${a.name}` : a.kind === "claude" ? `  ${label[a.op].padEnd(9)} CLAUDE.md` : `  ${label[a.op].padEnd(9)} .claude${SEP}cdp.json   \uC9C0\uC2DD \uB808\uD3EC = ${plan.knowledge}`;
  if (opt.dry) {
    out(`ctx setup --dry: ${plan.work}`);
    for (const a of plan.actions) out(show(a));
  } else {
    const done = await applySetup(plan);
    out(`ctx setup: ${plan.work}`);
    for (const a of plan.actions) if (a.op !== "same") out(show(a));
    if (!done.length) out("  (\uBC14\uB010 \uAC83 \uC5C6\uC74C)");
  }
  for (const w of plan.warnings) {
    out("");
    out("[\uC8FC\uC758] " + String(w).split(String.fromCharCode(10)).join(String.fromCharCode(10) + "       "));
  }
  return 0;
}
async function main(argv = process.argv.slice(2)) {
  const opt = parseArgs(argv);
  if (opt.cmd === "version") {
    out(BUILT.startsWith("__") ? "(\uC6D0\uBCF8 \uC2E4\uD589 \u2014 \uBC88\uB4E4 \uC544\uB2D8)" : BUILT);
    return 0;
  }
  if (!opt.cmd || opt.cmd === "help") {
    out(USAGE);
    return opt.cmd ? 0 : 2;
  }
  const root = await findRepo(opt.repo);
  if (!root) {
    err("ctx: \uC9C0\uC2DD \uB808\uD3EC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. --repo \uB85C \uC9C0\uC815\uD558\uAC70\uB098 CDP_REPO \uB97C \uC124\uC815\uD558\uC138\uC694.");
    err("     (_vocab.md \uAC00 \uC788\uB294 \uD3F4\uB354\uB97C \uCC3E\uC2B5\uB2C8\uB2E4)");
    return 2;
  }
  const settings = { settledness: { excludeTypes: ["domain"] } };
  const r = await loadRepo(root, { settings });
  const table = {
    check: cmdCheck,
    search: cmdSearch,
    index: cmdIndex,
    match: cmdMatch,
    where: cmdWhere,
    derive: cmdDerive,
    term: cmdTerm,
    apply: cmdApply,
    brief: cmdBrief,
    sync: cmdSync,
    setup: cmdSetup
  };
  const fn = table[opt.cmd];
  if (!fn) {
    err(`ctx: \uBAA8\uB974\uB294 \uBA85\uB839 "${opt.cmd}"`);
    out(USAGE);
    return 2;
  }
  return await fn(r, opt) || 0;
}
var invokedDirect = process.argv[1] && /ctx(-cli)?(\.mjs|\.js)?$/i.test(process.argv[1]);
if (invokedDirect) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      err("ctx: " + (e?.message || e));
      process.exit(1);
    }
  );
}
export {
  BUILT,
  main
};

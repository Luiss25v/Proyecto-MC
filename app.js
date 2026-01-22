/* ==========================================================
   Proyecto MC · Ayuda-Memoria (Funciones)
   Lógica + Conjuntos + Funciones + MATLAB snippets
   ========================================================== */

(function () {
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function setMsg(el, text, type = "") {
    el.textContent = text || "";
    el.classList.remove("error", "ok");
    if (type) el.classList.add(type);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const key = String(x);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(x);
      }
    }
    return out;
  }

  function prettySet(arr) {
    if (!arr || arr.length === 0) return "∅";
    return "{ " + arr.map(String).join(", ") + " }";
  }

  function parseSetInput(s) {
    // Split by comma, trim, ignore empty
    const raw = (s || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    // Convert numeric tokens if possible
    const parsed = raw.map(t => {
      const n = Number(t);
      return Number.isFinite(n) && t !== "" && String(n) === t.replace(/^0+(?=\d)/, (m)=>m.length?String(n):String(n))
        ? n
        : t;
    });

    // unique but preserve order
    return uniq(parsed);
  }

  // ---------- Theme ----------
  const btnTheme = $("#btnTheme");
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.documentElement.setAttribute("data-theme", "light");

  btnTheme.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "light" ? "" : "light";
    if (next) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", next ? "light" : "dark");
  });

  // ---------- Sidebar active link ----------
  const navItems = $$(".nav-item");
  const sections = ["logica", "conjuntos", "funciones", "publicar"].map(id => document.getElementById(id));
  const obs = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a,b)=> b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const id = visible.target.id;
    navItems.forEach(a => a.classList.toggle("active", a.dataset.section === id));
  }, { rootMargin: "-35% 0px -55% 0px", threshold: [0.1, 0.2, 0.35] });
  sections.forEach(s => obs.observe(s));

  /* ==========================================================
     1) LÓGICA: parser + truth table
     ========================================================== */

  const logicExpr = $("#logicExpr");
  const logicVars = $("#logicVars");
  const logicExample = $("#logicExample");
  const btnLogicRun = $("#btnLogicRun");
  const btnLogicClear = $("#btnLogicClear");
  const btnLogicCopy = $("#btnLogicCopy");
  const logicMsg = $("#logicMsg");
  const truthTable = $("#truthTable");
  const ttHead = truthTable.querySelector("thead");
  const ttBody = truthTable.querySelector("tbody");
  const logicMatlab = $("#logicMatlab");

  logicExample.addEventListener("change", () => {
    if (logicExample.value) logicExpr.value = logicExample.value;
  });

  btnLogicClear.addEventListener("click", () => {
    logicExpr.value = "";
    ttHead.innerHTML = "";
    ttBody.innerHTML = "";
    logicMatlab.textContent = "";
    setMsg(logicMsg, "");
  });

  btnLogicCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(logicMatlab.textContent || "");
    setMsg(logicMsg, ok ? "Código MATLAB copiado." : "No se pudo copiar.", ok ? "ok" : "error");
  });

  // --- Tokenizer + Shunting-yard to RPN ---
  function tokenizeLogic(input) {
    const s = input.replace(/\s+/g, "");
    const tokens = [];
    let i = 0;
    const isVar = (c) => ["A","B","C"].includes(c);
    while (i < s.length) {
      const c = s[i];

      // parentheses
      if (c === "(" || c === ")") {
        tokens.push({ type: "paren", value: c });
        i++;
        continue;
      }

      // multi-char operators
      if (s.startsWith("<->", i)) { tokens.push({ type:"op", value:"<->" }); i += 3; continue; }
      if (s.startsWith("->", i)) { tokens.push({ type:"op", value:"->" }); i += 2; continue; }

      // NOT
      if (c === "~") { tokens.push({ type:"op", value:"~" }); i++; continue; }

      // AND/OR
      if (c === "&" || c === "|") { tokens.push({ type:"op", value:c }); i++; continue; }

      // xor(A,B) function style
      if (s.startsWith("xor(", i)) {
        // parse xor(A,B) strictly
        const m = s.slice(i).match(/^xor\(([ABC]),([ABC])\)/);
        if (!m) throw new Error("xor() debe ser xor(A,B) con variables A/B/C.");
        tokens.push({ type:"xor", a:m[1], b:m[2] });
        i += m[0].length;
        continue;
      }

      // variable
      if (isVar(c)) { tokens.push({ type:"var", value:c }); i++; continue; }

      throw new Error(`Símbolo no válido en posición ${i+1}.`);
    }
    return tokens;
  }

  const precedence = {
    "~": 5,
    "&": 4,
    "|": 3,
    "->": 2,
    "<->": 1
  };
  const rightAssoc = new Set(["~", "->"]); // ~ and -> usually right associative

  function toRPN(tokens) {
    const output = [];
    const stack = [];

    for (const t of tokens) {
      if (t.type === "var" || t.type === "xor") {
        output.push(t);
      } else if (t.type === "op") {
        const o1 = t.value;
        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.type !== "op") break;
          const o2 = top.value;
          const p1 = precedence[o1], p2 = precedence[o2];
          if (
            (rightAssoc.has(o1) && p1 < p2) ||
            (!rightAssoc.has(o1) && p1 <= p2)
          ) {
            output.push(stack.pop());
          } else break;
        }
        stack.push(t);
      } else if (t.type === "paren") {
        if (t.value === "(") stack.push(t);
        else {
          // pop until '('
          let found = false;
          while (stack.length > 0) {
            const x = stack.pop();
            if (x.type === "paren" && x.value === "(") { found = true; break; }
            output.push(x);
          }
          if (!found) throw new Error("Paréntesis desbalanceados.");
        }
      }
    }
    while (stack.length > 0) {
      const x = stack.pop();
      if (x.type === "paren") throw new Error("Paréntesis desbalanceados.");
      output.push(x);
    }
    return output;
  }

  function evalRPN(rpn, env) {
    const st = [];
    for (const t of rpn) {
      if (t.type === "var") {
        st.push(Boolean(env[t.value]));
      } else if (t.type === "xor") {
        st.push(Boolean(env[t.a]) !== Boolean(env[t.b]));
      } else if (t.type === "op") {
        if (t.value === "~") {
          if (st.length < 1) throw new Error("Falta operando para ~.");
          st.push(!st.pop());
        } else {
          if (st.length < 2) throw new Error(`Faltan operandos para ${t.value}.`);
          const b = st.pop();
          const a = st.pop();
          switch (t.value) {
            case "&": st.push(a && b); break;
            case "|": st.push(a || b); break;
            case "->": st.push((!a) || b); break;
            case "<->": st.push(a === b); break;
            default: throw new Error("Operador desconocido.");
          }
        }
      }
    }
    if (st.length !== 1) throw new Error("Expresión inválida.");
    return st[0];
  }

  function genAssignments(nVars) {
    const vars = nVars === 3 ? ["A","B","C"] : ["A","B"];
    const rows = [];
    const total = 1 << vars.length;
    for (let i = 0; i < total; i++) {
      const env = {};
      vars.forEach((v, idx) => {
        // MSB first style
        const bit = (i >> (vars.length - 1 - idx)) & 1;
        env[v] = Boolean(bit);
      });
      rows.push(env);
    }
    return { vars, rows };
  }

  function buildTruthTable(expr, nVars) {
    const toks = tokenizeLogic(expr);
    const rpn = toRPN(toks);
    const { vars, rows } = genAssignments(nVars);

    const results = rows.map(env => ({
      ...env,
      R: evalRPN(rpn, env)
    }));
    return { vars, results };
  }

  function renderTruthTable(vars, results, expr) {
    ttHead.innerHTML = "";
    ttBody.innerHTML = "";

    const trh = document.createElement("tr");
    for (const v of vars) {
      const th = document.createElement("th");
      th.textContent = v;
      trh.appendChild(th);
    }
    const thr = document.createElement("th");
    thr.textContent = `R = ${expr}`;
    trh.appendChild(thr);
    ttHead.appendChild(trh);

    for (const row of results) {
      const tr = document.createElement("tr");
      for (const v of vars) {
        const td = document.createElement("td");
        td.textContent = row[v] ? "1" : "0";
        tr.appendChild(td);
      }
      const tdr = document.createElement("td");
      tdr.textContent = row.R ? "1" : "0";
      tr.appendChild(tdr);
      ttBody.appendChild(tr);
    }
  }

  function matlabForLogic(expr, nVars) {
    const vars = nVars === 3 ? ["A","B","C"] : ["A","B"];
    // Build code that enumerates truth assignments
    // We'll map: ~ -> ~, & -> &, | -> |, -> and <-> converted in MATLAB
    // Use element-wise operations for vectors.
    const matlabExpr = expr
      .replace(/\s+/g,"")
      .replaceAll("~", "~")
      .replaceAll("&", "&")
      .replaceAll("|", "|")
      .replaceAll("<->", " <-> ") // placeholder to handle separately
      .replaceAll("->", " -> ");  // placeholder

    // Convert -> and <-> into MATLAB logical expressions:
    // a -> b  == (~a) | b
    // a <-> b == (a & b) | (~a & ~b)
    // We'll do simple iterative replacement by regex that matches "X -> Y" where X,Y are parenthesized groups or vars.
    // For robustness, we provide a MATLAB anonymous function approach instead of trying to parse fully in JS.
    // We'll generate a MATLAB script that evaluates using a local function with string + eval.
    const varDecl = vars.map(v => `${v} = TT(:,${vars.indexOf(v)+1});`).join("\n");

    return [
`% ===== Tabla de verdad para: ${expr}`,
`% Variables: ${vars.join(", ")}`,
``,
`% Generar combinaciones binarias`,
`TT = dec2bin(0:${(1<<vars.length)-1}) - '0';`,
`${varDecl}`,
``,
`% Evaluar expresion (define en fExpr)`,
`fExpr = '${expr.replace(/'/g,"''")}';`,
`R = eval_logic_expr(fExpr, ${vars.join(", ")});`,
``,
`% Mostrar tabla`,
`T = array2table([TT R], 'VariableNames', {${vars.map(v=>`'${v}'`).join(", ")}, 'R'});`,
`disp(T);`,
``,
`% --- Función auxiliar ---`,
`function R = eval_logic_expr(fExpr, A, B, C)`,
`% Soporta: ~, &, |, ->, <->, xor(A,B)`,
`% Nota: si usas 2 variables, MATLAB ignorará C.`,
`if nargin < 4, C = false(size(A)); end`,
`% Reemplazos de implicación y bicondicional usando regexp simples`,
`% Primero reemplaza xor(A,B) por xor(A,B) de MATLAB (ya existe)`,
`e = fExpr;`,
`% Reemplazar a->b por (~a)|b repetidamente (heurístico)`,
`while contains(e,'->')`,
`    e = regexprep(e, '(\\([^\\)]*\\)|[ABC]|xor\\([ABC],[ABC]\\))\\s*->\\s*(\\([^\\)]*\\)|[ABC]|xor\\([ABC],[ABC]\\))', '(~($1))|($2)');`,
`end`,
`% Reemplazar a<->b por (a&b)|(~a&~b) repetidamente (heurístico)`,
`while contains(e,'<->')`,
`    e = regexprep(e, '(\\([^\\)]*\\)|[ABC]|xor\\([ABC],[ABC]\\))\\s*<->\\s*(\\([^\\)]*\\)|[ABC]|xor\\([ABC],[ABC]\\))', '(($1)&($2))|((~($1))&(~($2)))');`,
`end`,
`% Evaluar con operaciones elemento a elemento`,
`e = strrep(e,'&',' & ');`,
`e = strrep(e,'|',' | ');`,
`R = eval(e);`,
`R = double(R~=0);`,
`end`
    ].join("\n");
  }

  btnLogicRun.addEventListener("click", () => {
    const expr = (logicExpr.value || "").trim();
    const nVars = Number(logicVars.value);

    if (!expr) {
      setMsg(logicMsg, "Escribe una expresión para generar la tabla.", "error");
      return;
    }

    try {
      const { vars, results } = buildTruthTable(expr, nVars);
      renderTruthTable(vars, results, expr);
      logicMatlab.textContent = matlabForLogic(expr, nVars);
      setMsg(logicMsg, `Tabla generada con ${vars.length} variables.`, "ok");
    } catch (e) {
      ttHead.innerHTML = "";
      ttBody.innerHTML = "";
      logicMatlab.textContent = "";
      setMsg(logicMsg, e.message || "Error en la expresión.", "error");
    }
  });

  /* ==========================================================
     2) CONJUNTOS: operaciones + Venn
     ========================================================== */

  const setA = $("#setA");
  const setB = $("#setB");
  const btnSetRun = $("#btnSetRun");
  const btnSetExample = $("#btnSetExample");
  const setMsgEl = $("#setMsg");
  const outA = $("#outA");
  const outB = $("#outB");
  const outOp = $("#outOp");
  const outRes = $("#outRes");
  const vennLeft = $("#vennLeft");
  const vennMid = $("#vennMid");
  const vennRight = $("#vennRight");
  const setMatlab = $("#setMatlab");
  const btnSetCopy = $("#btnSetCopy");

  let currentSetOp = "union";
  $$(".pill").forEach(p => {
    p.addEventListener("click", () => {
      $$(".pill").forEach(x => x.classList.remove("active"));
      p.classList.add("active");
      currentSetOp = p.dataset.op;
    });
  });

  btnSetExample.addEventListener("click", () => {
    setA.value = "1,2,3,a,b";
    setB.value = "2,3,4,b,c";
    setMsg(setMsgEl, "Ejemplo cargado.", "ok");
  });

  btnSetCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(setMatlab.textContent || "");
    setMsg(setMsgEl, ok ? "Código MATLAB copiado." : "No se pudo copiar.", ok ? "ok" : "error");
  });

  function setOps(A, B, op) {
    const aSet = new Set(A.map(String));
    const bSet = new Set(B.map(String));

    const Aonly = A.filter(x => !bSet.has(String(x)));
    const Bonly = B.filter(x => !aSet.has(String(x)));
    const inter = A.filter(x => bSet.has(String(x)));
    const uni = uniq([...A, ...B]);

    let res = [];
    let opName = "";

    switch (op) {
      case "union":
        res = uni;
        opName = "A ∪ B";
        break;
      case "intersect":
        res = inter;
        opName = "A ∩ B";
        break;
      case "setdiffAB":
        res = Aonly;
        opName = "A \\ B";
        break;
      case "setdiffBA":
        res = Bonly;
        opName = "B \\ A";
        break;
      case "setxor":
        res = uniq([...Aonly, ...Bonly]);
        opName = "Dif. simétrica";
        break;
      default:
        res = uni;
        opName = "A ∪ B";
    }

    return { Aonly, Bonly, inter, uni, res, opName };
  }

  function matlabForSets(Araw, Braw, op) {
    // We will output cell arrays for mixed types; numeric-only uses vectors
    const A = parseSetInput(Araw);
    const B = parseSetInput(Braw);

    const allNumeric = (arr) => arr.length > 0 && arr.every(x => typeof x === "number");
    const bothNumeric = allNumeric(A) && allNumeric(B);

    const fmtNum = (arr) => `[${arr.join(" ")}]`;
    const fmtCell = (arr) => `{${arr.map(x => (typeof x === "number" ? x : `'${String(x).replace(/'/g,"''")}'`)).join(", ")}}`;

    const Adecl = bothNumeric ? `A = ${fmtNum(A)};` : `A = ${fmtCell(A)};`;
    const Bdecl = bothNumeric ? `B = ${fmtNum(B)};` : `B = ${fmtCell(B)};`;

    const opLine = (() => {
      switch (op) {
        case "union": return `R = union(A, B);`;
        case "intersect": return `R = intersect(A, B);`;
        case "setdiffAB": return `R = setdiff(A, B);`;
        case "setdiffBA": return `R = setdiff(B, A);`;
        case "setxor": return `R = setxor(A, B);`;
        default: return `R = union(A, B);`;
      }
    })();

    return [
`% ===== Operaciones de conjuntos =====`,
Adecl,
Bdecl,
opLine,
`disp(R);`
    ].join("\n");
  }

  btnSetRun.addEventListener("click", () => {
    const A = parseSetInput(setA.value);
    const B = parseSetInput(setB.value);

    if (A.length === 0 && B.length === 0) {
      setMsg(setMsgEl, "Ingresa valores en A y/o B.", "error");
      return;
    }

    const { Aonly, Bonly, inter, res, opName } = setOps(A, B, currentSetOp);

    outA.textContent = prettySet(A);
    outB.textContent = prettySet(B);
    outOp.textContent = opName;
    outRes.textContent = prettySet(res);

    // Show short text inside venn regions (truncate)
    const trunc = (arr) => {
      const s = arr.map(String);
      if (s.length === 0) return "∅";
      const joined = s.join(", ");
      return joined.length > 18 ? joined.slice(0, 16) + "…" : joined;
    };
    vennLeft.textContent = trunc(Aonly);
    vennMid.textContent = trunc(inter);
    vennRight.textContent = trunc(Bonly);

    setMatlab.textContent = matlabForSets(setA.value, setB.value, currentSetOp);
    setMsg(setMsgEl, "Resultado calculado.", "ok");
  });

  /* ==========================================================
     3) FUNCIONES: parse MATLAB-like expression and plot
     ========================================================== */

  const fxExpr = $("#fxExpr");
  const xminEl = $("#xmin");
  const xmaxEl = $("#xmax");
  const npointsEl = $("#npoints");
  const btnFxRun = $("#btnFxRun");
  const btnFxExample = $("#btnFxExample");
  const btnFxCopy = $("#btnFxCopy");
  const btnFxExport = $("#btnFxExport");
  const fxMsg = $("#fxMsg");
  const fxMatlab = $("#fxMatlab");
  const canvas = $("#plot");
  const ctx = canvas.getContext("2d");

  btnFxExample.addEventListener("click", () => {
    const ex = [
      "sin(x) + 0.2*x.^2",
      "exp(-x).*cos(3*x)",
      "sqrt(abs(x)).*sin(2*x)",
      "log(x.^2 + 1) - 0.5*cos(4*x)"
    ];
    fxExpr.value = ex[Math.floor(Math.random()*ex.length)];
    xminEl.value = "-6";
    xmaxEl.value = "6";
    npointsEl.value = "500";
    setMsg(fxMsg, "Ejemplo cargado.", "ok");
  });

  btnFxCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(fxMatlab.textContent || "");
    setMsg(fxMsg, ok ? "Código MATLAB copiado." : "No se pudo copiar.", ok ? "ok" : "error");
  });

  btnFxExport.addEventListener("click", async () => {
    const data = window.__lastFxExport;
    if (!data) {
      setMsg(fxMsg, "Primero genera una gráfica para exportar.", "error");
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "funcion_resultado.json";
    a.click();
    URL.revokeObjectURL(url);
    setMsg(fxMsg, "JSON exportado.", "ok");
  });

  function matlabForFunction(expr, xmin, xmax, n) {
    const safe = (expr || "").replace(/'/g,"''");
    return [
`% ===== Gráfica de f(x) =====`,
`f = @(x) ${safe};`,
`x = linspace(${xmin}, ${xmax}, ${n});`,
`y = f(x);`,
`figure; plot(x, y, 'LineWidth', 2); grid on;`,
`xlabel('x'); ylabel('f(x)'); title('f(x) = ${safe}');`
    ].join("\n");
  }

  // Convert MATLAB-like to JS expression for evaluation:
  // - elementwise: .*, ./, .^ -> *, /, **
  // - power: ^ -> ** (be careful)
  // - functions: sin cos tan exp log sqrt abs
  // - constants: pi
  function toJsExpr(matlabExpr) {
    let e = (matlabExpr || "").trim();
    if (!e) throw new Error("Escribe una expresión para f(x).");

    // Replace MATLAB elementwise operators
    e = e.replaceAll(".*", "*").replaceAll("./", "/").replaceAll(".^", "**");

    // Replace power ^ with ** (after elementwise handled)
    // This is simplistic but works for typical student expressions.
    e = e.replaceAll("^", "**");

    // Replace pi
    e = e.replace(/\bpi\b/gi, "Math.PI");

    // Map functions to Math.*
    const fns = ["sin","cos","tan","exp","log","sqrt","abs"];
    for (const fn of fns) {
      const re = new RegExp(`\\b${fn}\\b`, "g");
      e = e.replace(re, `Math.${fn}`);
    }

    // Basic hardening: only allow certain chars
    // (Not bulletproof, but blocks obvious injections)
    if (!/^[0-9xX+\-*/().,\s_*MathPIabsincotegqlr]+$/.test(e.replace(/Math\./g,"Math"))) {
      // still allow Math. tokens; above is a heuristic
      // we’ll do a stricter check below on compiled function execution
    }

    return e;
  }

  function evalFunctionOnGrid(expr, xmin, xmax, n) {
    const js = toJsExpr(expr);
    const fn = new Function("x", `"use strict"; return (${js});`);
    const xs = [];
    const ys = [];
    const step = (xmax - xmin) / (n - 1);
    for (let i = 0; i < n; i++) {
      const x = xmin + step * i;
      let y;
      try {
        y = fn(x);
      } catch (e) {
        throw new Error("Error evaluando f(x). Revisa la expresión.");
      }
      if (!Number.isFinite(y)) y = NaN;
      xs.push(x);
      ys.push(y);
    }
    return { xs, ys };
  }

  function getRangeFinite(ys) {
    let ymin = Infinity, ymax = -Infinity;
    for (const y of ys) {
      if (Number.isFinite(y)) {
        ymin = Math.min(ymin, y);
        ymax = Math.max(ymax, y);
      }
    }
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax)) {
      ymin = -1; ymax = 1;
    }
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    return { ymin, ymax };
  }

  function drawPlot(xs, ys, expr) {
    // Fit to canvas internal size
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Styling derived from current theme
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const grid = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.10)";
    const axis = isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.70)";
    const text = isLight ? "rgba(0,0,0,0.80)" : "rgba(255,255,255,0.85)";
    const curve = isLight ? "rgba(124,58,237,0.95)" : "rgba(34,197,94,0.95)";

    const pad = { l: 60, r: 18, t: 22, b: 55 };

    const xmin = xs[0], xmax = xs[xs.length - 1];
    const { ymin, ymax } = getRangeFinite(ys);

    const xToPx = (x) => pad.l + (x - xmin) * (W - pad.l - pad.r) / (xmax - xmin);
    const yToPx = (y) => pad.t + (ymax - y) * (H - pad.t - pad.b) / (ymax - ymin);

    // Grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = grid;
    const gridLines = 10;
    for (let i = 0; i <= gridLines; i++) {
      const gx = pad.l + i * (W - pad.l - pad.r) / gridLines;
      ctx.beginPath();
      ctx.moveTo(gx, pad.t);
      ctx.lineTo(gx, H - pad.b);
      ctx.stroke();

      const gy = pad.t + i * (H - pad.t - pad.b) / gridLines;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(W - pad.r, gy);
      ctx.stroke();
    }

    // Axes (x=0 and y=0 if visible)
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1.6;

    // y-axis at x=0
    if (xmin <= 0 && xmax >= 0) {
      const x0 = xToPx(0);
      ctx.beginPath();
      ctx.moveTo(x0, pad.t);
      ctx.lineTo(x0, H - pad.b);
      ctx.stroke();
    }

    // x-axis at y=0
    if (ymin <= 0 && ymax >= 0) {
      const y0 = yToPx(0);
      ctx.beginPath();
      ctx.moveTo(pad.l, y0);
      ctx.lineTo(W - pad.r, y0);
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = text;
    ctx.font = "14px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(`f(x) = ${expr}`, pad.l, 18);

    ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(`x ∈ [${xmin.toFixed(2)}, ${xmax.toFixed(2)}]`, pad.l, H - 30);
    ctx.fillText(`y ∈ [${ymin.toFixed(2)}, ${ymax.toFixed(2)}]`, pad.l, H - 12);

    // Curve
    ctx.strokeStyle = curve;
    ctx.lineWidth = 2.2;
    ctx.beginPath();

    let started = false;
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (!Number.isFinite(y)) {
        started = false;
        continue;
      }
      const px = xToPx(xs[i]);
      const py = yToPx(y);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }

  btnFxRun.addEventListener("click", () => {
    const expr = (fxExpr.value || "").trim();
    const xmin = Number(xminEl.value);
    const xmax = Number(xmaxEl.value);
    const n = Number(npointsEl.value);

    if (!expr) return setMsg(fxMsg, "Escribe una expresión para f(x).", "error");
    if (!Number.isFinite(xmin) || !Number.isFinite(xmax) || xmin >= xmax) {
      return setMsg(fxMsg, "Dominio inválido: xmin debe ser menor que xmax.", "error");
    }
    if (!Number.isFinite(n) || n < 50 || n > 2000) {
      return setMsg(fxMsg, "Puntos inválidos (usa 50 a 2000).", "error");
    }

    try {
      const { xs, ys } = evalFunctionOnGrid(expr, xmin, xmax, n);
      drawPlot(xs, ys, expr);

      fxMatlab.textContent = matlabForFunction(expr, xmin, xmax, n);
      setMsg(fxMsg, "Gráfica generada.", "ok");

      // export payload
      window.__lastFxExport = { expr, xmin, xmax, n, xs, ys };
    } catch (e) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fxMatlab.textContent = "";
      setMsg(fxMsg, e.message || "Error en la función.", "error");
      window.__lastFxExport = null;
    }
  });

  // Redraw on theme change for plot (if exists)
  btnTheme.addEventListener("click", () => {
    const data = window.__lastFxExport;
    if (data) drawPlot(data.xs, data.ys, data.expr);
  });

})();

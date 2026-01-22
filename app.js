/* ==========================================================
   FunciForge · Ayuda-Memoria Interactiva
   Lógica (tabla + equivalencia) · Conjuntos (ops + universo)
   Funciones (plot + tangente + integral) · Quiz · Historial
   ========================================================== */

(function () {
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const toastEl = $("#toast");
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

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
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function nowISO() { return new Date().toISOString(); }

  function uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const key = String(x);
      if (!seen.has(key)) { seen.add(key); out.push(x); }
    }
    return out;
  }
  function prettySet(arr) {
    if (!arr || arr.length === 0) return "∅";
    return "{ " + arr.map(String).join(", ") + " }";
  }
  function parseSetInput(s) {
    const raw = (s || "").split(",").map(x => x.trim()).filter(Boolean);
    const parsed = raw.map(t => {
      const n = Number(t);
      return Number.isFinite(n) && t !== "" && String(n) === t ? n : t;
    });
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
    // redraw plot if exists
    if (window.__lastFx) drawPlot(window.__lastFx);
  });

  // ---------- Sidebar active link ----------
  const navItems = $$(".nav-item");
  const sectionIds = ["inicio", "logica", "conjuntos", "funciones", "quiz", "historial"];
  const sections = sectionIds.map(id => document.getElementById(id));
  const obs = new IntersectionObserver((entries) => {
    const visible = entries.filter(e => e.isIntersecting).sort((a,b)=> b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const id = visible.target.id;
    navItems.forEach(a => a.classList.toggle("active", a.dataset.section === id));
    window.__activeSection = id;
  }, { rootMargin: "-35% 0px -55% 0px", threshold: [0.12, 0.2, 0.35] });
  sections.forEach(s => obs.observe(s));
  window.__activeSection = "inicio";

  // ---------- Tabs (generic) ----------
  function initTabs() {
    $$(".tabs").forEach(tabs => {
      const tabBtns = tabs.querySelectorAll(".tab");
      tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          tabBtns.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          const target = btn.dataset.tab;
          const parentSection = tabs.closest(".section");
          parentSection.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
          $("#" + target).classList.add("active");
        });
      });
    });
  }
  initTabs();

  // ---------- Stats ----------
  const statRuns = $("#statRuns");
  const statSaved = $("#statSaved");
  const statQuiz = $("#statQuiz");

  function loadCounters() {
    const runs = Number(localStorage.getItem("ff_runs") || "0");
    const saved = Number(localStorage.getItem("ff_saved") || "0");
    const qOk = Number(localStorage.getItem("ff_quiz_ok") || "0");
    const qBad = Number(localStorage.getItem("ff_quiz_bad") || "0");
    const acc = (qOk + qBad) ? Math.round((qOk/(qOk+qBad))*100) : 0;
    statRuns.textContent = runs;
    statSaved.textContent = saved;
    statQuiz.textContent = acc + "%";
  }
  function incCounter(key) {
    const v = Number(localStorage.getItem(key) || "0") + 1;
    localStorage.setItem(key, String(v));
    loadCounters();
  }
  loadCounters();

  /* ==========================================================
     HISTORIAL (localStorage)
     ========================================================== */
  const LS_KEY = "ff_history_v1";
  function readHistory() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
    catch { return []; }
  }
  function writeHistory(items) {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  }
  function addHistory(item) {
    const items = readHistory();
    items.unshift(item);
    writeHistory(items);
    incCounter("ff_saved");
    renderHistory();
    toast("Guardado en historial.");
  }

  // Historial UI
  const histCount = $("#histCount");
  const histSearch = $("#histSearch");
  const histFilter = $("#histFilter");
  const historyList = $("#historyList");
  const histType = $("#histType");
  const histSummary = $("#histSummary");
  const histDate = $("#histDate");
  const histMatlab = $("#histMatlab");
  const btnHistLoad = $("#btnHistLoad");
  const btnHistDelete = $("#btnHistDelete");
  const btnHistCopy = $("#btnHistCopy");
  const btnHistDownload = $("#btnHistDownload");

  let selectedHistId = null;

  function typeLabel(t) {
    return ({
      logic_tt: "Lógica · Tabla",
      logic_eq: "Lógica · Equivalencia",
      sets_core: "Conjuntos · Operaciones",
      sets_uni: "Conjuntos · Universo",
      fx: "Funciones · Análisis"
    })[t] || t;
  }

  function summarize(item) {
    if (item.type === "logic_tt") return item.data.expr;
    if (item.type === "logic_eq") return `${item.data.e1}  ||  ${item.data.e2}`;
    if (item.type === "sets_core") return `${item.data.A}  |  ${item.data.op}  |  ${item.data.B}`;
    if (item.type === "sets_uni") return `U=${item.data.U}  A=${item.data.A}  B=${item.data.B}`;
    if (item.type === "fx") return `f(x)=${item.data.expr}  [${item.data.xmin},${item.data.xmax}]`;
    return "—";
  }

  function renderHistory() {
    const items = readHistory();
    const q = (histSearch.value || "").toLowerCase().trim();
    const f = histFilter.value;

    const filtered = items.filter(it => {
      if (f !== "all" && it.type !== f) return false;
      if (!q) return true;
      const hay = (typeLabel(it.type) + " " + summarize(it) + " " + (it.matlab || "")).toLowerCase();
      return hay.includes(q);
    });

    histCount.textContent = String(items.length);
    historyList.innerHTML = "";

    filtered.forEach(it => {
      const div = document.createElement("div");
      div.className = "hitem" + (it.id === selectedHistId ? " active" : "");
      div.dataset.id = it.id;

      const top = document.createElement("div");
      top.className = "hitem-top";
      const title = document.createElement("div");
      title.className = "hitem-title";
      title.textContent = typeLabel(it.type);
      const meta = document.createElement("div");
      meta.className = "hitem-meta";
      meta.textContent = new Date(it.ts).toLocaleString();

      const body = document.createElement("div");
      body.className = "hitem-body";
      body.textContent = summarize(it);

      top.appendChild(title);
      top.appendChild(meta);
      div.appendChild(top);
      div.appendChild(body);

      div.addEventListener("click", () => {
        selectedHistId = it.id;
        renderHistory();
        showHistoryDetail(it);
      });

      historyList.appendChild(div);
    });

    // if nothing selected or selected missing
    const sel = items.find(x => x.id === selectedHistId) || null;
    if (!sel) {
      selectedHistId = null;
      histType.textContent = "—";
      histSummary.textContent = "—";
      histDate.textContent = "—";
      histMatlab.textContent = "";
    }
  }

  function showHistoryDetail(it) {
    histType.textContent = typeLabel(it.type);
    histSummary.textContent = summarize(it);
    histDate.textContent = new Date(it.ts).toLocaleString();
    histMatlab.textContent = it.matlab || "";
  }

  histSearch.addEventListener("input", renderHistory);
  histFilter.addEventListener("change", renderHistory);

  btnHistCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(histMatlab.textContent || "");
    toast(ok ? "MATLAB copiado." : "No se pudo copiar.");
  });
  btnHistDownload.addEventListener("click", () => {
    if (!histMatlab.textContent) return toast("No hay código para descargar.");
    downloadTextFile("funciforge_historial.m", histMatlab.textContent);
    toast("Descargado.");
  });

  btnHistDelete.addEventListener("click", () => {
    if (!selectedHistId) return toast("Selecciona un item.");
    const items = readHistory().filter(x => x.id !== selectedHistId);
    writeHistory(items);
    selectedHistId = null;
    renderHistory();
    toast("Eliminado.");
  });

  btnHistLoad.addEventListener("click", () => {
    if (!selectedHistId) return toast("Selecciona un item.");
    const it = readHistory().find(x => x.id === selectedHistId);
    if (!it) return toast("No encontrado.");

    // carga según tipo
    if (it.type === "logic_tt") {
      $("#logicExpr").value = it.data.expr;
      $("#logicVars").value = String(it.data.nVars);
      $("#btnLogicRun").click();
      location.hash = "#logica";
    } else if (it.type === "logic_eq") {
      $("#eqExpr1").value = it.data.e1;
      $("#eqExpr2").value = it.data.e2;
      $("#eqVars").value = String(it.data.nVars);
      $("#btnEqRun").click();
      location.hash = "#logica";
      // activar tab equivalencia
      document.querySelector('[data-tab="logic-eq"]').click();
    } else if (it.type === "sets_core") {
      $("#setA").value = it.data.A;
      $("#setB").value = it.data.B;
      // set op
      document.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p.dataset.op === it.data.op));
      window.__currentSetOp = it.data.op;
      $("#btnSetRun").click();
      location.hash = "#conjuntos";
    } else if (it.type === "sets_uni") {
      $("#setU").value = it.data.U;
      $("#setA2").value = it.data.A;
      $("#setB2").value = it.data.B;
      $("#btnUniRun").click();
      location.hash = "#conjuntos";
      document.querySelector('[data-tab="sets-uni"]').click();
    } else if (it.type === "fx") {
      $("#fxExpr").value = it.data.expr;
      $("#xmin").value = String(it.data.xmin);
      $("#xmax").value = String(it.data.xmax);
      $("#npoints").value = String(it.data.n);
      $("#x0").value = String(it.data.x0);
      $("#inta").value = String(it.data.a);
      $("#intb").value = String(it.data.b);
      $("#showTangent").checked = !!it.data.showTangent;
      $("#showIntegral").checked = !!it.data.showIntegral;
      $("#btnFxRun").click();
      location.hash = "#funciones";
    }

    toast("Cargado.");
  });

  // Export / Clear all
  const btnExportAll = $("#btnExportAll");
  const btnClearAll = $("#btnClearAll");

  btnExportAll.addEventListener("click", () => {
    const items = readHistory();
    downloadTextFile("funciforge_historial.json", JSON.stringify(items, null, 2));
    toast("Historial exportado.");
  });

  btnClearAll.addEventListener("click", () => {
    writeHistory([]);
    selectedHistId = null;
    renderHistory();
    toast("Historial borrado.");
  });

  renderHistory();

  /* ==========================================================
     1) LÓGICA: parser + truth table + equivalence
     ========================================================== */

  const logicExpr = $("#logicExpr");
  const logicVars = $("#logicVars");
  const logicExample = $("#logicExample");
  const btnLogicRun = $("#btnLogicRun");
  const btnLogicClear = $("#btnLogicClear");
  const btnLogicCopy = $("#btnLogicCopy");
  const btnLogicSave = $("#btnLogicSave");
  const btnLogicDownload = $("#btnLogicDownload");
  const logicMsg = $("#logicMsg");
  const truthTable = $("#truthTable");
  const ttHead = truthTable.querySelector("thead");
  const ttBody = truthTable.querySelector("tbody");
  const logicMatlab = $("#logicMatlab");

  logicExample.addEventListener("change", () => { if (logicExample.value) logicExpr.value = logicExample.value; });

  btnLogicClear.addEventListener("click", () => {
    logicExpr.value = "";
    ttHead.innerHTML = "";
    ttBody.innerHTML = "";
    logicMatlab.textContent = "";
    setMsg(logicMsg, "");
    toast("Lógica limpiada.");
  });

  btnLogicCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(logicMatlab.textContent || "");
    setMsg(logicMsg, ok ? "Código MATLAB copiado." : "No se pudo copiar.", ok ? "ok" : "error");
    toast(ok ? "MATLAB copiado." : "No se pudo copiar.");
  });

  btnLogicDownload.addEventListener("click", () => {
    if (!logicMatlab.textContent) return toast("Genera la tabla primero.");
    downloadTextFile("funciforge_logica_tabla.m", logicMatlab.textContent);
    toast("Descargado .m");
  });

  btnLogicSave.addEventListener("click", () => {
    const expr = (logicExpr.value || "").trim();
    const nVars = Number(logicVars.value);
    if (!expr || !logicMatlab.textContent) return toast("Primero genera la tabla.");
    addHistory({
      id: crypto.randomUUID(),
      ts: nowISO(),
      type: "logic_tt",
      data: { expr, nVars },
      matlab: logicMatlab.textContent
    });
  });

  // --- Tokenizer + Shunting-yard to RPN ---
  function tokenizeLogic(input) {
    const s = input.replace(/\s+/g, "");
    const tokens = [];
    let i = 0;
    const isVar = (c) => ["A","B","C"].includes(c);

    while (i < s.length) {
      const c = s[i];

      if (c === "(" || c === ")") { tokens.push({ type:"paren", value:c }); i++; continue; }
      if (s.startsWith("<->", i)) { tokens.push({ type:"op", value:"<->" }); i += 3; continue; }
      if (s.startsWith("->", i)) { tokens.push({ type:"op", value:"->" }); i += 2; continue; }
      if (c === "~") { tokens.push({ type:"op", value:"~" }); i++; continue; }
      if (c === "&" || c === "|") { tokens.push({ type:"op", value:c }); i++; continue; }

      if (s.startsWith("xor(", i)) {
        const m = s.slice(i).match(/^xor\(([ABC]),([ABC])\)/);
        if (!m) throw new Error("xor() debe ser xor(A,B) con variables A/B/C.");
        tokens.push({ type:"xor", a:m[1], b:m[2] });
        i += m[0].length;
        continue;
      }

      if (isVar(c)) { tokens.push({ type:"var", value:c }); i++; continue; }
      throw new Error(`Símbolo no válido en posición ${i+1}.`);
    }
    return tokens;
  }

  const precedence = { "~": 5, "&": 4, "|": 3, "->": 2, "<->": 1 };
  const rightAssoc = new Set(["~","->"]);

  function toRPN(tokens) {
    const output = [];
    const stack = [];
    for (const t of tokens) {
      if (t.type === "var" || t.type === "xor") output.push(t);
      else if (t.type === "op") {
        const o1 = t.value;
        while (stack.length) {
          const top = stack[stack.length-1];
          if (top.type !== "op") break;
          const o2 = top.value;
          const p1 = precedence[o1], p2 = precedence[o2];
          if ((rightAssoc.has(o1) && p1 < p2) || (!rightAssoc.has(o1) && p1 <= p2)) {
            output.push(stack.pop());
          } else break;
        }
        stack.push(t);
      } else if (t.type === "paren") {
        if (t.value === "(") stack.push(t);
        else {
          let found = false;
          while (stack.length) {
            const x = stack.pop();
            if (x.type === "paren" && x.value === "(") { found = true; break; }
            output.push(x);
          }
          if (!found) throw new Error("Paréntesis desbalanceados.");
        }
      }
    }
    while (stack.length) {
      const x = stack.pop();
      if (x.type === "paren") throw new Error("Paréntesis desbalanceados.");
      output.push(x);
    }
    return output;
  }

  function evalRPN(rpn, env) {
    const st = [];
    for (const t of rpn) {
      if (t.type === "var") st.push(Boolean(env[t.value]));
      else if (t.type === "xor") st.push(Boolean(env[t.a]) !== Boolean(env[t.b]));
      else if (t.type === "op") {
        if (t.value === "~") {
          if (st.length < 1) throw new Error("Falta operando para ~.");
          st.push(!st.pop());
        } else {
          if (st.length < 2) throw new Error(`Faltan operandos para ${t.value}.`);
          const b = st.pop(), a = st.pop();
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
    const results = rows.map(env => ({ ...env, R: evalRPN(rpn, env) }));
    return { vars, results, rpn };
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

  function matlabEvalLogicHelper() {
    // Helper function used both in TT and equivalence code generation
    return [
`function R = eval_logic_expr(fExpr, A, B, C)`,
`% Soporta: ~, &, |, ->, <->, xor(A,B)`,
`if nargin < 4, C = false(size(A)); end`,
`e = fExpr;`,
`while contains(e,'->')`,
`    e = regexprep(e, '(\\([^\\)]*\\)|[ABC]|xor\\([ABC],[ABC]\\))\\s*->\\s*(\\([^\\)]*\\)|[ABC]|xor\\([ABC],[ABC]\\))', '(~($1))|($2)');`,
`end`,
`while contains(e,'<->')`,
`    e = regexprep(e, '(\\([^\\)]*\\)|[ABC]|xor\\([ABC],[ABC]\\))\\s*<->\\s*(\\([^\\)]*\\)|[ABC]|xor\\([ABC],[ABC]\\))', '(($1)&($2))|((~($1))&(~($2)))');`,
`end`,
`R = eval(e);`,
`R = double(R~=0);`,
`end`
    ].join("\n");
  }

  function matlabForLogic(expr, nVars) {
    const vars = nVars === 3 ? ["A","B","C"] : ["A","B"];
    const varDecl = vars.map((v,i)=> `${v} = TT(:,${i+1});`).join("\n");

    return [
`% ===== FunciForge: Tabla de verdad =====`,
`expr = '${expr.replace(/'/g,"''")}';`,
`TT = dec2bin(0:${(1<<vars.length)-1}) - '0';`,
varDecl,
`R = eval_logic_expr(expr, ${vars.join(", ")});`,
`T = array2table([TT R], 'VariableNames', {${vars.map(v=>`'${v}'`).join(", ")}, 'R'});`,
`disp(T);`,
``,
matlabEvalLogicHelper()
    ].join("\n");
  }

  btnLogicRun.addEventListener("click", () => {
    const expr = (logicExpr.value || "").trim();
    const nVars = Number(logicVars.value);
    if (!expr) return setMsg(logicMsg, "Escribe una expresión.", "error");

    try {
      const { vars, results } = buildTruthTable(expr, nVars);
      renderTruthTable(vars, results, expr);
      logicMatlab.textContent = matlabForLogic(expr, nVars);
      setMsg(logicMsg, `Tabla generada con ${vars.length} variables.`, "ok");
      incCounter("ff_runs");
      toast("Tabla generada.");
    } catch (e) {
      ttHead.innerHTML = "";
      ttBody.innerHTML = "";
      logicMatlab.textContent = "";
      setMsg(logicMsg, e.message || "Error en la expresión.", "error");
    }
  });

  /* ----------------- Equivalencia ----------------- */
  const eqExpr1 = $("#eqExpr1");
  const eqExpr2 = $("#eqExpr2");
  const eqVars = $("#eqVars");
  const eqExample = $("#eqExample");
  const btnEqRun = $("#btnEqRun");
  const btnEqClear = $("#btnEqClear");
  const btnEqSave = $("#btnEqSave");
  const eqMsg = $("#eqMsg");
  const eqResult = $("#eqResult");
  const eqCounter = $("#eqCounter");
  const eqMatlab = $("#eqMatlab");
  const btnEqCopy = $("#btnEqCopy");
  const btnEqDownload = $("#btnEqDownload");

  eqExample.addEventListener("change", () => {
    if (!eqExample.value) return;
    const [a,b] = eqExample.value.split("||");
    eqExpr1.value = a || "";
    eqExpr2.value = b || "";
  });

  btnEqClear.addEventListener("click", () => {
    eqExpr1.value = "";
    eqExpr2.value = "";
    eqResult.textContent = "—";
    eqCounter.textContent = "—";
    eqMatlab.textContent = "";
    setMsg(eqMsg, "");
    toast("Equivalencia limpiada.");
  });

  btnEqCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(eqMatlab.textContent || "");
    toast(ok ? "MATLAB copiado." : "No se pudo copiar.");
  });

  btnEqDownload.addEventListener("click", () => {
    if (!eqMatlab.textContent) return toast("Primero verifica.");
    downloadTextFile("funciforge_logica_equivalencia.m", eqMatlab.textContent);
    toast("Descargado .m");
  });

  btnEqSave.addEventListener("click", () => {
    const e1 = (eqExpr1.value || "").trim();
    const e2 = (eqExpr2.value || "").trim();
    const nVars = Number(eqVars.value);
    if (!e1 || !e2 || !eqMatlab.textContent) return toast("Primero verifica equivalencia.");
    addHistory({
      id: crypto.randomUUID(),
      ts: nowISO(),
      type: "logic_eq",
      data: { e1, e2, nVars, ok: eqResult.textContent },
      matlab: eqMatlab.textContent
    });
  });

  function matlabForEquivalence(e1, e2, nVars) {
    const vars = nVars === 3 ? ["A","B","C"] : ["A","B"];
    const varDecl = vars.map((v,i)=> `${v} = TT(:,${i+1});`).join("\n");
    return [
`% ===== FunciForge: Equivalencia lógica =====`,
`expr1 = '${e1.replace(/'/g,"''")}';`,
`expr2 = '${e2.replace(/'/g,"''")}';`,
`TT = dec2bin(0:${(1<<vars.length)-1}) - '0';`,
varDecl,
`R1 = eval_logic_expr(expr1, ${vars.join(", ")});`,
`R2 = eval_logic_expr(expr2, ${vars.join(", ")});`,
`eq = all(R1 == R2);`,
`disp(eq);`,
`if ~eq`,
`    idx = find(R1 ~= R2, 1, 'first');`,
`    disp('Contraejemplo:');`,
`    disp(TT(idx,:));`,
`    disp([R1(idx) R2(idx)]);`,
`end`,
``,
matlabEvalLogicHelper()
    ].join("\n");
  }

  btnEqRun.addEventListener("click", () => {
    const e1 = (eqExpr1.value || "").trim();
    const e2 = (eqExpr2.value || "").trim();
    const nVars = Number(eqVars.value);
    if (!e1 || !e2) return setMsg(eqMsg, "Escribe ambas expresiones.", "error");

    try {
      const t1 = buildTruthTable(e1, nVars);
      const t2 = buildTruthTable(e2, nVars);
      const vars = nVars === 3 ? ["A","B","C"] : ["A","B"];
      const { rows } = genAssignments(nVars);

      let ok = true;
      let counter = null;
      for (const env of rows) {
        const r1 = evalRPN(t1.rpn, env);
        const r2 = evalRPN(t2.rpn, env);
        if (r1 !== r2) { ok = false; counter = env; break; }
      }

      eqResult.textContent = ok ? "Equivalentes ✅" : "No equivalentes ❌";
      eqResult.style.borderColor = ok ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)";
      eqResult.style.background = ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";

      if (ok) eqCounter.textContent = "—";
      else {
        const parts = vars.map(v => `${v}=${counter[v] ? 1 : 0}`).join(", ");
        eqCounter.textContent = `${parts} (R1≠R2)`;
      }

      eqMatlab.textContent = matlabForEquivalence(e1, e2, nVars);
      setMsg(eqMsg, ok ? "Son equivalentes." : "No son equivalentes.", ok ? "ok" : "error");
      incCounter("ff_runs");
      toast("Verificación lista.");
    } catch (e) {
      eqMatlab.textContent = "";
      eqResult.textContent = "—";
      eqCounter.textContent = "—";
      setMsg(eqMsg, e.message || "Error en las expresiones.", "error");
    }
  });

  /* ==========================================================
     2) CONJUNTOS: ops + universe/complements
     ========================================================== */

  // Core
  const setA = $("#setA");
  const setB = $("#setB");
  const btnSetRun = $("#btnSetRun");
  const btnSetExample = $("#btnSetExample");
  const btnSetClear = $("#btnSetClear");
  const btnSetSave = $("#btnSetSave");
  const setMsgEl = $("#setMsg");
  const outA = $("#outA");
  const outB = $("#outB");
  const outCard = $("#outCard");
  const outOp = $("#outOp");
  const outRes = $("#outRes");
  const vennLeft = $("#vennLeft");
  const vennMid = $("#vennMid");
  const vennRight = $("#vennRight");
  const setMatlab = $("#setMatlab");
  const btnSetCopy = $("#btnSetCopy");
  const btnSetDownload = $("#btnSetDownload");

  window.__currentSetOp = "union";
  $$(".pill").forEach(p => {
    p.addEventListener("click", () => {
      $$(".pill").forEach(x => x.classList.remove("active"));
      p.classList.add("active");
      window.__currentSetOp = p.dataset.op;
    });
  });

  btnSetExample.addEventListener("click", () => {
    setA.value = "1,2,3,a,b";
    setB.value = "2,3,4,b,c";
    setMsg(setMsgEl, "Ejemplo cargado.", "ok");
    toast("Ejemplo cargado.");
  });

  btnSetClear.addEventListener("click", () => {
    setA.value = "";
    setB.value = "";
    outA.textContent = "";
    outB.textContent = "";
    outCard.textContent = "";
    outOp.textContent = "";
    outRes.textContent = "";
    vennLeft.textContent = "";
    vennMid.textContent = "";
    vennRight.textContent = "";
    setMatlab.textContent = "";
    setMsg(setMsgEl, "");
    toast("Conjuntos limpiado.");
  });

  btnSetCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(setMatlab.textContent || "");
    toast(ok ? "MATLAB copiado." : "No se pudo copiar.");
  });

  btnSetDownload.addEventListener("click", () => {
    if (!setMatlab.textContent) return toast("Primero calcula.");
    downloadTextFile("funciforge_conjuntos.m", setMatlab.textContent);
    toast("Descargado .m");
  });

  btnSetSave.addEventListener("click", () => {
    if (!setMatlab.textContent) return toast("Primero calcula.");
    addHistory({
      id: crypto.randomUUID(),
      ts: nowISO(),
      type: "sets_core",
      data: { A: setA.value, B: setB.value, op: window.__currentSetOp },
      matlab: setMatlab.textContent
    });
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
      case "union": res = uni; opName = "A ∪ B"; break;
      case "intersect": res = inter; opName = "A ∩ B"; break;
      case "setdiffAB": res = Aonly; opName = "A \\ B"; break;
      case "setdiffBA": res = Bonly; opName = "B \\ A"; break;
      case "setxor": res = uniq([...Aonly, ...Bonly]); opName = "Dif. simétrica"; break;
      default: res = uni; opName = "A ∪ B";
    }
    return { Aonly, Bonly, inter, res, opName };
  }

  function matlabForSets(Araw, Braw, op) {
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
`% ===== FunciForge: Operaciones de conjuntos =====`,
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

    const { Aonly, Bonly, inter, res, opName } = setOps(A, B, window.__currentSetOp);

    outA.textContent = prettySet(A);
    outB.textContent = prettySet(B);
    outCard.textContent = `${A.length}, ${B.length}`;
    outOp.textContent = opName;
    outRes.textContent = prettySet(res);

    const trunc = (arr) => {
      const s = arr.map(String);
      if (s.length === 0) return "∅";
      const joined = s.join(", ");
      return joined.length > 18 ? joined.slice(0, 16) + "…" : joined;
    };
    vennLeft.textContent = trunc(Aonly);
    vennMid.textContent = trunc(inter);
    vennRight.textContent = trunc(Bonly);

    setMatlab.textContent = matlabForSets(setA.value, setB.value, window.__currentSetOp);
    setMsg(setMsgEl, "Resultado calculado.", "ok");
    incCounter("ff_runs");
    toast("Conjuntos calculado.");
  });

  // Universo + complementos
  const setU = $("#setU");
  const setA2 = $("#setA2");
  const setB2 = $("#setB2");
  const btnUniRun = $("#btnUniRun");
  const btnUniExample = $("#btnUniExample");
  const btnUniClear = $("#btnUniClear");
  const btnUniSave = $("#btnUniSave");
  const uniMsg = $("#uniMsg");
  const outU = $("#outU");
  const outA2 = $("#outA2");
  const outB2 = $("#outB2");
  const outAc = $("#outAc");
  const outBc = $("#outBc");
  const uniMatlab = $("#uniMatlab");
  const btnUniCopy = $("#btnUniCopy");
  const btnUniDownload = $("#btnUniDownload");

  btnUniExample.addEventListener("click", () => {
    setU.value = "1,2,3,4,5,a,b,c";
    setA2.value = "1,2,a";
    setB2.value = "2,3,c";
    setMsg(uniMsg, "Ejemplo cargado.", "ok");
    toast("Ejemplo U cargado.");
  });

  btnUniClear.addEventListener("click", () => {
    setU.value = "";
    setA2.value = "";
    setB2.value = "";
    outU.textContent = "";
    outA2.textContent = "";
    outB2.textContent = "";
    outAc.textContent = "";
    outBc.textContent = "";
    uniMatlab.textContent = "";
    setMsg(uniMsg, "");
    toast("Universo limpiado.");
  });

  btnUniCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(uniMatlab.textContent || "");
    toast(ok ? "MATLAB copiado." : "No se pudo copiar.");
  });

  btnUniDownload.addEventListener("click", () => {
    if (!uniMatlab.textContent) return toast("Primero calcula.");
    downloadTextFile("funciforge_universo_complementos.m", uniMatlab.textContent);
    toast("Descargado .m");
  });

  btnUniSave.addEventListener("click", () => {
    if (!uniMatlab.textContent) return toast("Primero calcula.");
    addHistory({
      id: crypto.randomUUID(),
      ts: nowISO(),
      type: "sets_uni",
      data: { U: setU.value, A: setA2.value, B: setB2.value },
      matlab: uniMatlab.textContent
    });
  });

  function matlabForUniverse(Uraw, Araw, Braw) {
    const U = parseSetInput(Uraw);
    const A = parseSetInput(Araw);
    const B = parseSetInput(Braw);
    const allNumeric = (arr) => arr.length > 0 && arr.every(x => typeof x === "number");
    const fmtNum = (arr) => `[${arr.join(" ")}]`;
    const fmtCell = (arr) => `{${arr.map(x => (typeof x === "number" ? x : `'${String(x).replace(/'/g,"''")}'`)).join(", ")}}`;

    const mixed = !(allNumeric(U) && allNumeric(A) && allNumeric(B));
    const Udecl = mixed ? `U = ${fmtCell(U)};` : `U = ${fmtNum(U)};`;
    const Adecl = mixed ? `A = ${fmtCell(A)};` : `A = ${fmtNum(A)};`;
    const Bdecl = mixed ? `B = ${fmtCell(B)};` : `B = ${fmtNum(B)};`;

    return [
`% ===== FunciForge: Universo y complementos =====`,
Udecl,
Adecl,
Bdecl,
`Ac = setdiff(U, A);`,
`Bc = setdiff(U, B);`,
`disp('Ac:'); disp(Ac);`,
`disp('Bc:'); disp(Bc);`
    ].join("\n");
  }

  btnUniRun.addEventListener("click", () => {
    const U = parseSetInput(setU.value);
    const A = parseSetInput(setA2.value);
    const B = parseSetInput(setB2.value);

    if (U.length === 0) return setMsg(uniMsg, "Ingresa el universo U.", "error");

    const uSet = new Set(U.map(String));
    const outOfU_A = A.filter(x => !uSet.has(String(x)));
    const outOfU_B = B.filter(x => !uSet.has(String(x)));

    const Ac = U.filter(x => !new Set(A.map(String)).has(String(x)));
    const Bc = U.filter(x => !new Set(B.map(String)).has(String(x)));

    outU.textContent = prettySet(U);
    outA2.textContent = prettySet(A);
    outB2.textContent = prettySet(B);
    outAc.textContent = prettySet(Ac);
    outBc.textContent = prettySet(Bc);

    uniMatlab.textContent = matlabForUniverse(setU.value, setA2.value, setB2.value);

    if (outOfU_A.length || outOfU_B.length) {
      setMsg(uniMsg, `Advertencia: hay elementos fuera de U.`, "error");
    } else {
      setMsg(uniMsg, "Complementos calculados.", "ok");
    }

    incCounter("ff_runs");
    toast("Universo listo.");
  });

  /* ==========================================================
     3) FUNCIONES: plot + tangent + integral (numeric)
     ========================================================== */
  const fxExpr = $("#fxExpr");
  const xminEl = $("#xmin");
  const xmaxEl = $("#xmax");
  const npointsEl = $("#npoints");
  const x0El = $("#x0");
  const intaEl = $("#inta");
  const intbEl = $("#intb");
  const showTangentEl = $("#showTangent");
  const showIntegralEl = $("#showIntegral");

  const btnFxRun = $("#btnFxRun");
  const btnFxExample = $("#btnFxExample");
  const btnFxCopy = $("#btnFxCopy");
  const btnFxDownload = $("#btnFxDownload");
  const btnFxExport = $("#btnFxExport");
  const btnFxSave = $("#btnFxSave");
  const btnFxClear = $("#btnFxClear");
  const fxMsg = $("#fxMsg");
  const fxMatlab = $("#fxMatlab");

  const outFx0 = $("#outFx0");
  const outDfx0 = $("#outDfx0");
  const outInt = $("#outInt");

  const canvas = $("#plot");
  const ctx = canvas.getContext("2d");

  btnFxExample.addEventListener("click", () => {
    const ex = [
      "sin(x) + 0.2*x.^2",
      "exp(-x).*cos(3*x)",
      "sqrt(abs(x)).*sin(2*x)",
      "log(x.^2 + 1) - 0.5*cos(4*x)"
    ];
    fxExpr.value = ex[Math.floor(Math.random() * ex.length)];
    xminEl.value = "-6";
    xmaxEl.value = "6";
    npointsEl.value = "700";
    x0El.value = "0";
    intaEl.value = "-1";
    intbEl.value = "1";
    showTangentEl.checked = true;
    showIntegralEl.checked = true;
    setMsg(fxMsg, "Ejemplo cargado.", "ok");
    toast("Ejemplo cargado.");
  });

  btnFxClear.addEventListener("click", () => {
    fxExpr.value = "";
    fxMatlab.textContent = "";
    outFx0.textContent = "—";
    outDfx0.textContent = "—";
    outInt.textContent = "—";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMsg(fxMsg, "");
    window.__lastFx = null;
    toast("Funciones limpiado.");
  });

  btnFxCopy.addEventListener("click", async () => {
    const ok = await copyToClipboard(fxMatlab.textContent || "");
    toast(ok ? "MATLAB copiado." : "No se pudo copiar.");
  });

  btnFxDownload.addEventListener("click", () => {
    if (!fxMatlab.textContent) return toast("Primero analiza y grafica.");
    downloadTextFile("funciforge_funciones.m", fxMatlab.textContent);
    toast("Descargado .m");
  });

  btnFxExport.addEventListener("click", () => {
    const data = window.__lastFx;
    if (!data) return toast("Primero genera una gráfica.");
    downloadTextFile("funciforge_funcion_resultado.json", JSON.stringify(data, null, 2));
    toast("JSON exportado.");
  });

  btnFxSave.addEventListener("click", () => {
    const data = window.__lastFx;
    if (!data || !fxMatlab.textContent) return toast("Primero analiza y grafica.");
    addHistory({
      id: crypto.randomUUID(),
      ts: nowISO(),
      type: "fx",
      data: {
        expr: data.expr, xmin: data.xmin, xmax: data.xmax, n: data.n,
        x0: data.x0, a: data.a, b: data.b,
        showTangent: data.showTangent, showIntegral: data.showIntegral
      },
      matlab: fxMatlab.textContent
    });
  });

  // MATLAB generator for functions (plot + derivative + integral)
  function matlabForFunction(expr, xmin, xmax, n, x0, a, b) {
    const safe = (expr || "").replace(/'/g,"''");
    return [
`% ===== FunciForge: Funciones y análisis =====`,
`f = @(x) ${safe};`,
`x = linspace(${xmin}, ${xmax}, ${n});`,
`y = f(x);`,
``,
`% Evaluación puntual`,
`x0 = ${x0};`,
`fx0 = f(x0);`,
``,
`% Derivada numérica (diferencia central)`,
`h = 1e-4;`,
`dfx0 = (f(x0+h) - f(x0-h)) / (2*h);`,
``,
`% Integral numérica (trapz)`,
`a = ${a}; b = ${b};`,
`xi = linspace(a, b, 2000);`,
`yi = f(xi);`,
`I = trapz(xi, yi);`,
``,
`disp(['f(x0)=', num2str(fx0)]);`,
`disp(['f''(x0)≈', num2str(dfx0)]);`,
`disp(['Integral≈', num2str(I)]);`,
``,
`% Gráfica`,
`figure; plot(x, y, 'LineWidth', 2); grid on; hold on;`,
`plot(x0, fx0, 'o', 'MarkerSize', 8, 'LineWidth', 2);`,
`% Tangente: y = f(x0) + f'(x0)(x-x0)`,
`yt = fx0 + dfx0*(x - x0);`,
`plot(x, yt, '--', 'LineWidth', 2);`,
`% Área (integral)`,
`area(xi, yi, 'FaceAlpha', 0.15, 'EdgeAlpha', 0.2);`,
`xlabel('x'); ylabel('f(x)'); title('FunciForge');`
    ].join("\n");
  }

  // Convert MATLAB-like to JS expression for evaluation
  function toJsExpr(matlabExpr) {
    let e = (matlabExpr || "").trim();
    if (!e) throw new Error("Escribe una expresión para f(x).");

    e = e.replaceAll(".*", "*").replaceAll("./", "/").replaceAll(".^", "**");
    e = e.replaceAll("^", "**");
    e = e.replace(/\bpi\b/gi, "Math.PI");

    const fns = ["sin","cos","tan","exp","log","sqrt","abs"];
    for (const fn of fns) e = e.replace(new RegExp(`\\b${fn}\\b`, "g"), `Math.${fn}`);

    // allow only safe chars
    const safe = /^[0-9xX+\-*/().,\s_*MathPIabsincotegqlr]+$/;
    if (!safe.test(e.replace(/Math\./g,"Math"))) {
      // still let it attempt; most student inputs pass. If it fails, we throw later.
    }
    return e;
  }

  function makeFn(expr) {
    const js = toJsExpr(expr);
    return new Function("x", `"use strict"; return (${js});`);
  }

  function linspace(a, b, n) {
    const out = [];
    const step = (b - a) / (n - 1);
    for (let i = 0; i < n; i++) out.push(a + step * i);
    return out;
  }

  function evalGrid(fn, xs) {
    const ys = [];
    for (const x of xs) {
      let y;
      try { y = fn(x); } catch { y = NaN; }
      ys.push(Number.isFinite(y) ? y : NaN);
    }
    return ys;
  }

  function rangeFinite(ys) {
    let ymin = Infinity, ymax = -Infinity;
    for (const y of ys) if (Number.isFinite(y)) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax)) { ymin = -1; ymax = 1; }
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    return { ymin, ymax };
  }

  function derivativeCentral(fn, x0, h = 1e-4) {
    const y1 = fn(x0 + h);
    const y2 = fn(x0 - h);
    const d = (y1 - y2) / (2*h);
    return Number.isFinite(d) ? d : NaN;
  }

  function integralTrap(fn, a, b, n = 1200) {
    if (a === b) return 0;
    const xs = linspace(a, b, n);
    const ys = evalGrid(fn, xs);
    let sum = 0;
    for (let i = 0; i < n - 1; i++) {
      const y1 = ys[i], y2 = ys[i+1];
      const dx = xs[i+1] - xs[i];
      if (Number.isFinite(y1) && Number.isFinite(y2)) sum += 0.5 * (y1 + y2) * dx;
    }
    return sum;
  }

  function drawPlot(data) {
    const { xs, ys, expr, x0, fx0, dfx0, a, b, showTangent, showIntegral, tanY } = data;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const grid = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.10)";
    const axis = isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.70)";
    const text = isLight ? "rgba(0,0,0,0.80)" : "rgba(255,255,255,0.86)";
    const curve = isLight ? "rgba(124,58,237,0.95)" : "rgba(34,197,94,0.95)";
    const accent = isLight ? "rgba(239,68,68,0.9)" : "rgba(245,158,11,0.9)";
    const fill = isLight ? "rgba(124,58,237,0.12)" : "rgba(34,197,94,0.12)";
    const tangentCol = isLight ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.75)";

    const pad = { l: 64, r: 18, t: 28, b: 58 };

    const xmin = xs[0], xmax = xs[xs.length - 1];
    const { ymin, ymax } = rangeFinite(ys);

    const xToPx = (x) => pad.l + (x - xmin) * (W - pad.l - pad.r) / (xmax - xmin);
    const yToPx = (y) => pad.t + (ymax - y) * (H - pad.t - pad.b) / (ymax - ymin);

    // Grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = grid;
    const gridLines = 10;
    for (let i = 0; i <= gridLines; i++) {
      const gx = pad.l + i * (W - pad.l - pad.r) / gridLines;
      ctx.beginPath(); ctx.moveTo(gx, pad.t); ctx.lineTo(gx, H - pad.b); ctx.stroke();
      const gy = pad.t + i * (H - pad.t - pad.b) / gridLines;
      ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(W - pad.r, gy); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1.6;
    if (xmin <= 0 && xmax >= 0) {
      const xz = xToPx(0);
      ctx.beginPath(); ctx.moveTo(xz, pad.t); ctx.lineTo(xz, H - pad.b); ctx.stroke();
    }
    if (ymin <= 0 && ymax >= 0) {
      const yz = yToPx(0);
      ctx.beginPath(); ctx.moveTo(pad.l, yz); ctx.lineTo(W - pad.r, yz); ctx.stroke();
    }

    // Title
    ctx.fillStyle = text;
    ctx.font = "14px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(`f(x) = ${expr}`, pad.l, 18);

    // Integral area fill
    if (showIntegral) {
      const left = Math.min(a, b);
      const right = Math.max(a, b);

      ctx.fillStyle = fill;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i];
        const y = ys[i];
        if (x < left || x > right || !Number.isFinite(y)) continue;
        const px = xToPx(x), py = yToPx(y);
        if (!started) { ctx.moveTo(px, yToPx(0)); ctx.lineTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      if (started) {
        // close to x-axis
        // find last x within bounds
        for (let i = xs.length - 1; i >= 0; i--) {
          const x = xs[i];
          if (x >= left && x <= right) { ctx.lineTo(xToPx(x), yToPx(0)); break; }
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // Curve
    ctx.strokeStyle = curve;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (!Number.isFinite(y)) { started = false; continue; }
      const px = xToPx(xs[i]);
      const py = yToPx(y);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Tangent
    if (showTangent && tanY && tanY.length === xs.length) {
      ctx.strokeStyle = tangentCol;
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      let st = false;
      for (let i = 0; i < xs.length; i++) {
        const y = tanY[i];
        if (!Number.isFinite(y)) { st = false; continue; }
        const px = xToPx(xs[i]);
        const py = yToPx(y);
        if (!st) { ctx.moveTo(px, py); st = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Point x0
    if (Number.isFinite(fx0)) {
      const px = xToPx(x0), py = yToPx(fx0);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill();
    }

    // Labels
    ctx.fillStyle = text;
    ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(`x ∈ [${xmin.toFixed(2)}, ${xmax.toFixed(2)}]`, pad.l, H - 28);
    ctx.fillText(`y ∈ [${ymin.toFixed(2)}, ${ymax.toFixed(2)}]`, pad.l, H - 10);
  }

  btnFxRun.addEventListener("click", () => {
    const expr = (fxExpr.value || "").trim();
    const xmin = Number(xminEl.value);
    const xmax = Number(xmaxEl.value);
    const n = Number(npointsEl.value);

    const x0 = Number(x0El.value);
    const a = Number(intaEl.value);
    const b = Number(intbEl.value);

    const showTangent = !!showTangentEl.checked;
    const showIntegral = !!showIntegralEl.checked;

    if (!expr) return setMsg(fxMsg, "Escribe una expresión para f(x).", "error");
    if (!Number.isFinite(xmin) || !Number.isFinite(xmax) || xmin >= xmax) {
      return setMsg(fxMsg, "Dominio inválido: xmin debe ser menor que xmax.", "error");
    }
    if (!Number.isFinite(n) || n < 80 || n > 3000) {
      return setMsg(fxMsg, "Puntos inválidos (usa 80 a 3000).", "error");
    }
    if (!Number.isFinite(x0) || !Number.isFinite(a) || !Number.isFinite(b)) {
      return setMsg(fxMsg, "x0 / a / b inválidos.", "error");
    }

    try {
      const fn = makeFn(expr);

      const xs = linspace(xmin, xmax, n);
      const ys = evalGrid(fn, xs);

      const fx0 = fn(x0);
      const dfx0 = derivativeCentral(fn, x0);
      const I = integralTrap(fn, a, b, 1600);

      outFx0.textContent = Number.isFinite(fx0) ? fx0.toFixed(6) : "NaN";
      outDfx0.textContent = Number.isFinite(dfx0) ? dfx0.toFixed(6) : "NaN";
      outInt.textContent = Number.isFinite(I) ? I.toFixed(6) : "NaN";

      // tangent line samples
      let tanY = null;
      if (showTangent && Number.isFinite(fx0) && Number.isFinite(dfx0)) {
        tanY = xs.map(x => fx0 + dfx0 * (x - x0));
      }

      const data = { expr, xmin, xmax, n, x0, a, b, xs, ys, fx0, dfx0, I, showTangent, showIntegral, tanY };
      window.__lastFx = data;

      drawPlot(data);
      fxMatlab.textContent = matlabForFunction(expr, xmin, xmax, n, x0, a, b);

      setMsg(fxMsg, "Análisis listo (f(x0), derivada e integral).", "ok");
      incCounter("ff_runs");
      toast("Funciones analizadas.");
    } catch (e) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fxMatlab.textContent = "";
      outFx0.textContent = "—";
      outDfx0.textContent = "—";
      outInt.textContent = "—";
      window.__lastFx = null;
      setMsg(fxMsg, "Error evaluando la función. Revisa la expresión.", "error");
    }
  });

  // toggles redraw
  showTangentEl.addEventListener("change", () => {
    if (!window.__lastFx) return;
    window.__lastFx.showTangent = !!showTangentEl.checked;
    // recompute tanY
    const d = window.__lastFx;
    d.tanY = (d.showTangent && Number.isFinite(d.fx0) && Number.isFinite(d.dfx0))
      ? d.xs.map(x => d.fx0 + d.dfx0 * (x - d.x0))
      : null;
    drawPlot(d);
  });
  showIntegralEl.addEventListener("change", () => {
    if (!window.__lastFx) return;
    window.__lastFx.showIntegral = !!showIntegralEl.checked;
    drawPlot(window.__lastFx);
  });

  /* ==========================================================
     4) QUIZ
     ========================================================== */
  const quizTag = $("#quizTag");
  const quizQ = $("#quizQ");
  const quizA = $("#quizA");
  const quizExp = $("#quizExp");
  const quizMsg = $("#quizMsg");
  const btnQuizNew = $("#btnQuizNew");
  const btnQuizReveal = $("#btnQuizReveal");
  const btnQuizCorrect = $("#btnQuizCorrect");
  const btnQuizWrong = $("#btnQuizWrong");
  const quizOk = $("#quizOk");
  const quizBad = $("#quizBad");
  const quizAcc = $("#quizAcc");

  function loadQuizStats() {
    const ok = Number(localStorage.getItem("ff_quiz_ok") || "0");
    const bad = Number(localStorage.getItem("ff_quiz_bad") || "0");
    const acc = (ok + bad) ? Math.round((ok/(ok+bad))*100) : 0;
    quizOk.textContent = String(ok);
    quizBad.textContent = String(bad);
    quizAcc.textContent = acc + "%";
    loadCounters();
  }
  loadQuizStats();

  const quizBank = [
    { tag:"Lógica", q:"¿Cuál es la forma equivalente de (A -> B)?", a:"(~A | B)", exp:"La implicación se transforma como: A→B ≡ ¬A ∨ B." },
    { tag:"Lógica", q:"¿Es tautología: (A & B) -> A ?", a:"Sí", exp:"Si A&B es verdadero, entonces A también lo es. Si A&B es falso, la implicación es verdadera." },
    { tag:"Conjuntos", q:"Si A={1,2,3} y B={3,4}, ¿A ∩ B?", a:"{3}", exp:"Intersección: elementos comunes." },
    { tag:"Conjuntos", q:"Si U={1,2,3,4} y A={1,4}, ¿Aᶜ?", a:"{2,3}", exp:"Complemento relativo: U\\A." },
    { tag:"Funciones", q:"Si f(x)=x^2, ¿f'(2)?", a:"4", exp:"Derivada: 2x → 4 en x=2." },
    { tag:"Funciones", q:"Si f(x)=sin(x), ¿integral de 0 a π?", a:"2", exp:"∫ sin(x) dx = -cos(x). Evaluando: -cos(π)+cos(0)=2." }
  ];

  let currentQuiz = null;
  let revealed = false;

  btnQuizNew.addEventListener("click", () => {
    currentQuiz = quizBank[Math.floor(Math.random() * quizBank.length)];
    quizTag.textContent = currentQuiz.tag;
    quizQ.textContent = currentQuiz.q;
    quizA.textContent = "—";
    quizExp.textContent = "—";
    setMsg(quizMsg, "Responde mentalmente y luego revela.", "ok");
    revealed = false;
    toast("Pregunta nueva.");
  });

  btnQuizReveal.addEventListener("click", () => {
    if (!currentQuiz) return toast("Primero crea una pregunta.");
    quizA.textContent = currentQuiz.a;
    quizExp.textContent = currentQuiz.exp;
    revealed = true;
    toast("Respuesta mostrada.");
  });

  function markQuiz(isCorrect) {
    if (!currentQuiz) return toast("Primero crea una pregunta.");
    if (!revealed) return toast("Primero revela la respuesta.");
    if (isCorrect) {
      localStorage.setItem("ff_quiz_ok", String(Number(localStorage.getItem("ff_quiz_ok") || "0") + 1));
      setMsg(quizMsg, "Marcada como correcta.", "ok");
    } else {
      localStorage.setItem("ff_quiz_bad", String(Number(localStorage.getItem("ff_quiz_bad") || "0") + 1));
      setMsg(quizMsg, "Marcada como incorrecta.", "error");
    }
    loadQuizStats();
    toast("Quiz actualizado.");
  }
  btnQuizCorrect.addEventListener("click", () => markQuiz(true));
  btnQuizWrong.addEventListener("click", () => markQuiz(false));

  /* ==========================================================
     5) ATAJOS
     ========================================================== */
  document.addEventListener("keydown", (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (!isCtrl) return;

    // Ctrl+Enter: ejecutar módulo activo
    if (e.key === "Enter") {
      e.preventDefault();
      if (window.__activeSection === "logica") {
        // if equivalence tab active, run eq; else tt
        const eqPanelActive = $("#logic-eq").classList.contains("active");
        (eqPanelActive ? $("#btnEqRun") : $("#btnLogicRun")).click();
      } else if (window.__activeSection === "conjuntos") {
        const uniActive = $("#sets-uni").classList.contains("active");
        (uniActive ? $("#btnUniRun") : $("#btnSetRun")).click();
      } else if (window.__activeSection === "funciones") {
        $("#btnFxRun").click();
      } else if (window.__activeSection === "quiz") {
        $("#btnQuizNew").click();
      }
    }

    // Ctrl+K: limpiar formulario activo
    if (e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (window.__activeSection === "logica") {
        const eqPanelActive = $("#logic-eq").classList.contains("active");
        (eqPanelActive ? $("#btnEqClear") : $("#btnLogicClear")).click();
      } else if (window.__activeSection === "conjuntos") {
        const uniActive = $("#sets-uni").classList.contains("active");
        (uniActive ? $("#btnUniClear") : $("#btnSetClear")).click();
      } else if (window.__activeSection === "funciones") {
        $("#btnFxClear").click();
      }
    }

    // Ctrl+D: guardar activo
    if (e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (window.__activeSection === "logica") {
        const eqPanelActive = $("#logic-eq").classList.contains("active");
        (eqPanelActive ? $("#btnEqSave") : $("#btnLogicSave")).click();
      } else if (window.__activeSection === "conjuntos") {
        const uniActive = $("#sets-uni").classList.contains("active");
        (uniActive ? $("#btnUniSave") : $("#btnSetSave")).click();
      } else if (window.__activeSection === "funciones") {
        $("#btnFxSave").click();
      }
    }
  });

})();

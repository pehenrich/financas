// Finanças do Casal: lançamentos do mês e caixinhas com meta, sincronizados pelo Supabase.
const CATEGORIAS = {
  saida: ["🏠 Moradia", "🛒 Mercado", "🍔 Comida fora", "🚗 Transporte", "💡 Contas", "💊 Saúde",
          "🎉 Lazer", "👕 Compras", "📚 Educação", "🐶 Pets", "🎁 Presentes", "📦 Outros"],
  entrada: ["💼 Salário", "💰 Extra", "↩️ Reembolso", "📦 Outros"],
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const real = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local
const lerValor = (t) => {
  // aceita "1.234,56", "1234,56" e "1234.56"
  t = String(t).trim().replace(/[^\d,.-]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return Math.round(parseFloat(t) * 100) / 100;
};

let db, usuario, membros = [], caixinhas = [], lancamentos = [];
let mes = new Date(); mes.setDate(1);

function mostrar(id) {
  ["tela-config", "tela-login", "tela-negado"].forEach((t) => ($("#" + t).hidden = t !== id));
  const dentro = id === "app";
  $("#app").hidden = !dentro;
  $("#abas").hidden = !dentro;
  $("#sair").hidden = !(dentro || id === "tela-negado");
}

function nomeDe(email) {
  const m = membros.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
  return m?.nome || String(email).split("@")[0];
}

// ---------- dados ----------
async function carregar() {
  const [m, c, l] = await Promise.all([
    db.from("membros").select("*"),
    db.from("caixinhas").select("*").order("criado_em"),
    db.from("lancamentos").select("*").order("data", { ascending: false }).order("criado_em", { ascending: false }),
  ]);
  for (const r of [m, c, l]) if (r.error) throw r.error;
  membros = m.data; caixinhas = c.data; lancamentos = l.data;
  if (!membros.length) { mostrar("tela-negado"); return false; }
  return true;
}

function guardadoEm(id) {
  return lancamentos.filter((l) => l.caixinha_id === id)
    .reduce((s, l) => s + (l.tipo === "deposito" ? 1 : -1) * Number(l.valor), 0);
}

const doMes = () => {
  const ini = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, "0")}`;
  return lancamentos.filter((l) => l.data.startsWith(ini));
};

// ---------- telas ----------
function desenharMes() {
  const nome = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  $$("#mes-nome, .mes-nome").forEach((e) => (e.textContent = nome[0].toUpperCase() + nome.slice(1)));
}

function barras(el, mapa, cor) {
  const itens = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...itens.map((i) => i[1]), 1);
  el.innerHTML = itens.length ? itens.map(([k, v]) => `
    <div class="barra"><div class="rotulo"><span>${esc(k)}</span><b>${real(v)}</b></div>
    <div class="trilho"><div style="width:${(v / max) * 100}%;background:${cor}"></div></div></div>`).join("")
    : `<p class="vazio">Nada lançado neste mês.</p>`;
}

function progressoCaixinha(c, completo) {
  const g = guardadoEm(c.id), meta = Number(c.meta) || 0;
  const p = meta ? Math.min(100, (g / meta) * 100) : 0;
  let extra = "";
  if (completo && meta > g) {
    extra = `Faltam ${real(meta - g)}`;
    if (c.prazo) {
      const [a, m] = c.prazo.split("-").map(Number);
      const agora = new Date();
      const meses = (a - agora.getFullYear()) * 12 + (m - 1 - agora.getMonth()) + 1;
      extra += meses > 0 ? ` · guardar ${real((meta - g) / meses)}/mês por ${meses} ${meses > 1 ? "meses" : "mês"}` : " · prazo vencido";
    }
  } else if (completo && meta && g >= meta) extra = "🎉 Meta batida!";
  return `<div class="caixinha">
    <div class="rotulo"><span>${esc(c.emoji)} ${esc(c.nome)}</span><b>${real(g)} <small>de ${real(meta)}</small></b></div>
    <div class="trilho"><div style="width:${p}%"></div></div>
    <div class="det"><span>${p.toFixed(0)}%</span><span>${extra}</span></div>
    ${completo ? `<div class="acoes"><button class="link" data-editar="${c.id}">Editar</button>
      <button class="link perigo" data-apagar-cx="${c.id}">Apagar</button></div>` : ""}
  </div>`;
}

function desenhar() {
  desenharMes();
  const ls = doMes();
  const soma = (t) => ls.filter((l) => l.tipo === t).reduce((s, l) => s + Number(l.valor), 0);
  const ent = soma("entrada"), sai = soma("saida"), guard = soma("deposito") - soma("retirada");
  $("#r-entradas").textContent = real(ent);
  $("#r-saidas").textContent = real(sai);
  $("#r-guardado").textContent = real(guard);
  $("#r-sobra").textContent = real(ent - sai - guard);
  $(".num.sobra").classList.toggle("negativo", ent - sai - guard < 0);

  const porCat = {}, porPessoa = {};
  ls.filter((l) => l.tipo === "saida").forEach((l) => {
    porCat[l.categoria || "📦 Outros"] = (porCat[l.categoria || "📦 Outros"] || 0) + Number(l.valor);
    porPessoa[nomeDe(l.quem)] = (porPessoa[nomeDe(l.quem)] || 0) + Number(l.valor);
  });
  barras($("#r-categorias"), porCat, "var(--saida)");
  barras($("#r-pessoas"), porPessoa, "var(--primaria)");

  const ativas = caixinhas.filter((c) => !c.arquivada);
  $("#r-caixinhas").innerHTML = ativas.length ? ativas.map((c) => progressoCaixinha(c, false)).join("")
    : `<p class="vazio">Crie a primeira caixinha na aba 🐷.</p>`;
  $("#lista-caixinhas").innerHTML = ativas.map((c) => `<div class="cartao">${progressoCaixinha(c, true)}</div>`).join("");

  const sel = $("#form-lanc [name=caixinha_id]");
  const atual = sel.value;
  sel.innerHTML = ativas.map((c) => `<option value="${c.id}">${esc(c.emoji)} ${esc(c.nome)}</option>`).join("");
  if (atual) sel.value = atual;

  const icone = { entrada: "💵", saida: "💸", deposito: "🐷", retirada: "↩️" };
  $("#lista-lanc").innerHTML = ls.length ? ls.map((l) => {
    const cx = caixinhas.find((c) => c.id === l.caixinha_id);
    const titulo = l.descricao || (cx ? `${cx.emoji} ${cx.nome}` : l.categoria) || "";
    const sub = [l.data.split("-").reverse().join("/"), cx ? `${cx.emoji} ${cx.nome}` : l.categoria, nomeDe(l.quem)]
      .filter(Boolean).map(esc).join(" · ");
    const sinal = l.tipo === "entrada" || l.tipo === "retirada" ? "+" : "−";
    return `<li><span class="ic">${icone[l.tipo]}</span>
      <div class="txt"><b>${esc(titulo)}</b><small>${sub}</small></div>
      <span class="val ${l.tipo}">${sinal} ${real(l.valor)}</span>
      <button class="icone apagar" data-apagar="${l.id}" aria-label="Apagar">🗑</button></li>`;
  }).join("") : `<li class="vazio">Nada lançado neste mês.</li>`;
}

function trocarTipo() {
  const tipo = $("#form-lanc [name=tipo]:checked").value;
  const cx = tipo === "deposito" || tipo === "retirada";
  $("#campo-categoria").hidden = cx;
  $("#campo-caixinha").hidden = !cx;
  if (!cx) $("#form-lanc [name=categoria]").innerHTML = CATEGORIAS[tipo].map((c) => `<option>${c}</option>`).join("");
}

function abrirAba(nome) {
  $$(".aba").forEach((a) => (a.hidden = a.id !== "aba-" + nome));
  $$("#abas button").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === nome));
  window.scrollTo(0, 0);
}

async function atualizar() {
  try { if (await carregar()) { mostrar("app"); desenhar(); } }
  catch (e) { alert("Erro ao carregar: " + e.message); }
}

// ---------- eventos ----------
function ligarEventos() {
  $$("#abas button").forEach((b) => b.addEventListener("click", () => abrirAba(b.dataset.aba)));
  $$("[data-mes]").forEach((b) => b.addEventListener("click", () => {
    mes.setMonth(mes.getMonth() + Number(b.dataset.mes)); desenhar();
  }));
  $$("#form-lanc [name=tipo]").forEach((r) => r.addEventListener("change", trocarTipo));

  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    $("#msg-login").textContent = "Entrando…";
    const { error } = await db.auth.signInWithPassword({ email: f.get("email"), password: f.get("senha") });
    $("#msg-login").textContent = error ? traduzir(error.message) : "";
  });
  $("#criar-conta").addEventListener("click", async () => {
    const f = new FormData($("#form-login"));
    if (!f.get("email") || String(f.get("senha")).length < 6) {
      $("#msg-login").textContent = "Preencha o e-mail e uma senha de pelo menos 6 caracteres."; return;
    }
    const { data, error } = await db.auth.signUp({ email: f.get("email"), password: f.get("senha"),
      options: { emailRedirectTo: location.href.split("#")[0] } });
    $("#msg-login").textContent = error ? traduzir(error.message)
      : data.session ? "" : "Conta criada! Confirme pelo link que chegou no seu e-mail e depois entre.";
  });
  $("#sair").addEventListener("click", () => db.auth.signOut());

  $("#form-lanc").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const tipo = f.get("tipo"), valor = lerValor(f.get("valor"));
    if (!(valor > 0)) { $("#msg-lanc").textContent = "Valor inválido."; return; }
    const cx = tipo === "deposito" || tipo === "retirada";
    if (cx && !f.get("caixinha_id")) { $("#msg-lanc").textContent = "Crie uma caixinha primeiro."; return; }
    const linha = { tipo, valor, data: f.get("data"), descricao: f.get("descricao") || null,
      categoria: cx ? null : f.get("categoria"), caixinha_id: cx ? f.get("caixinha_id") : null };
    const { error } = await db.from("lancamentos").insert(linha);
    if (error) { $("#msg-lanc").textContent = "Erro: " + error.message; return; }
    $("#msg-lanc").textContent = "✅ Salvo!";
    ev.target.valor.value = ""; ev.target.descricao.value = "";
    setTimeout(() => ($("#msg-lanc").textContent = ""), 2000);
    await atualizar();
  });

  $("#form-caixinha").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const meta = lerValor(f.get("meta"));
    if (!(meta >= 0)) { $("#msg-caixinha").textContent = "Meta inválida."; return; }
    const linha = { nome: f.get("nome"), emoji: f.get("emoji") || "💰", meta, prazo: f.get("prazo") || null };
    const id = f.get("cx_id");
    const { error } = id ? await db.from("caixinhas").update(linha).eq("id", id)
                         : await db.from("caixinhas").insert(linha);
    if (error) { $("#msg-caixinha").textContent = "Erro: " + error.message; return; }
    limparCaixinha();
    await atualizar();
  });
  $("#cancelar-caixinha").addEventListener("click", limparCaixinha);

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.apagar && confirm("Apagar este lançamento?")) {
      const { error } = await db.from("lancamentos").delete().eq("id", b.dataset.apagar);
      if (error) alert(error.message); else atualizar();
    }
    if (b.dataset.apagarCx) {
      const c = caixinhas.find((x) => x.id === b.dataset.apagarCx);
      if (confirm(`Apagar a caixinha "${c.nome}" e todos os depósitos dela?`)) {
        const { error } = await db.from("caixinhas").delete().eq("id", c.id);
        if (error) alert(error.message); else atualizar();
      }
    }
    if (b.dataset.editar) {
      const c = caixinhas.find((x) => x.id === b.dataset.editar), f = $("#form-caixinha");
      f.cx_id.value = c.id; f.emoji.value = c.emoji; f.nome.value = c.nome;
      f.meta.value = Number(c.meta).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
      f.prazo.value = c.prazo || "";
      $("#titulo-form-caixinha").textContent = "Editar caixinha";
      $("#cancelar-caixinha").hidden = false;
      f.scrollIntoView({ behavior: "smooth" });
    }
  });
}

function limparCaixinha() {
  const f = $("#form-caixinha");
  f.reset(); f.cx_id.value = "";
  $("#titulo-form-caixinha").textContent = "Nova caixinha";
  $("#cancelar-caixinha").hidden = true;
  $("#msg-caixinha").textContent = "";
}

function traduzir(m) {
  if (/Invalid login/i.test(m)) return "E-mail ou senha errados.";
  if (/Email not confirmed/i.test(m)) return "Confirme o e-mail pelo link que chegou na sua caixa de entrada.";
  if (/already registered/i.test(m)) return "Esse e-mail já tem conta. Use Entrar.";
  return m;
}

// ---------- início ----------
(function iniciar() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.CONFIG || {};
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { mostrar("tela-config"); return; }
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  ligarEventos();
  $("#form-lanc [name=data]").value = hoje();
  trocarTipo();
  let primeira = true;
  db.auth.onAuthStateChange((_ev, sessao) => {
    const novo = sessao?.user?.id;
    if (!primeira && novo === usuario?.id) return; // só renovou o token
    primeira = false;
    usuario = sessao?.user || null;
    setTimeout(() => (usuario ? atualizar() : mostrar("tela-login")), 0);
  });
  // o outro mexeu? atualiza ao voltar para o app
  document.addEventListener("visibilitychange", () => { if (!document.hidden && usuario) atualizar(); });
})();

// Finanças do Casal: lançamentos do mês e caixinhas com meta, sincronizados pelo Supabase.
const CATEGORIAS = {
  saida: ["🏠 Moradia", "🛒 Mercado", "🍔 Comida fora", "🚗 Transporte", "💡 Contas", "💊 Saúde",
          "🎉 Lazer", "👕 Compras", "📚 Educação", "🐶 Pets", "🎁 Presentes", "📦 Outros"],
  entrada: ["💼 Salário", "💰 Extra", "↩️ Reembolso", "📦 Outros"],
};
const ICONE = { entrada: "💵", saida: "💸", deposito: "🐷", retirada: "↩️" };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const real = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local
const lerValor = (t) => {
  // aceita "1.234,56", "1234,56" e "1234.56"
  t = String(t).trim().replace(/[^\d,.-]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); // "30.000" = trinta mil
  return Math.round(parseFloat(t) * 100) / 100;
};

let db, usuario, membros = [], caixinhas = [], lancamentos = [], fixas = [], semFixas = false;
let abaAtual = "resumo";
let filtroQuem = "";
let acabouDeEntrar = false; // tocou em "Entrar" agora (para o recadinho da Giovanna) // "" = os dois; senão o e-mail da pessoa
let recuperando = /type=recovery/.test(location.hash); // veio do link "esqueci minha senha"
const mes = new Date(); mes.setDate(1);

function mostrar(id) {
  ["tela-config", "tela-login", "tela-negado", "tela-senha"].forEach((t) => ($("#" + t).hidden = t !== id));
  const dentro = id === "app";
  $("#app").hidden = !dentro;
  $("#abas").hidden = !dentro;
  $("[data-sair]").hidden = !(dentro || id === "tela-negado");
  $("#mes").hidden = !(dentro && (abaAtual === "resumo" || abaAtual === "historico"));
  $("#filtro").hidden = $("#mes").hidden;
}

const mesmoEmail = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const classe = (email) => { const n = nomeDe(email); return /^p/i.test(n) ? "p" : /^g/i.test(n) ? "g" : ""; };

// Botões Todos/Pedro/Giovanna e as escolhas de "quem pagou" (montados a partir da tabela membros)
function desenharPessoas() {
  $("#filtro").innerHTML = [["", "Todos"], ...membros.map((m) => [m.email, m.nome || nomeDe(m.email)])].map(([email, nome]) =>
    `<button type="button" role="radio" aria-checked="${email === filtroQuem}" data-filtro="${esc(email)}"
      class="${email ? classe(email) : ""}${mesmoEmail(email, filtroQuem) ? " ativo" : ""}">${esc(nome)}</button>`).join("");
  for (const [alvo, nomeCampo] of [["#lanc-quem", "quem"], ["#fixa-quem", "quem"]]) {
    const el = $(alvo), marcado = el.querySelector("input:checked")?.value || usuario?.email;
    el.innerHTML = membros.map((m) => `<label><input type="radio" name="${nomeCampo}" value="${esc(m.email)}"
      ${mesmoEmail(m.email, marcado) ? "checked" : ""}><span class="${classe(m.email)}">${esc(m.nome || nomeDe(m.email))}</span></label>`).join("");
  }
}

const membro = (email) => membros.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
const nomeDe = (email) => membro(email)?.nome || String(email).split("@")[0];
function selo(email) {
  const n = nomeDe(email);
  const cls = /^p/i.test(n) ? "p" : /^g/i.test(n) ? "g" : "";
  return `<span class="quem ${cls}" title="${esc(n)}">${esc(n[0]?.toUpperCase() || "?")}</span>`;
}

// ---------- dados ----------
async function carregar() {
  const [m, c, l, f] = await Promise.all([
    db.from("membros").select("*"),
    db.from("caixinhas").select("*").order("criado_em"),
    db.from("lancamentos").select("*").order("data", { ascending: false }).order("criado_em", { ascending: false }),
    db.from("fixas").select("*").order("dia"),
  ]);
  for (const r of [m, c, l]) if (r.error) throw r.error;
  semFixas = !!f.error; // tabela ainda não criada (fixas.sql)
  membros = m.data; caixinhas = c.data; lancamentos = l.data; fixas = f.data || [];
  if (!membros.length) { mostrar("tela-negado"); return false; }
  return true;
}

// Lança as despesas fixas do mês atual que ainda não foram lançadas. O índice único (fixa_id, fixa_mes)
// impede lançamento duplicado se os dois abrirem o app ao mesmo tempo.
async function lancarFixas() {
  if (semFixas) return false;
  const agora = new Date(), mesAtual = hoje().slice(0, 7);
  const ultimo = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const faltam = fixas.filter((f) => f.ativa && !lancamentos.some((l) => l.fixa_id === f.id && l.fixa_mes === mesAtual));
  if (!faltam.length) return false;
  const linhas = faltam.map((f) => ({
    tipo: "saida", valor: f.valor, descricao: f.descricao, categoria: f.categoria, fixa_id: f.id, fixa_mes: mesAtual,
    quem: f.quem || usuario.email,
    data: `${mesAtual}-${String(Math.min(f.dia, ultimo)).padStart(2, "0")}`,
  }));
  const { error } = await db.from("lancamentos").upsert(linhas, { onConflict: "fixa_id,fixa_mes", ignoreDuplicates: true });
  if (error) console.warn("fixas:", error.message);
  return !error;
}

function desenharFixas() {
  $("#f-aviso").hidden = !semFixas;
  $("#f-aviso").textContent = semFixas ? "Falta criar a tabela das despesas fixas: rode o fixas.sql no Supabase." : "";
  const ativas = fixas.filter((f) => f.ativa);
  $("#f-total").textContent = real(ativas.reduce((s, f) => s + Number(f.valor), 0));
  const mesAtual = hoje().slice(0, 7);
  $("#lista-fixas").innerHTML = fixas.length ? `<div class="cartao">${fixas.map((f) => {
    const lancada = lancamentos.some((l) => l.fixa_id === f.id && l.fixa_mes === mesAtual);
    return `<div class="fixa">
      <div class="fx-dia"><small>dia</small><b>${f.dia}</b></div>
      <div class="fx-corpo"><b>${esc(f.descricao)}</b><small>${f.quem ? selo(f.quem) : ""}${esc(f.categoria)}${lancada ? " · ✓ lançada neste mês" : ""}</small></div>
      <div class="fx-direita"><b>${real(f.valor)}</b>
        <div class="acoes"><button class="link" data-editar-fx="${f.id}">Editar</button>
        <button class="link perigo" data-apagar-fx="${f.id}">Apagar</button></div></div>
    </div>`;
  }).join("")}</div>` : semFixas ? "" : `<div class="cartao"><p class="vazio">Cadastre aluguel, internet, academia…</p></div>`;
}

function guardadoEm(id) {
  return lancamentos.filter((l) => l.caixinha_id === id)
    .reduce((s, l) => s + (l.tipo === "deposito" ? 1 : -1) * Number(l.valor), 0);
}

const doMes = () => {
  const ini = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, "0")}`;
  return lancamentos.filter((l) => l.data.startsWith(ini) && (!filtroQuem || mesmoEmail(l.quem, filtroQuem)));
};

// ---------- telas ----------
function barras(el, mapa, cor) {
  const itens = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...itens.map((i) => i[1]), 1);
  el.innerHTML = itens.length ? itens.map(([k, v]) => `
    <div class="barra"><div class="rotulo"><span>${esc(k)}</span><b>${real(v)}</b></div>
    <div class="trilho"><div style="width:${(v / max) * 100}%;background:${cor}"></div></div></div>`).join("")
    : `<p class="vazio">Nenhum gasto neste mês.</p>`;
}

function cartaoCaixinha(c, completo) {
  const g = guardadoEm(c.id), meta = Number(c.meta) || 0;
  const p = meta ? Math.min(100, Math.max(0, (g / meta) * 100)) : 0;
  let dica = "", ok = false;
  if (!meta) dica = "Toque em Editar para definir a meta";
  else if (g >= meta) { dica = "🎉 Meta batida!"; ok = true; }
  else {
    dica = `Faltam ${real(meta - g)}`;
    if (c.prazo) {
      const [a, m] = c.prazo.split("-").map(Number);
      const agora = new Date();
      const meses = (a - agora.getFullYear()) * 12 + (m - 1 - agora.getMonth()) + 1;
      dica += meses > 0 ? ` · ${real((meta - g) / meses)}/mês por ${meses} ${meses > 1 ? "meses" : "mês"}` : " · prazo vencido";
    }
  }
  return `<div class="caixinha">
    <div class="cx-emoji">${esc(c.emoji)}</div>
    <div class="cx-corpo">
      <div class="cx-topo"><b>${esc(c.nome)}</b><span class="cx-pct">${meta ? p.toFixed(0) + "%" : ""}</span></div>
      <div class="cx-valores"><b>${real(g)}</b>${meta ? ` de ${real(meta)}` : " guardados"}</div>
      <div class="trilho"><div style="width:${p}%"></div></div>
      ${completo ? `<div class="cx-dica${ok ? " ok" : ""}">${dica}</div>
        <div class="acoes"><button class="link" data-editar="${c.id}">Editar</button>
        <button class="link perigo" data-apagar-cx="${c.id}">Apagar</button></div>` : ""}
    </div>
  </div>`;
}

function desenharHistorico(ls) {
  if (!ls.length) { $("#lista-lanc").innerHTML = `<div class="cartao"><p class="vazio">Nada lançado neste mês.</p></div>`; return; }
  const porDia = {};
  ls.forEach((l) => (porDia[l.data] ||= []).push(l));
  const hj = hoje();
  const ontem = new Date(Date.now() - 864e5).toLocaleDateString("sv-SE");
  $("#lista-lanc").innerHTML = Object.entries(porDia).sort((x, y) => y[0].localeCompare(x[0])).map(([dia, itens]) => {
    const titulo = dia === hj ? "Hoje" : dia === ontem ? "Ontem"
      : new Date(dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
    return `<div class="dia">${esc(titulo)}</div><div class="grupo">${itens.map((l) => {
      const cx = caixinhas.find((c) => c.id === l.caixinha_id);
      const cat = (l.categoria || "").replace(/^\S+\s/, "");
      const nome = l.descricao || (cx ? cx.nome : cat);
      const sub = cx ? (l.tipo === "deposito" ? "Guardado em " : "Tirado de ") + cx.nome : cat;
      const ic = cx ? cx.emoji : (l.categoria || ICONE[l.tipo]).split(" ")[0];
      const sinal = l.tipo === "entrada" || l.tipo === "retirada" ? "+" : "−";
      return `<div class="item"><span class="ic">${esc(ic)}</span>
        <div class="txt"><b>${esc(nome)}${l.fixa_mes ? '<span class="marca-fixa">📌 FIXA</span>' : ""}</b><small>${selo(l.quem)}${esc(sub)}</small></div>
        <span class="val ${l.tipo}">${sinal} ${real(l.valor)}</span>
        <button class="apagar" data-apagar="${l.id}" aria-label="Apagar">🗑</button></div>`;
    }).join("")}</div>`;
  }).join("");
}

function desenhar() {
  desenharPessoas();
  const nome = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  $("#mes-nome").textContent = nome[0].toUpperCase() + nome.slice(1);

  const ls = doMes();
  const soma = (t) => ls.filter((l) => l.tipo === t).reduce((s, l) => s + Number(l.valor), 0);
  const ent = soma("entrada"), sai = soma("saida"), guard = soma("deposito") - soma("retirada");
  $("#r-entradas").textContent = real(ent);
  $("#r-saidas").textContent = real(sai);
  $("#r-guardado").textContent = real(guard);
  $("#r-sobra").textContent = real(ent - sai - guard);
  $("#aba-resumo .destaque").classList.toggle("negativo", ent - sai - guard < 0);
  const fixosMes = ls.filter((l) => l.tipo === "saida" && l.fixa_mes).reduce((s, l) => s + Number(l.valor), 0);
  $("#r-fixos").textContent = real(fixosMes);
  $("#r-variaveis").textContent = real(sai - fixosMes);

  const porCat = {}, porPessoa = {};
  ls.filter((l) => l.tipo === "saida").forEach((l) => {
    const cat = l.categoria || "📦 Outros";
    porCat[cat] = (porCat[cat] || 0) + Number(l.valor);
    porPessoa[nomeDe(l.quem)] = (porPessoa[nomeDe(l.quem)] || 0) + Number(l.valor);
  });
  barras($("#r-categorias"), porCat, "var(--saida)");
  barras($("#r-pessoas"), porPessoa, "var(--primaria-2)");

  const ativas = caixinhas.filter((c) => !c.arquivada);
  $("#r-caixinhas").innerHTML = ativas.length ? ativas.map((c) => cartaoCaixinha(c, false)).join("")
    : `<p class="vazio">Crie a primeira caixinha na aba 🐷.</p>`;
  $("#lista-caixinhas").innerHTML = ativas.map((c) => `<div class="cartao">${cartaoCaixinha(c, true)}</div>`).join("");

  const sel = $("#form-lanc [name=caixinha_id]");
  const atual = sel.value;
  sel.innerHTML = ativas.map((c) => `<option value="${c.id}">${esc(c.emoji)} ${esc(c.nome)}</option>`).join("");
  if (atual) sel.value = atual;

  desenharHistorico(ls);
  desenharFixas();
}

function trocarTipo() {
  const tipo = $("#form-lanc [name=tipo]:checked").value;
  const cx = tipo === "deposito" || tipo === "retirada";
  $("#campo-categoria").hidden = cx;
  $("#campo-caixinha").hidden = !cx;
  if (!cx) $("#form-lanc [name=categoria]").innerHTML = CATEGORIAS[tipo].map((c) => `<option>${c}</option>`).join("");
}

function abrirAba(nome) {
  abaAtual = nome;
  $$(".aba").forEach((a) => (a.hidden = a.id !== "aba-" + nome));
  $$("#abas [data-aba]").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === nome));
  $("#mes").hidden = !(nome === "resumo" || nome === "historico");
  $("#filtro").hidden = $("#mes").hidden;
  window.scrollTo(0, 0);
}

async function atualizar() {
  try {
    if (!(await carregar())) return;
    if (await lancarFixas()) await carregar();
    mostrar("app"); desenhar();
    mostrarCarta();
  }
  catch (e) { alert("Erro ao carregar: " + e.message); }
}

// ---------- eventos ----------
function ligarEventos() {
  $$("#abas [data-aba]").forEach((b) => b.addEventListener("click", () => abrirAba(b.dataset.aba)));
  $("[data-sair]").addEventListener("click", () => { if (confirm("Sair da conta?")) db.auth.signOut(); });
  $("#form-fixa [name=categoria]").innerHTML = CATEGORIAS.saida.map((c) => `<option>${c}</option>`).join("");
  $("#nova-fixa").addEventListener("click", () => abrirFormFixa());
  $("#cancelar-fixa").addEventListener("click", fecharFormFixa);
  $("#form-fixa").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const valor = lerValor(f.get("valor")), dia = Number(f.get("dia"));
    if (!(valor > 0)) { $("#msg-fixa").textContent = "Valor inválido."; return; }
    if (!(dia >= 1 && dia <= 31)) { $("#msg-fixa").textContent = "Dia entre 1 e 31."; return; }
    const linha = { descricao: f.get("descricao"), valor, dia, categoria: f.get("categoria"), quem: f.get("quem") || usuario.email };
    const id = f.get("fx_id");
    const salvar = (l) => (id ? db.from("fixas").update(l).eq("id", id) : db.from("fixas").insert(l));
    let { error } = await salvar(linha);
    if (error && /quem/.test(error.message)) { // banco sem a coluna fixas.quem (pessoas.sql não rodado)
      delete linha.quem;
      ({ error } = await salvar(linha));
    }
    if (error) { $("#msg-fixa").textContent = "Erro: " + error.message; return; }
    if (id) { // o lançamento deste mês acompanha a mudança
      const agora = new Date(), mesAtual = hoje().slice(0, 7);
      const ultimo = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
      await db.from("lancamentos").update({ valor, descricao: linha.descricao, categoria: linha.categoria, ...(linha.quem ? { quem: linha.quem } : {}),
        data: `${mesAtual}-${String(Math.min(dia, ultimo)).padStart(2, "0")}` }).eq("fixa_id", id).eq("fixa_mes", mesAtual);
    }
    fecharFormFixa();
    await atualizar();
  });
  $$("[data-mes]").forEach((b) => b.addEventListener("click", () => {
    mes.setMonth(mes.getMonth() + Number(b.dataset.mes)); desenhar();
  }));
  $$("#form-lanc [name=tipo]").forEach((r) => r.addEventListener("change", trocarTipo));

  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    $("#msg-login").textContent = "Entrando…";
    acabouDeEntrar = true;
    const { error } = await db.auth.signInWithPassword({ email: f.get("email"), password: f.get("senha") });
    if (error) acabouDeEntrar = false;
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

  $("#fechar-carta").addEventListener("click", () => {
    $("#carta").hidden = true;
    try { localStorage.setItem("carta-vista", "1"); } catch (_) { /* tudo bem */ }
  });
  $("#esqueci").addEventListener("click", async () => {
    const email = $("#form-login").email.value.trim();
    if (!email) { $("#msg-login").textContent = "Digite seu e-mail acima e toque de novo em Esqueci minha senha."; return; }
    $("#msg-login").textContent = "Enviando…";
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0].split("?")[0] });
    $("#msg-login").textContent = error ? traduzir(error.message)
      : "Pronto! Abra o link que chegou no seu e-mail (veja também o spam) para criar a senha nova.";
  });
  $("#form-senha").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    if (f.get("senha") !== f.get("senha2")) { $("#msg-senha").textContent = "As senhas não são iguais."; return; }
    const { error } = await db.auth.updateUser({ password: f.get("senha") });
    if (error) { $("#msg-senha").textContent = traduzir(error.message); return; }
    recuperando = false;
    ev.target.reset();
    history.replaceState(null, "", location.pathname);
    atualizar();
  });

  $("#form-lanc").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const tipo = f.get("tipo"), valor = lerValor(f.get("valor"));
    if (!(valor > 0)) { $("#msg-lanc").textContent = "Valor inválido."; return; }
    const cx = tipo === "deposito" || tipo === "retirada";
    if (cx && !f.get("caixinha_id")) { $("#msg-lanc").textContent = "Crie uma caixinha primeiro."; return; }
    const linha = { tipo, valor, data: f.get("data"), descricao: f.get("descricao") || null, quem: f.get("quem") || usuario.email,
      categoria: cx ? null : f.get("categoria"), caixinha_id: cx ? f.get("caixinha_id") : null };
    const { error } = await db.from("lancamentos").insert(linha);
    if (error) { $("#msg-lanc").textContent = "Erro: " + error.message; return; }
    $("#msg-lanc").textContent = "✅ Salvo!";
    ev.target.valor.value = ""; ev.target.descricao.value = "";
    setTimeout(() => ($("#msg-lanc").textContent = ""), 2000);
    await atualizar();
  });

  $("#nova-caixinha").addEventListener("click", () => abrirFormCaixinha());
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
    fecharFormCaixinha();
    await atualizar();
  });
  $("#cancelar-caixinha").addEventListener("click", fecharFormCaixinha);

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.filtro !== undefined) { filtroQuem = b.dataset.filtro; desenhar(); return; }
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
    if (b.dataset.editar) abrirFormCaixinha(caixinhas.find((x) => x.id === b.dataset.editar));
    if (b.dataset.editarFx) abrirFormFixa(fixas.find((x) => x.id === b.dataset.editarFx));
    if (b.dataset.apagarFx) {
      const f = fixas.find((x) => x.id === b.dataset.apagarFx);
      if (confirm(`Apagar a despesa fixa "${f.descricao}"? Os meses já lançados continuam no histórico.`)) {
        const { error } = await db.from("fixas").delete().eq("id", f.id);
        if (error) alert(error.message); else atualizar();
      }
    }
  });
}

function abrirFormCaixinha(c) {
  const f = $("#form-caixinha");
  f.reset(); f.cx_id.value = "";
  if (c) {
    f.cx_id.value = c.id; f.emoji.value = c.emoji; f.nome.value = c.nome;
    f.meta.value = Number(c.meta) ? Number(c.meta).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
    f.prazo.value = c.prazo || "";
  }
  $("#titulo-form-caixinha").textContent = c ? "Editar caixinha" : "Nova caixinha";
  $("#msg-caixinha").textContent = "";
  f.hidden = false;
  $("#nova-caixinha").hidden = true;
  f.scrollIntoView({ behavior: "smooth", block: "start" });
}

function abrirFormFixa(x) {
  const f = $("#form-fixa");
  f.reset(); f.fx_id.value = ""; f.categoria.value = "💡 Contas";
  const q = x?.quem || usuario?.email;
  $$("#fixa-quem input").forEach((i) => (i.checked = mesmoEmail(i.value, q)));
  if (x) {
    f.fx_id.value = x.id; f.descricao.value = x.descricao; f.dia.value = x.dia; f.categoria.value = x.categoria;
    f.valor.value = Number(x.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }
  $("#titulo-form-fixa").textContent = x ? "Editar despesa fixa" : "Nova despesa fixa";
  $("#msg-fixa").textContent = "";
  f.hidden = false;
  $("#nova-fixa").hidden = true;
  f.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fecharFormFixa() {
  $("#form-fixa").hidden = true;
  $("#nova-fixa").hidden = false;
}

function fecharFormCaixinha() {
  $("#form-caixinha").hidden = true;
  $("#nova-caixinha").hidden = false;
}

// Recadinho do Pedro: aparece para a Giovanna quando ela entra (e na primeira vez em cada aparelho).
function mostrarCarta() {
  if (!/^giovanna$/i.test(membro(usuario?.email)?.nome || "")) return;
  let jaViu = false;
  try { jaViu = localStorage.getItem("carta-vista") === "1"; } catch (_) { /* navegador sem armazenamento */ }
  if (!acabouDeEntrar && jaViu) return;
  acabouDeEntrar = false;
  $("#carta").hidden = false;
  $("#fechar-carta").focus();
}

function traduzir(m) {
  if (/Invalid login/i.test(m)) return "E-mail ou senha errados.";
  if (/Email not confirmed/i.test(m)) return "Confirme o e-mail pelo link que chegou na sua caixa de entrada.";
  if (/already registered/i.test(m)) return "Esse e-mail já tem conta. Use Entrar.";
  if (/rate limit|security purposes/i.test(m)) return "Muitos pedidos seguidos. Espere alguns minutos e tente de novo.";
  if (/different from the old/i.test(m)) return "A senha nova precisa ser diferente da antiga.";
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
  db.auth.onAuthStateChange((ev, sessao) => {
    if (ev === "PASSWORD_RECOVERY") recuperando = true;
    if (recuperando && sessao) { usuario = sessao.user; primeira = false; setTimeout(() => mostrar("tela-senha"), 0); return; }
    const novo = sessao?.user?.id;
    if (!primeira && novo === usuario?.id) return; // só renovou o token
    primeira = false;
    usuario = sessao?.user || null;
    // o Supabase pede para não chamar a API dentro deste callback
    setTimeout(() => (usuario ? atualizar() : mostrar("tela-login")), 0);
  });
  // o outro mexeu? atualiza ao voltar para o app
  document.addEventListener("visibilitychange", () => { if (!document.hidden && usuario && !recuperando) atualizar(); });
})();

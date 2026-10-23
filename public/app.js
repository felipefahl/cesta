import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { planejarAdicao, planejarNovaCompra } from "./logica.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, texto) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
};

// Service worker (só funciona em https ou localhost).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

const configurado = !String(firebaseConfig.apiKey || "").startsWith("COLE");
if (!configurado) {
  $("carregando").hidden = true;
  $("tela-login").hidden = false;
  $("aviso-config").hidden = false;
  $("entrar").disabled = true;
} else {
  iniciar();
}

function iniciar() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Cache offline: a lista abre e pode ser editada sem sinal; sincroniza quando voltar.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  let lista = [];
  let recorrentes = [];
  let carregouLista = false;
  let carregouRec = false;
  let cancelar = [];
  let aba = "lista";
  let confirmandoExcluir = null;
  let avisoTimer = null;

  // ---------- util ----------
  function aviso(msg) {
    const e = $("aviso");
    e.textContent = msg;
    e.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => (e.hidden = true), 4500);
  }

  function erro(e) {
    console.error(e);
    if (e && e.code === "permission-denied") {
      aviso("Sem permissão. Confira se o UID desta conta está nas regras do Firestore.");
    } else {
      aviso("Não deu para salvar agora. Tente de novo.");
    }
  }

  const modeloValido = (id) => !!id && recorrentes.some((r) => r.id === id);
  const ordenar = (a, b) => a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" });
  const novoItemLista = (dados) => ({
    nome: dados.nome,
    qtd: dados.qtd || "",
    comprado: false,
    recorrenteId: dados.recorrenteId || null,
    criadoEm: serverTimestamp(),
  });

  // ---------- login ----------
  $("form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("erro-login");
    msg.hidden = true;
    $("entrar").disabled = true;
    try {
      await signInWithEmailAndPassword(auth, $("email").value.trim(), $("senha").value);
    } catch (e) {
      const codigo = e && e.code;
      msg.textContent =
        codigo === "auth/invalid-credential" || codigo === "auth/wrong-password" || codigo === "auth/user-not-found"
          ? "E-mail ou senha incorretos."
          : codigo === "auth/too-many-requests"
          ? "Muitas tentativas. Espere alguns minutos e tente de novo."
          : codigo === "auth/network-request-failed"
          ? "Sem conexão. Tente de novo quando o sinal voltar."
          : "Não foi possível entrar agora.";
      msg.hidden = false;
    } finally {
      $("entrar").disabled = false;
    }
  });

  $("sair").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    $("carregando").hidden = true;
    cancelar.forEach((f) => f());
    cancelar = [];
    lista = [];
    recorrentes = [];
    carregouLista = false;
    carregouRec = false;

    if (!user) {
      $("tela-app").hidden = true;
      $("tela-login").hidden = false;
      $("senha").value = "";
      return;
    }

    $("tela-login").hidden = true;
    $("tela-app").hidden = false;
    render();

    const falha = (e) => {
      console.error(e);
      aviso(
        e && e.code === "permission-denied"
          ? "Esta conta não tem permissão para ver a lista."
          : "A lista deixou de sincronizar. Recarregue a página."
      );
    };

    cancelar.push(
      onSnapshot(
        collection(db, "lista"),
        (snap) => {
          lista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.nome);
          carregouLista = true;
          render();
        },
        falha
      ),
      onSnapshot(
        collection(db, "recorrentes"),
        (snap) => {
          recorrentes = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.nome);
          carregouRec = true;
          render();
        },
        falha
      )
    );
  });

  // ---------- adicionar ----------
  $("form-add").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nome = $("nome").value.trim();
    if (!nome) return;
    const qtd = $("qtd").value.trim();
    const recorrente = $("tipo-rec").checked;

    const { existente, modeloId, criarModelo } = planejarAdicao({ nome, recorrente }, lista, recorrentes);
    const batch = writeBatch(db);
    let vinculo = modeloId;

    if (criarModelo) {
      const ref = doc(collection(db, "recorrentes"));
      vinculo = ref.id;
      batch.set(ref, { nome, qtd, criadoEm: serverTimestamp() });
    }

    if (existente) {
      const mudancas = { comprado: false };
      if (qtd) mudancas.qtd = qtd;
      if (vinculo) mudancas.recorrenteId = vinculo;
      batch.update(doc(db, "lista", existente.id), mudancas);
      aviso(existente.comprado ? `“${existente.nome}” voltou para a lista.` : `“${existente.nome}” já estava na lista.`);
    } else {
      batch.set(doc(collection(db, "lista")), novoItemLista({ nome, qtd, recorrenteId: vinculo }));
    }

    batch.commit().catch(erro);
    $("nome").value = "";
    $("qtd").value = "";
    $("nome").focus();
  });

  // ---------- ações sobre itens ----------
  function alternarRecorrente(it) {
    const batch = writeBatch(db);
    if (modeloValido(it.recorrenteId)) {
      const modeloId = it.recorrenteId;
      batch.delete(doc(db, "recorrentes", modeloId));
      lista
        .filter((x) => x.recorrenteId === modeloId)
        .forEach((x) => batch.update(doc(db, "lista", x.id), { recorrenteId: null }));
      aviso(`“${it.nome}” agora é avulso e não volta na próxima compra.`);
    } else {
      const ref = doc(collection(db, "recorrentes"));
      batch.set(ref, { nome: it.nome, qtd: it.qtd || "", criadoEm: serverTimestamp() });
      batch.update(doc(db, "lista", it.id), { recorrenteId: ref.id });
      aviso(`“${it.nome}” agora volta a cada nova compra.`);
    }
    batch.commit().catch(erro);
  }

  function removerDaLista(it) {
    deleteDoc(doc(db, "lista", it.id)).catch(erro);
    if (modeloValido(it.recorrenteId)) {
      aviso(`“${it.nome}” saiu só desta compra. Continua nos recorrentes.`);
    }
  }

  function colocarNaLista(modelo) {
    const batch = writeBatch(db);
    batch.set(
      doc(collection(db, "lista")),
      novoItemLista({ nome: modelo.nome, qtd: modelo.qtd, recorrenteId: modelo.id })
    );
    batch.commit().catch(erro);
  }

  function excluirModelo(modelo) {
    const batch = writeBatch(db);
    batch.delete(doc(db, "recorrentes", modelo.id));
    lista
      .filter((x) => x.recorrenteId === modelo.id)
      .forEach((x) => batch.update(doc(db, "lista", x.id), { recorrenteId: null }));
    batch.commit().catch(erro);
    confirmandoExcluir = null;
    aviso(`“${modelo.nome}” saiu dos recorrentes.`);
  }

  // ---------- abas ----------
  function mudarAba(nova) {
    aba = nova;
    $("aba-lista").setAttribute("aria-selected", String(nova === "lista"));
    $("aba-rec").setAttribute("aria-selected", String(nova === "rec"));
    $("painel-lista").hidden = nova !== "lista";
    $("painel-rec").hidden = nova !== "rec";
  }
  $("aba-lista").addEventListener("click", () => mudarAba("lista"));
  $("aba-rec").addEventListener("click", () => mudarAba("rec"));

  // ---------- nova compra ----------
  function atualizarResumoNovaCompra() {
    const plano = planejarNovaCompra(lista, recorrentes, $("nc-manter").checked);
    const voltam = plano.desmarcar.length + plano.criar.length;
    const partes = [];
    partes.push(voltam === 0 ? "Nenhum recorrente precisa voltar" : voltam === 1 ? "1 recorrente volta para a lista" : `${voltam} recorrentes voltam para a lista`);
    if (plano.avulsosComprados > 0) {
      partes.push(plano.avulsosComprados === 1 ? "1 avulso comprado sai" : `${plano.avulsosComprados} avulsos comprados saem`);
    }
    if (plano.avulsosPendentes > 0) {
      partes.push(
        $("nc-manter").checked
          ? plano.avulsosPendentes === 1 ? "1 avulso pendente fica" : `${plano.avulsosPendentes} avulsos pendentes ficam`
          : plano.avulsosPendentes === 1 ? "1 avulso pendente sai" : `${plano.avulsosPendentes} avulsos pendentes saem`
      );
    }
    $("nc-resumo").textContent = partes.join(". ") + ".";
  }

  $("nova-compra").addEventListener("click", () => {
    atualizarResumoNovaCompra();
    $("nc-box").hidden = false;
    $("nova-compra").hidden = true;
    $("nc-confirmar").focus();
  });
  $("nc-manter").addEventListener("change", atualizarResumoNovaCompra);
  $("nc-cancelar").addEventListener("click", () => {
    $("nc-box").hidden = true;
    $("nova-compra").hidden = false;
    $("nova-compra").focus();
  });
  $("nc-confirmar").addEventListener("click", () => {
    const plano = planejarNovaCompra(lista, recorrentes, $("nc-manter").checked);
    const batch = writeBatch(db);
    plano.desmarcar.forEach((id) => batch.update(doc(db, "lista", id), { comprado: false }));
    plano.apagar.forEach((id) => batch.delete(doc(db, "lista", id)));
    plano.criar.forEach((r) =>
      batch.set(doc(collection(db, "lista")), novoItemLista({ nome: r.nome, qtd: r.qtd, recorrenteId: r.id }))
    );
    batch.commit().catch(erro);
    $("nc-box").hidden = true;
    $("nova-compra").hidden = false;
    aviso("Nova compra pronta. Os recorrentes estão na lista.");
  });

  // ---------- render ----------
  function linhaLista(it) {
    const recorrente = modeloValido(it.recorrenteId);
    const li = el("li", "item" + (it.comprado ? " feito" : ""));

    const label = el("label");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.id = "chk-" + it.id;
    chk.checked = !!it.comprado;
    chk.addEventListener("change", () => {
      updateDoc(doc(db, "lista", it.id), { comprado: chk.checked }).catch(erro);
    });
    label.append(chk, el("span", "nome", it.nome));
    if (it.qtd) label.append(el("span", "qtd", it.qtd));
    li.append(label);

    const tag = el("button", "tag", recorrente ? "Recorrente" : "Avulso");
    tag.type = "button";
    tag.setAttribute("aria-pressed", String(recorrente));
    tag.title = recorrente ? "Tocar para deixar de repetir" : "Tocar para repetir a cada nova compra";
    tag.addEventListener("click", () => alternarRecorrente(it));
    li.append(tag);

    const del = el("button", "del", "×");
    del.type = "button";
    del.setAttribute("aria-label", "Tirar " + it.nome + " desta compra");
    del.addEventListener("click", () => removerDaLista(it));
    li.append(del);
    return li;
  }

  function linhaModelo(r) {
    const naLista = lista.some((i) => i.recorrenteId === r.id);
    const li = el("li", "item");
    const rotulo = el("div", "rotulo");
    rotulo.append(el("span", "nome", r.nome));
    if (r.qtd) rotulo.append(el("span", "qtd", r.qtd));
    li.append(rotulo);

    if (naLista) {
      li.append(el("span", "qtd", "na lista"));
    } else {
      const add = el("button", "tag", "Pôr na lista");
      add.type = "button";
      add.addEventListener("click", () => colocarNaLista(r));
      li.append(add);
    }

    const confirmando = confirmandoExcluir === r.id;
    const del = el("button", "del" + (confirmando ? " confirmar" : ""), confirmando ? "Excluir?" : "×");
    del.type = "button";
    del.setAttribute("aria-label", "Excluir " + r.nome + " dos recorrentes");
    del.addEventListener("click", () => {
      if (confirmandoExcluir === r.id) {
        excluirModelo(r);
        return;
      }
      confirmandoExcluir = r.id;
      render();
      setTimeout(() => {
        if (confirmandoExcluir === r.id) {
          confirmandoExcluir = null;
          render();
        }
      }, 3500);
    });
    li.append(del);
    return li;
  }

  function vazio(texto) {
    return el("li", "vazio", texto);
  }

  function render() {
    if ($("tela-app").hidden) return;
    const pronto = carregouLista && carregouRec;

    // resumo
    const pendentes = lista.filter((i) => !i.comprado).length;
    $("resumo").textContent = !pronto
      ? "Carregando a lista…"
      : lista.length === 0
      ? "Lista vazia"
      : `${pendentes} para comprar · ${recorrentes.length} recorrentes`;

    $("nova-compra").disabled = !pronto || (lista.length === 0 && recorrentes.length === 0);

    // lista
    const ordenados = lista.slice().sort(ordenar);
    const comprar = ordenados.filter((i) => !i.comprado);
    const carrinho = ordenados.filter((i) => i.comprado);

    const ulC = $("lista-comprar");
    ulC.replaceChildren();
    if (!pronto) {
      ulC.append(vazio("Buscando os itens…"));
    } else if (lista.length === 0) {
      ulC.append(
        vazio("Nada por aqui ainda. Adicione o primeiro item e use “Recorrente” para o que vocês compram sempre.")
      );
    } else if (comprar.length === 0) {
      ulC.append(vazio("Tudo no carrinho. Boa compra!"));
    } else {
      comprar.forEach((it) => ulC.append(linhaLista(it)));
    }

    const ulK = $("lista-carrinho");
    ulK.replaceChildren();
    carrinho.forEach((it) => ulK.append(linhaLista(it)));
    $("faixa-carrinho").hidden = carrinho.length === 0;

    // recorrentes
    const ulR = $("lista-rec");
    ulR.replaceChildren();
    if (!pronto) {
      ulR.append(vazio("Buscando os itens…"));
    } else if (recorrentes.length === 0) {
      ulR.append(vazio("Nenhum recorrente ainda. Adicione um item como “Recorrente” e ele aparece aqui."));
    } else {
      recorrentes.slice().sort(ordenar).forEach((r) => ulR.append(linhaModelo(r)));
    }

    if (!$("nc-box").hidden) atualizarResumoNovaCompra();
  }

  // ---------- conexão ----------
  function atualizarConexao() {
    $("offline").hidden = navigator.onLine;
  }
  window.addEventListener("online", atualizarConexao);
  window.addEventListener("offline", atualizarConexao);
  atualizarConexao();
  mudarAba("lista");
}

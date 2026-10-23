// Regras de negócio da Cesta, sem dependências, para poder testar no Node.
//
// Modelo de dados (Firestore, duas coleções):
//   recorrentes/{id}  -> { nome, qtd }                       itens que voltam a cada nova compra
//   lista/{id}        -> { nome, qtd, comprado, recorrenteId } a compra em andamento
// Um item da lista aponta para o seu modelo por `recorrenteId` (ou null, se for avulso).

/** Normaliza para comparar nomes: sem acento, minúsculas, espaços únicos. */
export function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Decide o que fazer ao adicionar um item.
 * - existente: item da lista com o mesmo nome (se houver)
 * - modeloId: modelo recorrente já ligado a esse nome (se houver)
 * - criarModelo: true quando o item é recorrente e ainda não tem modelo
 */
export function planejarAdicao({ nome, recorrente }, lista, recorrentes) {
  const n = norm(nome);
  const idValido = (id) => !!id && recorrentes.some((r) => r.id === id);
  const existente = lista.find((i) => norm(i.nome) === n) || null;
  const modelo = recorrentes.find((r) => norm(r.nome) === n) || null;
  const modeloId = [existente && existente.recorrenteId, modelo && modelo.id].find(idValido) || null;
  return { existente, modeloId, criarModelo: !!recorrente && !modeloId };
}

/**
 * Nova compra: os recorrentes voltam desmarcados, os avulsos comprados saem,
 * e os avulsos ainda não comprados ficam ou saem conforme `manterAvulsos`.
 */
export function planejarNovaCompra(lista, recorrentes, manterAvulsos) {
  const modeloIds = new Set(recorrentes.map((r) => r.id));
  const vistos = new Set();
  const desmarcar = [];
  const apagar = [];
  let avulsosComprados = 0;
  let avulsosPendentes = 0;

  for (const it of lista) {
    if (it.recorrenteId && modeloIds.has(it.recorrenteId)) {
      if (vistos.has(it.recorrenteId)) {
        apagar.push(it.id); // duplicata do mesmo recorrente
        continue;
      }
      vistos.add(it.recorrenteId);
      if (it.comprado) desmarcar.push(it.id);
    } else if (it.comprado) {
      apagar.push(it.id);
      avulsosComprados++;
    } else {
      avulsosPendentes++;
      if (!manterAvulsos) apagar.push(it.id);
    }
  }

  const criar = recorrentes.filter((r) => !vistos.has(r.id));
  return { desmarcar, apagar, criar, avulsosComprados, avulsosPendentes };
}

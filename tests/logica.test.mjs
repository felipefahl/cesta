// Rode com: node tests/logica.test.mjs
import assert from "node:assert/strict";
import { norm, planejarAdicao, planejarNovaCompra } from "../public/logica.js";

// norm ignora acento, caixa e espaços
assert.equal(norm("  Pão   de Forma "), "pao de forma");
assert.equal(norm(null), "");

const rec = [
  { id: "r1", nome: "Arroz", qtd: "2" },
  { id: "r2", nome: "Café" },
];

// --- planejarAdicao ---
{
  // item novo e recorrente, sem modelo: cria o modelo
  const p = planejarAdicao({ nome: "Detergente", recorrente: true }, [], rec);
  assert.equal(p.existente, null);
  assert.equal(p.modeloId, null);
  assert.equal(p.criarModelo, true);
}
{
  // mesmo nome de um modelo existente (com outro acento/caixa): reaproveita o modelo
  const p = planejarAdicao({ nome: "cafe", recorrente: true }, [], rec);
  assert.equal(p.modeloId, "r2");
  assert.equal(p.criarModelo, false);
}
{
  // avulso novo: não cria modelo
  const p = planejarAdicao({ nome: "Pilhas", recorrente: false }, [], rec);
  assert.equal(p.criarModelo, false);
}
{
  // já está na lista: devolve o existente
  const lista = [{ id: "a", nome: "Arroz", comprado: true, recorrenteId: "r1" }];
  const p = planejarAdicao({ nome: "ARROZ", recorrente: false }, lista, rec);
  assert.equal(p.existente.id, "a");
  assert.equal(p.modeloId, "r1");
}
{
  // vínculo órfão (modelo apagado) é ignorado e, se pedir recorrente, recria o modelo
  const lista = [{ id: "a", nome: "Sal", comprado: false, recorrenteId: "apagado" }];
  const p = planejarAdicao({ nome: "Sal", recorrente: true }, lista, rec);
  assert.equal(p.modeloId, null);
  assert.equal(p.criarModelo, true);
}

// --- planejarNovaCompra ---
{
  const lista = [
    { id: "a", nome: "Arroz", comprado: true, recorrenteId: "r1" }, // recorrente comprado: desmarca
    { id: "b", nome: "Pilhas", comprado: true, recorrenteId: null }, // avulso comprado: sai
    { id: "c", nome: "Vela", comprado: false, recorrenteId: null }, // avulso pendente: fica
    { id: "d", nome: "Órfão", comprado: true, recorrenteId: "apagado" }, // vira avulso comprado: sai
  ];
  const p = planejarNovaCompra(lista, rec, true);
  assert.deepEqual(p.desmarcar, ["a"]);
  assert.deepEqual(p.apagar.sort(), ["b", "d"]);
  assert.deepEqual(p.criar.map((r) => r.id), ["r2"]); // Café não estava na lista: volta
  assert.equal(p.avulsosComprados, 2);
  assert.equal(p.avulsosPendentes, 1);

  const q = planejarNovaCompra(lista, rec, false);
  assert.deepEqual(q.apagar.sort(), ["b", "c", "d"]); // sem manter, o pendente também sai
}
{
  // recorrente ainda pendente continua como está (não precisa desmarcar nem recriar)
  const lista = [{ id: "a", nome: "Arroz", comprado: false, recorrenteId: "r1" }];
  const p = planejarNovaCompra(lista, rec, true);
  assert.deepEqual(p.desmarcar, []);
  assert.deepEqual(p.criar.map((r) => r.id), ["r2"]);
}
{
  // duplicata do mesmo recorrente: mantém uma e apaga a outra
  const lista = [
    { id: "a", nome: "Arroz", comprado: false, recorrenteId: "r1" },
    { id: "b", nome: "Arroz", comprado: false, recorrenteId: "r1" },
  ];
  const p = planejarNovaCompra(lista, rec, true);
  assert.deepEqual(p.apagar, ["b"]);
}
{
  // lista vazia: todos os recorrentes entram
  const p = planejarNovaCompra([], rec, true);
  assert.equal(p.criar.length, 2);
  assert.equal(p.apagar.length, 0);
}

console.log("ok: lógica da Cesta");

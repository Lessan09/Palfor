// node app/logica.test.mjs
import assert from 'node:assert/strict';
import { agrupar, completarPedidos, cuentaPaquete, impactoBorrado, mesDe, movimientosIniciales, nombresRepetidos, normalizar, resumenInventario, total, ventas } from './logica.js';

const plantas = [
  { id: 1, nombre: 'Nochebuena roja', existencias: 6, costo: 10, precio: 25, paquetes: [1] },
  { id: 2, nombre: 'Nochebuena blanca', existencias: 0, costo: 12, precio: 30, paquetes: [1, 2] },
  { id: 3, nombre: 'Rosal', existencias: 4, costo: 20, precio: 50, archivada: true }
];

// Migración: historial inicial y pedidos viejos sin precio
const ini = movimientosIniciales(plantas, 'X');
assert.deepEqual(ini.map((m) => [m.plantaId, m.cantidad, m.tipo]), [[1, 6, 'inicial'], [3, 4, 'inicial']]);
const viejos = completarPedidos([
  { id: 1, estado: 'entregado', fecha: '2026-11-05T10:00:00Z', lineas: [{ plantaId: 1, planta: 'x', cantidad: 2 }] },
  { id: 2, estado: 'pendiente', fecha: '2026-11-06T10:00:00Z', lineas: [{ plantaId: 2, planta: 'y', cantidad: 1, precio: 28, costo: 11 }] },
  { id: 3, estado: 'entregado', fecha: '2026-11-07T10:00:00Z', lineas: [{ plantaId: 99, planta: 'z', cantidad: 1 }] }
], plantas);
assert.deepEqual([viejos[0].lineas[0].precio, viejos[0].lineas[0].costo, viejos[0].lineas[0].estimado], [25, 10, true]);
assert.equal(viejos[0].fechaEntrega, '2026-11-05T10:00:00Z');
assert.equal(viejos[1].lineas[0].precio, 28);              // no pisa un precio real
assert.equal(viejos[1].fechaEntrega, undefined);
assert.equal(viejos[2].lineas[0].precio, 0);               // planta que ya no existe: no truena

// Ventas: solo entregados
const pedidos = [
  { id: 1, estado: 'entregado', fecha: '2026-12-02T12:00:00', fechaEntrega: '2026-12-10T12:00:00', lineas: [{ plantaId: 1, planta: 'Nochebuena roja', cantidad: 3, precio: 25, costo: 10 }, { plantaId: 2, planta: 'Nochebuena blanca', cantidad: 2, precio: 30, costo: 12 }] },
  { id: 2, estado: 'pendiente', fecha: '2026-12-03T12:00:00', lineas: [{ plantaId: 1, planta: 'Nochebuena roja', cantidad: 9, precio: 25, costo: 10 }] },
  { id: 3, estado: 'cancelado', fecha: '2026-12-03T12:00:00', lineas: [{ plantaId: 1, planta: 'Nochebuena roja', cantidad: 9, precio: 25, costo: 10 }] },
  { id: 4, estado: 'entregado', fecha: '2027-01-05T12:00:00', lineas: [{ plantaId: 3, planta: 'Rosal', cantidad: 1, precio: 50, costo: 20 }] }
];
const v = ventas(pedidos);
assert.equal(v.length, 3);
assert.deepEqual(total(v), { clave: 'todo', ingreso: 75 + 60 + 50, costo: 30 + 24 + 20, piezas: 6, ganancia: 111 - 0 });
assert.equal(total([]).ingreso, 0);
const meses = agrupar(v, (x) => mesDe(x.fecha));
assert.deepEqual(meses.map((m) => [m.clave, m.piezas]).sort(), [['2026-12', 5], ['2027-01', 1]]);

// Cuenta del paquete 1: inversión = entradas × costo de cada planta; ganancia = vendido − costo de lo vendido
const movs = [
  { plantaId: 1, tipo: 'inicial', cantidad: 6, costo: 10 }, { plantaId: 1, tipo: 'entrada', cantidad: 4, costo: 10 },
  { plantaId: 2, tipo: 'entrada', cantidad: 5, costo: 12 }, { plantaId: 1, tipo: 'pedido', cantidad: -3, costo: 10 },
  { plantaId: 3, tipo: 'inicial', cantidad: 4, costo: 20 }
];
const c = cuentaPaquete({ id: 1 }, plantas, movs, pedidos);
assert.equal(c.invertido, 100 + 60);
assert.equal(c.vendido, 135);
assert.equal(c.ganancia, 135 - 54);
assert.deepEqual(c.detalle.map((d) => [d.planta.id, d.invertido, d.vendido, d.ganancia]), [[1, 100, 75, 45], [2, 60, 60, 36]]);
assert.equal(c.piezasVendidas, 5);
assert.equal(c.quedan, 6);
assert.equal(c.plantas, 2);
assert.equal(c.estimado, false);
assert.equal(cuentaPaquete({ id: 2 }, plantas, movs, pedidos).vendido, 60);          // la planta blanca está en 2 paquetes
assert.equal(cuentaPaquete({ id: 7 }, plantas, movs, pedidos).recuperado, 0);        // paquete vacío: sin división entre cero

// Inventario: lo archivado no cuenta
const r = resumenInventario(plantas);
assert.deepEqual(r, { total: 2, agotadas: 1, pocas: 0, costo: 60, venta: 150 });
// Borrar una planta: qué se llevaría consigo
const imp = impactoBorrado(1, movs, pedidos);
assert.deepEqual(imp, { movimientos: 3, pedidos: 3, entregados: 1, pendientes: 1, vendido: 75, quedanVacios: 2 });
assert.deepEqual(impactoBorrado(99, movs, pedidos), { movimientos: 0, pedidos: 0, entregados: 0, pendientes: 0, vendido: 0, quedanVacios: 0 });

// Nombres repetidos (ignora mayúsculas, acentos y espacios de los lados no: solo mayúsculas y acentos)
assert.deepEqual([...nombresRepetidos([{ nombre: 'Nochebuena roja' }, { nombre: 'nochebuena ROJA' }, { nombre: 'Limón' }, { nombre: 'Limon' }, { nombre: 'Rosal' }])].sort(), ['limon', 'nochebuena roja']);
assert.equal(normalizar('ÁrBol'), 'arbol');
console.log('logica.js: todo bien');

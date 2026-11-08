// node app/calc-logica.test.mjs
import assert from 'node:assert/strict';
import { inicial, teclear } from './calc-logica.js';

const seq = (...ts) => ts.reduce((e, t) => teclear(e, t), inicial()).pantalla;

assert.equal(seq('2', '+', '3', '='), '5');
assert.equal(seq('0', '.', '1', '+', '0', '.', '2', '='), '0.3');
assert.equal(seq('1', '2', '×', '3', '-', '6', '='), '30');            // encadenado
assert.equal(seq('1', '0', '÷', '0', '='), 'Error');
assert.equal(seq('1', '0', '÷', '0', '=', '5'), 'Error');               // bloqueado hasta C
assert.equal(seq('1', '0', '÷', '0', '=', 'C', '5'), '5');
assert.equal(seq('1', '.', '5', '.', '2'), '1.52');                     // un solo punto
assert.equal(seq('1', '2', '3', '←'), '12');
assert.equal(seq('7', '←'), '0');
assert.equal(seq('5', '0', '%'), '0.5');
assert.equal(seq('9', '±'), '-9');
assert.equal(seq('2', '+', '3', '=', '='), '5');                        // = repetido no hace nada
assert.equal(seq('2', '+', '×', '3', '='), '6');                        // el último operador manda
assert.equal(seq('8', '÷', '4', '='), '2');
assert.equal(seq('5', '+', '='), '5');                                  // sin segundo número
console.log('calculadora: todo correcto');

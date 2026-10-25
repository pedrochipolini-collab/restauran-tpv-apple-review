'use strict';

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const port = Number(process.env.PORT || 4100);
const reviewUsername = String(process.env.REVIEW_USERNAME || 'apple-review').trim().toLowerCase();
const reviewPassword = String(process.env.REVIEW_PASSWORD || 'change-this-before-deploying');
const apiKey = String(process.env.REVIEW_API_KEY || '');
const sessions = new Map();

const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;

let tables = [
  { id: 'mesa-1', label: 'Mesa 1', created_at: now() },
  { id: 'mesa-2', label: 'Mesa 2', created_at: now() },
  { id: 'terraza-1', label: 'Terraza 1', created_at: now() },
  { id: 'barra-1', label: 'Barra', created_at: now() }
];
let menuItems = [
  { id: 'menu-guacamole', name: 'Guacamole', category: 'Entradas', price: 8.5, is_available: true, created_at: now() },
  { id: 'menu-tacos', name: 'Tacos al pastor', category: 'Platos', price: 12.9, is_available: true, created_at: now() },
  { id: 'menu-quesadilla', name: 'Quesadilla', category: 'Platos', price: 10.5, is_available: true, created_at: now() },
  { id: 'menu-agua', name: 'Agua fresca', category: 'Bebidas', price: 3.5, is_available: true, created_at: now() }
];
let orders = [{
  id: 'pedido-demo-1', table_id: 'mesa-1', table_label: 'Mesa 1', status: 'open',
  created_by_name: 'Apple Review', created_at: now(), updated_at: now(), account_number: 1, diners: 2,
  items: [{ id: 'linea-demo-1', order_id: 'pedido-demo-1', menu_item_id: 'menu-tacos', quantity: 2, notes: null, name: 'Tacos al pastor', category: 'Platos', price: 12.9, is_manual: false }]
}];
let reservations = [{
  id: 1, customer_name: 'Cliente de ejemplo', phone: '555 010 2000', reservation_date: '2026-11-01', reservation_time: '20:00', guests: '2', notes: 'Datos ficticios para Apple Review', status: 'CONFIRMED', source: 'REVIEW', created_at: now(), updated_at: now()
}];
let nextReservationId = 2;

function requireApiKey(req, res, next) {
  if (!apiKey || req.get('x-api-key') === apiKey) return next();
  return res.status(401).json({ error: 'Clave de aplicación no válida.' });
}

function requireSession(req, res, next) {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return res.status(401).json({ error: 'Sesión no válida o caducada.' });
  req.reviewUser = session.user;
  return next();
}

function auth(req, res, next) { return requireApiKey(req, res, () => requireSession(req, res, next)); }
function tableById(tableId) { return tables.find((entry) => entry.id === tableId); }
function orderView(order) { return clone(order); }

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, environment: 'apple-review', data: 'fictitious' }));
app.get('/api/config', requireApiKey, (_req, res) => res.json({
  currency: { code: 'EUR', symbol: '€', locale: 'es-ES', label: 'Euro' },
  taxProfile: { code: 'ES', country: 'España', defaultRate: 0.10, rates: [0, 0.04, 0.10, 0.21] }
}));

app.post('/api/auth/login', requireApiKey, (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (username !== reviewUsername || password !== reviewPassword) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  const token = crypto.randomBytes(32).toString('hex');
  const user = { username: reviewUsername, displayName: 'Apple Review', role: 'manager' };
  sessions.set(token, { user, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
  return res.json({ token, user, expiresIn: 12 * 60 * 60 * 1000 });
});

app.get('/api/tables', auth, (_req, res) => res.json(clone(tables)));

app.get('/api/menu-items', auth, (_req, res) => res.json(clone(menuItems)));
app.post('/api/menu-items', auth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const price = Number(req.body?.price);
  if (!name || !Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Nombre y precio válidos son obligatorios.' });
  const entry = { id: id('menu'), name, category: req.body?.category ? String(req.body.category) : null, price, is_available: true, created_at: now() };
  menuItems.push(entry); return res.status(201).json(clone(entry));
});
app.put('/api/menu-items/:itemId', auth, (req, res) => {
  const entry = menuItems.find((item) => item.id === req.params.itemId);
  if (!entry) return res.status(404).json({ error: 'Producto no encontrado.' });
  if (req.body?.name !== undefined) entry.name = String(req.body.name).trim() || entry.name;
  if (req.body?.category !== undefined) entry.category = req.body.category ? String(req.body.category) : null;
  if (req.body?.price !== undefined && Number.isFinite(Number(req.body.price))) entry.price = Number(req.body.price);
  return res.json(clone(entry));
});
app.patch('/api/menu-items/:itemId/availability', auth, (req, res) => {
  const entry = menuItems.find((item) => item.id === req.params.itemId);
  if (!entry) return res.status(404).json({ error: 'Producto no encontrado.' });
  entry.is_available = Boolean(req.body?.is_available); return res.json(clone(entry));
});
app.delete('/api/menu-items/:itemId', auth, (req, res) => {
  const index = menuItems.findIndex((item) => item.id === req.params.itemId);
  if (index < 0) return res.status(404).json({ error: 'Producto no encontrado.' });
  menuItems.splice(index, 1); return res.json({ deleted: true, id: req.params.itemId });
});

app.get('/api/orders', auth, (_req, res) => res.json(orders.map(orderView)));
app.post('/api/orders', auth, (req, res) => {
  const table = tableById(String(req.body?.table_id || ''));
  const inputItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!table || !inputItems.length) return res.status(400).json({ error: 'Mesa y al menos una línea son obligatorias.' });
  const orderId = id('pedido');
  const order = { id: orderId, table_id: table.id, table_label: table.label, status: 'open', created_by_name: String(req.body?.created_by_name || 'Apple Review'), created_at: now(), updated_at: now(), account_number: Number(req.body?.account_number || 1), diners: Number(req.body?.diners || 1), items: inputItems.map((line, index) => {
    const item = menuItems.find((candidate) => candidate.id === line.menu_item_id);
    return { id: `${orderId}-linea-${index + 1}`, order_id: orderId, menu_item_id: line.menu_item_id || `manual-${index + 1}`, quantity: Number(line.quantity || 1), notes: line.notes || null, name: line.name || item?.name || 'Artículo manual', category: item?.category || 'Varios', price: Number(line.price ?? item?.price ?? 0), is_manual: Boolean(line.is_manual) };
  }) };
  orders.push(order); return res.status(201).json(orderView(order));
});
app.patch('/api/orders/:orderId', auth, (req, res) => {
  const order = orders.find((entry) => entry.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (req.body?.diners !== undefined) order.diners = Number(req.body.diners || 1);
  if (Array.isArray(req.body?.items)) order.items = req.body.items.map((line, index) => ({ id: `${order.id}-linea-${index + 1}`, order_id: order.id, menu_item_id: line.menu_item_id || `manual-${index + 1}`, quantity: Number(line.quantity || 1), notes: line.notes || null, name: line.name || menuItems.find((item) => item.id === line.menu_item_id)?.name || 'Artículo', category: 'Varios', price: Number(line.price || 0), is_manual: Boolean(line.is_manual) }));
  order.updated_at = now(); return res.json(orderView(order));
});
app.delete('/api/orders/:orderId/items/:itemId', auth, (req, res) => {
  const order = orders.find((entry) => entry.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  order.items = order.items.filter((item) => item.id !== req.params.itemId);
  if (!order.items.length) { orders = orders.filter((entry) => entry.id !== order.id); return res.json({ success: true, deletedOrder: true, orderId: order.id }); }
  order.updated_at = now(); return res.json({ success: true, deletedOrder: false, order: orderView(order) });
});
app.patch('/api/orders/:orderId/account', auth, (req, res) => {
  const order = orders.find((entry) => entry.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
  order.account_number = Number(req.body?.account_number || 1); order.updated_at = now(); return res.json(orderView(order));
});
app.post('/api/orders/transfer-table', auth, (req, res) => {
  const target = tableById(String(req.body?.target_table_id || ''));
  if (!target) return res.status(404).json({ error: 'Mesa de destino no encontrada.' });
  orders = orders.map((order) => order.table_id === req.body?.source_table_id ? { ...order, table_id: target.id, table_label: target.label, updated_at: now() } : order);
  return res.json({ success: true, target_table_label: target.label });
});
app.post('/api/orders/transfer-order', auth, (req, res) => {
  const target = tableById(String(req.body?.target_table_id || ''));
  const order = orders.find((entry) => entry.id === req.body?.order_id);
  if (!target || !order) return res.status(404).json({ error: 'Pedido o mesa de destino no encontrado.' });
  order.table_id = target.id; order.table_label = target.label; order.updated_at = now(); return res.json({ success: true, target_table_label: target.label, order: orderView(order) });
});
app.post('/api/orders/split-account', auth, (_req, res) => res.status(501).json({ error: 'La separación de cuentas no está disponible en el entorno de revisión.' }));
app.post('/api/orders/pre-ticket', auth, (req, res) => {
  const target = tableById(String(req.body?.table_id || ''));
  const selected = orders.filter((order) => order.table_id === req.body?.table_id && (req.body?.all_accounts || order.account_number === Number(req.body?.account_number || 1)));
  const total = selected.flatMap((order) => order.items).reduce((sum, line) => sum + line.quantity * line.price, 0);
  return res.json({ success: true, tableLabel: target?.label || 'Mesa de prueba', accountNumber: Number(req.body?.account_number || 1), total, printed: false, printError: 'Entorno de Apple Review: no se imprime.' });
});
app.post('/api/printers/reviews-qr', auth, (_req, res) => res.json({ success: true, printed: false, printError: 'Entorno de Apple Review: no se imprime.' }));

app.get('/api/reservations', auth, (_req, res) => res.json({ reservations: clone(reservations) }));
app.post('/api/reservations', auth, (req, res) => {
  const reservation = { id: nextReservationId++, customer_name: String(req.body?.customer_name || 'Cliente de prueba'), phone: String(req.body?.phone || ''), reservation_date: String(req.body?.reservation_date || ''), reservation_time: String(req.body?.reservation_time || ''), guests: String(req.body?.guests || '1'), notes: req.body?.notes ? String(req.body.notes) : null, status: 'PENDING', source: 'COMANDERA_REVIEW', created_at: now(), updated_at: now() };
  reservations.push(reservation); return res.status(201).json({ reservation: clone(reservation) });
});
app.patch('/api/reservations/:reservationId', auth, (req, res) => {
  const reservation = reservations.find((entry) => String(entry.id) === req.params.reservationId);
  if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada.' });
  for (const key of ['customer_name', 'phone', 'reservation_date', 'reservation_time', 'guests', 'notes', 'status']) if (req.body?.[key] !== undefined) reservation[key] = key === 'guests' ? String(req.body[key]) : req.body[key];
  reservation.updated_at = now(); return res.json({ reservation: clone(reservation) });
});

app.get('/api/analytics/monthly', auth, (req, res) => {
  const date = String(req.query.date || '').trim();
  const month = String(req.query.month || date.slice(0, 7) || new Date().toISOString().slice(0, 7));
  const daily = [{ date: date || `${month}-01`, customers: 4, tickets: 2, units: 5, amount: 51.8 }];
  return res.json({ month, from: daily[0].date, to: daily[0].date, summary: { amount: 51.8, customers: 4, tickets: 2, units: 5, averageTicket: 25.9, averageSpendPerCustomer: 12.95, unitsPerCustomer: 1.25 }, daily, products: [{ key: 'tacos', name: 'Tacos al pastor', category: 'Platos', units: 3, amount: 38.7, tickets: 2, customers: 4, unitsPerCustomer: 0.75 }], pie: [{ name: 'Platos', amount: 38.7 }, { name: 'Bebidas', amount: 13.1 }] });
});

app.use((_req, res) => res.status(404).json({ error: 'Ruta no disponible en el entorno de revisión.' }));
app.listen(port, '0.0.0.0', () => console.log(`Apple Review backend listening on ${port}`));

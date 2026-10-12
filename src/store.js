import { atomicJson, decrypt, encrypt, readJson } from './config.js';

export const isAccountingModel = (model) => /^account(\.|\b)/i.test(String(model || '').trim());
export const isPayrollModel = (model) => /^hr\.(payslip|payroll|salary|contract)(\.|\b)/i.test(String(model || '').trim());

export const DEFAULT_CORE_MODELS = [
  'res.partner',
  'product.template',
  'product.product',
  'sale.order',
  'purchase.order',
  'stock.picking',
  'crm.lead',
  'project.task',
  'hr.employee',
  'account.move',
  'account.payment',
  'hr.payslip',
  'hr.contract',
];

function isLocalOrPrivateHost(hostname) {
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  return false;
}

const slugPattern = /^[a-z][a-z0-9_]{1,30}$/;
const modelPattern = /^[a-z][a-z0-9_.]{1,90}$/;
let pendingWrite = Promise.resolve();

function serializeWrite(action) {
  const operation = pendingWrite.then(action);
  pendingWrite = operation.catch(() => {});
  return operation;
}

export function validateConnection(input) {
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!slugPattern.test(slug)) throw new Error('Slug: 2–31 lowercase letters, digits, or underscores; start with a letter');

  const hasExplicitModels = Boolean(input.models && String(input.models).trim());
  let parsedModels = hasExplicitModels
    ? [...new Set(String(input.models).split(/[\s,]+/).filter(Boolean))]
    : [...DEFAULT_CORE_MODELS];

  if (hasExplicitModels) {
    if (parsedModels.length < 1 || parsedModels.length > 50 || parsedModels.some((model) => !modelPattern.test(model))) {
      throw new Error('Provide 1–50 valid technical model names (e.g. res.partner)');
    }
  }

  if (!['auto', '17', '18', '19'].includes(String(input.version))) throw new Error('Supported Odoo versions: auto, 17, 18, 19');
  const url = new URL(String(input.url || ''));
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Odoo URL must be an HTTP(S) origin without path, credentials, query, or fragment');
  }
  if (url.protocol === 'http:' && !isLocalOrPrivateHost(url.hostname) &&
      !String(process.env.ABJ_HTTP_ODOO_HOSTS || '').split(',').includes(url.hostname)) {
    throw new Error('Odoo URL must use HTTPS (or explicitly allowlist an internal hostname in ABJ_HTTP_ODOO_HOSTS)');
  }
  const database = String(input.database || '').trim();
  const login = String(input.login || '').trim();
  const apiKey = String(input.apiKey || '');
  if (!database || database.length > 100 || !login || login.length > 250 || !apiKey) throw new Error('Database, login, and API key are required');

  // 6 Permissions & Exclusions
  const canCreate = Boolean(input.canCreate);
  const canRead = input.canRead !== undefined ? Boolean(input.canRead) : true;
  const canUpdate = Boolean(input.canUpdate);
  const canDelete = Boolean(input.canDelete);
  const excludeAccounting = Boolean(input.excludeAccounting);
  const excludePayroll = Boolean(input.excludePayroll);

  if (hasExplicitModels) {
    if (excludeAccounting) {
      const forbidden = parsedModels.find(isAccountingModel);
      if (forbidden) {
        throw new Error(`Akses ditolak: Model '${forbidden}' termasuk dalam modul Accounting yang diblokir oleh opsi Exclude Accounting.`);
      }
    }
    if (excludePayroll) {
      const forbidden = parsedModels.find(isPayrollModel);
      if (forbidden) {
        throw new Error(`Akses ditolak: Model '${forbidden}' termasuk dalam modul Payroll yang diblokir oleh opsi Exclude Payroll.`);
      }
    }
  }

  const models = parsedModels.filter((m) => {
    if (excludeAccounting && isAccountingModel(m)) return false;
    if (excludePayroll && isPayrollModel(m)) return false;
    return true;
  });

  const allowSelfSigned = Boolean(input.allowSelfSigned);

  return {
    slug,
    url: url.origin,
    database,
    login,
    version: String(input.version),
    models,
    allowSelfSigned,
    apiKey,
    canCreate,
    canRead,
    canUpdate,
    canDelete,
    excludeAccounting,
    excludePayroll,
  };
}

export async function listConnections() {
  return (await readJson('connections.json')) || [];
}

export async function saveConnection(input, config, { replace = false } = {}) {
  const connection = validateConnection(input);
  return serializeWrite(async () => {
    const existing = await listConnections();
    const index = existing.findIndex((item) => item.slug === connection.slug);
    if (index >= 0 && !replace) throw new Error('Slug already exists; check Replace to update it');
    const saved = { ...connection, apiKey: encrypt(connection.apiKey, config) };
    if (index < 0) existing.push(saved);
    else existing[index] = saved;
    await atomicJson('connections.json', existing);
    return saved.slug;
  });
}

export async function removeConnection(slug) {
  return serializeWrite(async () => {
    const existing = await listConnections();
    if (!existing.some((item) => item.slug === slug)) throw new Error('Connection not found');
    await atomicJson('connections.json', existing.filter((item) => item.slug !== slug));
  });
}

export function getApiKey(connection, config) {
  return decrypt(connection.apiKey, config);
}

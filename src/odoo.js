import { getApiKey, isAccountingModel, isPayrollModel } from './store.js';

export class OdooHttpError extends Error {
  constructor(status) {
    super(`Odoo API returned HTTP ${status}`);
    this.status = status;
  }
}

async function request(url, body, headers = {}, wrapped = false, options = {}) {
  let response;
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (options.allowSelfSigned || process.env.ABJ_ALLOW_SELF_SIGNED_SSL === "1") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch (err) {
    if (err instanceof OdooHttpError) throw err;
    let detail = err.message;
    if (err.cause) {
      detail = err.cause.message || err.cause.code || String(err.cause);
    }
    const parsed = new URL(url);
    if (String(detail).includes("ENOTFOUND")) {
      throw new Error(`Domain '${parsed.hostname}' tidak ditemukan (DNS unresolved). Periksa kembali penulisan Odoo URL.`);
    }
    if (String(detail).includes("ECONNREFUSED")) {
      const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
      throw new Error(`Koneksi ditolak (ECONNREFUSED) ke '${parsed.origin}' pada port ${port}. Pastikan service Odoo sedang aktif dan port sesuai.`);
    }
    if (String(detail).includes("ETIMEDOUT") || String(detail).includes("timeout") || err.name === "TimeoutError") {
      throw new Error(`Koneksi timeout (15s): Server Odoo di '${parsed.origin}' tidak merespons atau terhalang firewall.`);
    }
    if (String(detail).includes("SELF_SIGNED") || String(detail).includes("UNABLE_TO_VERIFY") || String(detail).includes("CERT")) {
      throw new Error(`Sertifikat SSL bermasalah pada '${parsed.origin}' (${detail}). Aktifkan opsi 'Izinkan Self-Signed SSL' jika menggunakan HTTPS lokal/staging.`);
    }
    throw new Error(`Gagal menghubungi Odoo (${parsed.origin}): ${detail}`);
  } finally {
    if (options.allowSelfSigned || process.env.ABJ_ALLOW_SELF_SIGNED_SSL === "1") {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    }
  }

  if (!response.ok) throw new OdooHttpError(response.status);
  if (Number(response.headers.get("content-length")) > 2_097_152) throw new Error("Odoo response exceeds 2 MiB limit");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 2_097_152) throw new Error("Odoo response exceeds 2 MiB limit");
    chunks.push(Buffer.from(chunk));
  }
  const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (result.error) throw new Error(`Odoo API error: ${String(result.error.message || "request rejected").slice(0, 200)}`);
  return wrapped ? result.result : result;
}

export async function callOdoo(connection, config, model, method, args = [], kwargs = {}) {
  if (!['context_get', 'search_read', 'fields_get', 'create', 'write', 'unlink'].includes(method)) {
    throw new Error('Method not allowed');
  }

  // Security Exclusions
  if (connection.excludeAccounting && isAccountingModel(model)) {
    throw new Error(`Akses ditolak: Model '${model}' diblokir oleh kebijakan Exclude Accounting pada koneksi '${connection.slug}'`);
  }
  if (connection.excludePayroll && isPayrollModel(model)) {
    throw new Error(`Akses ditolak: Model '${model}' diblokir oleh kebijakan Exclude Payroll pada koneksi '${connection.slug}'`);
  }

  const key = getApiKey(connection, config);
  if (connection.version === '19') {
    const parameters = method === 'context_get' ? {}
      : method === 'search_read' ? { domain: args[0], ...kwargs }
      : method === 'create' ? { values: args[0] || kwargs.values || kwargs, ...kwargs }
      : method === 'write' ? { ids: args[0], values: args[1] || kwargs.values, ...kwargs }
      : method === 'unlink' ? { ids: args[0], ...kwargs }
      : kwargs;

    return request(`${connection.url}/json/2/${encodeURIComponent(model)}/${method}`, parameters, {
      Authorization: `bearer ${key}`, 'X-Odoo-Database': connection.database,
    });
  }

  const uid = await request(`${connection.url}/jsonrpc`, {
    jsonrpc: '2.0', method: 'call', params: { service: 'common', method: 'authenticate', args: [connection.database, connection.login, key, {}] }, id: 1,
  }, {}, true, { allowSelfSigned: connection.allowSelfSigned });
  if (!Number.isInteger(uid) || uid <= 0) throw new Error('Odoo authentication failed');
  return request(`${connection.url}/jsonrpc`, {
    jsonrpc: '2.0', method: 'call', params: {
      service: 'object', method: 'execute_kw', args: [connection.database, uid, key, model, method, args, kwargs],
    }, id: 2,
  }, {}, true);
}

export async function probeOdoo(connection, config) {
  return callOdoo(connection, config, 'res.users', 'context_get');
}

export async function detectVersion(connection, config) {
  try {
    await probeOdoo({ ...connection, version: '19' }, config);
    return '19';
  } catch (error) {
    if (!(error instanceof OdooHttpError) || error.status !== 404) throw error;
  }
  const info = await request(`${connection.url}/jsonrpc`, {
    jsonrpc: '2.0', method: 'call', params: { service: 'common', method: 'version', args: [] }, id: 1,
  }, {}, true);
  const major = info?.server_version_info?.[0];
  if (![17, 18].includes(major)) throw new Error(`Unsupported Odoo version or JSON-2 unavailable (detected ${String(major || 'unknown')})`);
  await probeOdoo({ ...connection, version: String(major) }, config);
  return String(major);
}

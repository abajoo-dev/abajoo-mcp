import { callOdoo } from './odoo.js';
import { listConnections, isAccountingModel, isPayrollModel } from './store.js';

const domainItem = {
  anyOf: [
    { type: 'array', minItems: 3, maxItems: 3, items: {} },
    { type: 'string', enum: ['&', '|', '!'] },
  ],
};

export function toolName(connection, model, operation) {
  return `odoo_${connection.slug}_${model.replaceAll('_', '_u').replaceAll('.', '_d')}_${operation}`;
}

export function systemToolName(connection, operation) {
  return `odoo_${connection.slug}_sys_${operation}`;
}

export async function toolsList({ includeSystem = false } = {}) {
  const tools = [];
  for (const connection of await listConnections()) {
    const canRead = connection.canRead !== false;
    const canCreate = Boolean(connection.canCreate);
    const canUpdate = Boolean(connection.canUpdate);
    const canDelete = Boolean(connection.canDelete);

    for (const model of connection.models) {
      if (connection.excludeAccounting && isAccountingModel(model)) continue;
      if (connection.excludePayroll && isPayrollModel(model)) continue;

      // READ (Search & Describe)
      if (canRead) {
        tools.push({
          name: toolName(connection, model, 'search'),
          description: `Read-only search on ${model} in Odoo connection ${connection.slug}. Results are limited to 100 records.`,
          annotations: { readOnlyHint: true, destructiveHint: false },
          inputSchema: {
            type: 'object', additionalProperties: false,
            properties: {
              domain: { type: 'array', items: domainItem, description: 'Odoo domain expression; default []' },
              fields: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 30 },
              limit: { type: 'integer', minimum: 1, maximum: 100 },
            }, required: ['fields'],
          },
        });

        tools.push({
          name: toolName(connection, model, 'describe'),
          description: `Discover fields visible to the API user on ${model} in Odoo connection ${connection.slug}.`,
          annotations: { readOnlyHint: true, destructiveHint: false },
          inputSchema: {
            type: 'object', additionalProperties: false,
            properties: {
              prefix: { type: 'string', maxLength: 40, description: 'Optional field-name prefix' },
              limit: { type: 'integer', minimum: 1, maximum: 100 },
            },
          },
        });
      }

      // CREATE
      if (canCreate) {
        tools.push({
          name: toolName(connection, model, 'create'),
          description: `Create a new record in ${model} in Odoo connection ${connection.slug}.`,
          annotations: { readOnlyHint: false, destructiveHint: false },
          inputSchema: {
            type: 'object', additionalProperties: false,
            properties: {
              values: { type: 'object', description: 'Field dictionary values to create' },
            }, required: ['values'],
          },
        });
      }

      // UPDATE
      if (canUpdate) {
        tools.push({
          name: toolName(connection, model, 'update'),
          description: `Update existing record(s) in ${model} in Odoo connection ${connection.slug}.`,
          annotations: { readOnlyHint: false, destructiveHint: false },
          inputSchema: {
            type: 'object', additionalProperties: false,
            properties: {
              ids: { type: 'array', items: { type: 'integer' }, minItems: 1, description: 'IDs of records to update' },
              values: { type: 'object', description: 'Field dictionary values to write' },
            }, required: ['ids', 'values'],
          },
        });
      }

      // DELETE
      if (canDelete) {
        tools.push({
          name: toolName(connection, model, 'delete'),
          description: `Delete (unlink) record(s) in ${model} in Odoo connection ${connection.slug}.`,
          annotations: { readOnlyHint: false, destructiveHint: true },
          inputSchema: {
            type: 'object', additionalProperties: false,
            properties: {
              ids: { type: 'array', items: { type: 'integer' }, minItems: 1, description: 'IDs of records to delete' },
            }, required: ['ids'],
          },
        });
      }
    }

    if (includeSystem) {
      tools.push({
        name: `odoo_${connection.slug}_execute_kw`,
        description: `Execute ORM methods on any allowed model in ${connection.slug}. Supports search_read, search_count, fields_get${canCreate ? ', create' : ''}${canUpdate ? ', write' : ''}${canDelete ? ', unlink' : ''}. Use this to query models like account.analytic.line (timesheets), project.task, hr.employee, res.users, etc.`,
        annotations: { readOnlyHint: !canCreate && !canUpdate && !canDelete, destructiveHint: canDelete },
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            model: { type: 'string', description: 'Technical model name (e.g. account.analytic.line, project.task, hr.employee, res.users)' },
            method: {
              type: 'string',
              enum: ['search_read', 'search_count', 'fields_get', ...(canCreate ? ['create'] : []), ...(canUpdate ? ['write'] : []), ...(canDelete ? ['unlink'] : [])],
              description: 'ORM method to execute',
            },
            args: { type: 'array', description: 'Positional arguments (e.g. [[[field, op, val]]] for search_read/search_count)' },
            kwargs: { type: 'object', description: 'Keyword arguments (e.g. { fields: ["name", "unit_amount"], limit: 50 })' },
          },
          required: ['model', 'method'],
        },
      });
      tools.push({
        name: systemToolName(connection, 'info'),
        description: `Get general system info on ${connection.slug}.`,
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      });
    }
  }
  return tools;
}

function validDomain(domain) {
  return Array.isArray(domain)
    && domain.every((item) => typeof item === 'string' || (Array.isArray(item) && item.length === 3 && typeof item[0] === 'string'));
}

export async function callTool(name, args, config) {
  const connections = await listConnections();

  // System and execute_kw tool handlers
  for (const connection of connections) {
    if (name === systemToolName(connection, 'info')) {
      return executeSystemInfo(connection, config);
    }
    if (name === `odoo_${connection.slug}_execute_kw`) {
      return executeKw(connection, args, config);
    }
  }

  const connection = [...connections]
    .sort((a, b) => b.slug.length - a.slug.length)
    .find((item) => name.startsWith(`odoo_${item.slug}_`));

  const match = connection && /^(.+)_(search|describe|create|update|delete)$/.exec(name.slice(`odoo_${connection.slug}_`.length));
  if (!match) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  const [, encodedModel, operation] = match;
  const model = encodedModel.replaceAll('_d', '.').replaceAll('_u', '_');
  if (!connection.models.includes(model)) return { isError: true, content: [{ type: 'text', text: `Model ${model} not allowlisted in ${connection.slug}` }] };

  // Exclusions Check
  if (connection.excludeAccounting && isAccountingModel(model)) {
    return { isError: true, content: [{ type: 'text', text: `Akses ditolak: Model ${model} diblokir oleh opsi Exclude Accounting pada ${connection.slug}` }] };
  }
  if (connection.excludePayroll && isPayrollModel(model)) {
    return { isError: true, content: [{ type: 'text', text: `Akses ditolak: Model ${model} diblokir oleh opsi Exclude Payroll pada ${connection.slug}` }] };
  }

  // Permissions Check
  const canRead = connection.canRead !== false;
  const canCreate = Boolean(connection.canCreate);
  const canUpdate = Boolean(connection.canUpdate);
  const canDelete = Boolean(connection.canDelete);

  if ((operation === 'search' || operation === 'describe') && !canRead) {
    return { isError: true, content: [{ type: 'text', text: `Akses ditolak: Operasi Read tidak diizinkan pada koneksi ${connection.slug}` }] };
  }
  if (operation === 'create' && !canCreate) {
    return { isError: true, content: [{ type: 'text', text: `Akses ditolak: Operasi Create tidak diizinkan pada koneksi ${connection.slug}` }] };
  }
  if (operation === 'update' && !canUpdate) {
    return { isError: true, content: [{ type: 'text', text: `Akses ditolak: Operasi Update tidak diizinkan pada koneksi ${connection.slug}` }] };
  }
  if (operation === 'delete' && !canDelete) {
    return { isError: true, content: [{ type: 'text', text: `Akses ditolak: Operasi Delete tidak diizinkan pada koneksi ${connection.slug}` }] };
  }

  try {
    if (operation === 'search') {
      const domain = args?.domain ?? [];
      if (!validDomain(domain)) throw new Error('Domain must be an array of leaves or operators');
      const fields = args?.fields;
      if (!Array.isArray(fields) || fields.length < 1 || fields.length > 30 || !fields.every((item) => typeof item === 'string' && /^[a-z0-9_]+$/i.test(item))) {
        throw new Error('Fields must contain between 1 and 30 valid field names');
      }
      const limit = args?.limit === undefined ? 20 : args.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be an integer between 1 and 100');
      const records = await callOdoo(connection, config, model, 'search_read', [domain], { fields, limit });
      return { content: [{ type: 'text', text: JSON.stringify(records) }] };
    }

    if (operation === 'describe') {
      const prefix = String(args?.prefix || '');
      const limit = args?.limit === undefined ? 50 : args.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be an integer between 1 and 100');
      const fields = await callOdoo(connection, config, model, 'fields_get', [], { attributes: ['type', 'string'] });
      const filtered = Object.fromEntries(
        Object.entries(fields)
          .filter(([key]) => !prefix || key.startsWith(prefix))
          .slice(0, limit)
          .map(([key, value]) => [key, { string: value.string, type: value.type }])
      );
      return { content: [{ type: 'text', text: JSON.stringify(filtered) }] };
    }

    if (operation === 'create') {
      const values = args?.values;
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new Error('Values must be a key-value object of fields');
      }
      const createdId = await callOdoo(connection, config, model, 'create', [values]);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, id: createdId }) }] };
    }

    if (operation === 'update') {
      const ids = args?.ids;
      const values = args?.values;
      if (!Array.isArray(ids) || ids.length < 1 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw new Error('IDs must be an array of positive integers');
      }
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new Error('Values must be a key-value object of fields');
      }
      const updated = await callOdoo(connection, config, model, 'write', [ids, values]);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: updated }) }] };
    }

    if (operation === 'delete') {
      const ids = args?.ids;
      if (!Array.isArray(ids) || ids.length < 1 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw new Error('IDs must be an array of positive integers');
      }
      const deleted = await callOdoo(connection, config, model, 'unlink', [ids]);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, result: deleted }) }] };
    }
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: `Odoo error: ${error.message}` }] };
  }
}

async function executeSystemInfo(connection, config) {
  try {
    const user = await callOdoo(connection, config, 'res.users', 'search_read', [[['login', '=', connection.login]]], {
      fields: ['id', 'name', 'login'],
      limit: 1,
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'online',
          connection: connection.slug,
          odoo_url: connection.url,
          odoo_db: connection.database,
          configured_version: connection.version,
          active_user: user[0] || { login: connection.login },
          allowlisted_models: connection.models,
        }),
      }],
    };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: `Failed to fetch system info: ${error.message}` }] };
  }
}

async function executeKw(connection, args, config) {
  const { model, method, args: ormArgs = [], kwargs: ormKwargs = {} } = args || {};
  if (!model || !method) {
    return { isError: true, content: [{ type: 'text', text: 'Model and method are required' }] };
  }

  // Security checks
  if (connection.excludeAccounting && isAccountingModel(model)) {
    return { isError: true, content: [{ type: 'text', text: `Akses ditolak: Model '${model}' diblokir oleh opsi Exclude Accounting` }] };
  }
  if (connection.excludePayroll && isPayrollModel(model)) {
    return { isError: true, content: [{ type: 'text', text: `Akses ditolak: Model '${model}' diblokir oleh opsi Exclude Payroll` }] };
  }

  if (method === 'create' && !connection.canCreate) {
    return { isError: true, content: [{ type: 'text', text: 'Akses ditolak: Operasi Create tidak diizinkan' }] };
  }
  if (method === 'write' && !connection.canUpdate) {
    return { isError: true, content: [{ type: 'text', text: 'Akses ditolak: Operasi Update tidak diizinkan' }] };
  }
  if (method === 'unlink' && !connection.canDelete) {
    return { isError: true, content: [{ type: 'text', text: 'Akses ditolak: Operasi Delete tidak diizinkan' }] };
  }

  try {
    const result = await callOdoo(connection, config, model, method, ormArgs, ormKwargs);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
}


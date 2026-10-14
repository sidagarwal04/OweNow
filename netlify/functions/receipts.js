import crypto from 'node:crypto';
import { authUser, getReceipt, json, saveReceipt } from './_shared.js';

export const handler = async (event) => {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const params = event.queryStringParameters || {};

  try {
    const { user } = await authUser(event);

    if (method === 'GET') {
      const pathKey = params.path;
      if (!pathKey) return json(400, { error: 'path is required' });
      const dataUrl = await getReceipt(pathKey);
      if (!dataUrl) return json(404, { error: 'Receipt not found' });
      return json(200, { signedUrl: dataUrl });
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { dataUrl, ext = 'jpg' } = body;
      if (!dataUrl) return json(400, { error: 'dataUrl is required' });
      const safeExt = String(ext).replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const pathKey = `${user.id}/${crypto.randomUUID()}.${safeExt}`;
      await saveReceipt(pathKey, dataUrl);
      return json(200, { path: pathKey });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }
};

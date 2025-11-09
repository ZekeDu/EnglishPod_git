#!/usr/bin/env node
/**
 * 直传可用性自检脚本
 * - 请求 /upload/presign 获取预签名
 * - 将一段小文本以二进制直传（PUT/POST）
 * - 输出状态与关键参数（key/finalUrl）
 * 用法：
 *   API_BASE=http://localhost:4000 node packages/scripts/check-upload.js
 */

const API = process.env.API_BASE || 'http://localhost:4000';

async function main(){
  const presign = await fetch(`${API}/upload/presign?ext=txt`).then(r=>r.json());
  if (!presign?.data?.url) throw new Error('presign 返回异常');
  const u = presign.data;
  const uploadUrl = /^https?:/i.test(u.url) ? u.url : `${API}${u.url}`;
  const method = (u.method||'PUT').toUpperCase();
  const headers = u.headers || { 'Content-Type': 'application/octet-stream' };
  const payload = new TextEncoder().encode(`ep-check-upload ${new Date().toISOString()}\n`);

  const resp = await fetch(uploadUrl, { method, headers, body: payload });
  const ok = resp.ok;
  let hint = '';
  try { const j = await resp.clone().json(); hint = JSON.stringify(j); } catch {}
  if (!ok) {
    throw new Error(`上传失败：HTTP ${resp.status} ${resp.statusText}${hint?` body=${hint}`:''}`);
  }
  // 输出结果（finalUrl可能为S3对象URL或local占位URL）
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, key: u.key, finalUrl: u.finalUrl, method, uploadUrl }, null, 2));
}

main().catch(e => { console.error(e.message || e); process.exit(1); });


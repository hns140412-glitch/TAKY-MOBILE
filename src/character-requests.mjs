// Parent-only "캐릭터 신청" panel (no paid API). A child's photo request is shown to a PARENT, who makes
// the character by hand, uploads it here and approves. Approval = private master upload (character-asset,
// sha-verified commit) + character-profile PUBLISH, then the request is closed and the source photo deleted.
// Contract: TAKY OS/CHARACTER_ASSET_BEHAVIOR_PIPELINE 3, 6.1, 6.2. Server decides PARENT role.
export const CHARACTER_ID = 'ready-explorer';
const TYPES = ['image/png', 'image/webp', 'image/jpeg'];
const hex = async buf => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('');

function api(runtime, fetchImpl) {
  return async (path, body) => {
    const token = await runtime.getToken();
    const r = await fetchImpl(new URL(path, runtime.apiBaseUrl).href, { method: 'POST', cache: 'no-store', redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch {}
    return { status: r.status, ok: r.ok && j.ok !== false, j };
  };
}

// Upload the parent-made image as the member's Character Master and publish the profile (monotonic version).
export async function approveRequest({ runtime, fetchImpl = fetch, request, file, now = () => new Date() }) {
  if (!file || !TYPES.includes(file.type)) return { ok: false, state: 'MASTER_IMAGE_FORMAT' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, state: 'MASTER_IMAGE_TOO_LARGE' };
  const post = api(runtime, fetchImpl), family_id = await runtime.getFamilyId(), member_id = request.member_id;
  const bytes = new Uint8Array(await file.arrayBuffer()), sha256 = await hex(bytes);
  const cur = await post('/api/family/character-profile', { action: 'GET', family_id, member_id });
  if (!cur.ok) return { ok: false, state: 'CHARACTER_PROFILE_UNAVAILABLE' };
  const identity_version = (cur.j.found ? Number(cur.j.projection?.identity_version) || 0 : 0) + 1, asset_version = 'v' + identity_version;
  const scope = { family_id, member_id, character_id: CHARACTER_ID };
  const up = await post('/api/family/character-asset', { action: 'CREATE_UPLOAD', ...scope, content_type: file.type, byte_size: bytes.length, sha256, asset_version });
  if (!up.ok) return { ok: false, state: 'ASSET_UPLOAD_TICKET_FAILED' };
  const put = await fetchImpl(up.j.upload_url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: bytes });
  if (!put.ok) return { ok: false, state: 'ASSET_UPLOAD_FAILED' };
  const commit = await post('/api/family/character-asset', { action: 'COMMIT_UPLOAD', ...scope, asset_ref: up.j.asset_ref, upload_id: up.j.upload_id, sha256 });
  if (!commit.ok || commit.j.committed !== true) return { ok: false, state: 'ASSET_COMMIT_FAILED' };
  const projection = { member_id, character_id: CHARACTER_ID, identity_version, master_asset_ref: up.j.asset_ref, master_sha256: sha256,
    asset_version, derivative_refs: {}, status: 'CONFIRMED', updated_at: now().toISOString() };
  const pub = await post('/api/family/character-profile', { action: 'PUBLISH', family_id, member_id, projection });
  if (!pub.ok) return { ok: false, state: 'CHARACTER_PROFILE_PUBLISH_FAILED' };
  const done = await post('/api/family/character-request', { action: 'COMPLETE', family_id, request_id: request.request_id });
  return done.ok ? { ok: true, state: 'REGISTRY_BOUND', identity_version } : { ok: false, state: 'REQUEST_CLOSE_FAILED', identity_version };
}

export async function mountCharacterRequests(root, { runtime = globalThis.TAKY_FAMILY_RUNTIME, fetchImpl = fetch, memberLabel = id => id } = {}) {
  const box = root?.querySelector('[data-character-requests]'); if (!box) return { ok: false, state: 'MOUNT_TARGET_MISSING' };
  const status = box.querySelector('[data-character-requests-status]'), list = box.querySelector('[data-character-requests-list]');
  box.hidden = true; list.replaceChildren();
  if (!runtime) return { ok: false, state: 'NO_SESSION' };
  const post = api(runtime, fetchImpl);
  let res; try { res = await post('/api/family/character-request', { action: 'LIST', family_id: await runtime.getFamilyId() }); } catch { return { ok: false, state: 'UNAVAILABLE' }; }
  if (res.status === 403) return { ok: false, state: 'NOT_PARENT' };        // children never see this panel
  box.hidden = false;
  if (!res.ok) { status.textContent = '캐릭터 신청을 불러오지 못했어요.'; return { ok: false, state: 'UNAVAILABLE' }; }
  const reqs = res.j.requests || [];
  status.textContent = reqs.length ? `새 캐릭터 신청 ${reqs.length}건 · ① 사진 저장 → ② ChatGPT 등에서 캐릭터로 만들기 → ③ 완성 이미지 고르고 승인. 사진 그대로 쓰려면 '이 사진 그대로 승인'.` : '새 캐릭터 신청이 없어요.';
  for (const rq of reqs) {
    const card = document.createElement('article'); card.className = 'character-request';
    const img = document.createElement('img'); img.alt = '신청 사진'; img.className = 'character-request__photo';
    const save = document.createElement('a'); save.textContent = '① 사진 저장'; save.className = 'family-member-choice'; save.download = 'taky-character-request.jpg';
    let srcBlob = null;
    const asIs = document.createElement('button'); asIs.type = 'button'; asIs.className = 'family-member-choice'; asIs.textContent = '이 사진 그대로 승인'; asIs.disabled = true;
    fetchImpl(rq.photo_url).then(r => r.ok ? r.blob() : null).then(b => { if (b) { srcBlob = b; const u = URL.createObjectURL(b); img.src = u; save.href = u; asIs.disabled = false; } }).catch(() => {});
    const who = document.createElement('p'); who.textContent = `${memberLabel(rq.member_id)} · ${rq.created_at ? new Date(rq.created_at).toLocaleString('ko-KR') : ''}`;
    const pick = document.createElement('input'); pick.type = 'file'; pick.accept = TYPES.join(','); pick.setAttribute('aria-label', '② 완성 캐릭터 이미지 선택');
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'family-member-choice'; ok.textContent = '③ 고른 이미지로 승인'; ok.disabled = true;
    const no = document.createElement('button'); no.type = 'button'; no.className = 'family-member-choice'; no.textContent = '반려';
    const lockAll = v => { ok.disabled = no.disabled = asIs.disabled = v; if (!v) ok.disabled = !pick.files?.[0]; };
    const msg = document.createElement('p'); msg.setAttribute('role', 'status');
    pick.addEventListener('change', () => { ok.disabled = !pick.files?.[0]; msg.textContent = pick.files?.[0] ? '승인을 누르면 이 이미지가 캐릭터로 등록돼요.' : ''; });
    const approve = async file => {
      lockAll(true); msg.textContent = '등록 중…';
      const out = await approveRequest({ runtime, fetchImpl, request: rq, file }).catch(() => ({ ok: false, state: 'FAILED' }));
      msg.textContent = out.ok ? `등록 완료 · 캐릭터 v${out.identity_version}. 아이 앱을 다시 열면 바로 보여요.` : `등록하지 못했어요 (${out.state}). 다시 시도해 주세요.`;
      if (!out.ok) lockAll(false); else card.dataset.done = 'true';
    };
    ok.addEventListener('click', () => approve(pick.files[0]));
    asIs.addEventListener('click', () => { if (!srcBlob) return; const type = TYPES.includes(srcBlob.type) ? srcBlob.type : 'image/jpeg'; approve(new File([srcBlob], 'taky-character.' + (type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]), { type })); });
    // Reject deletes the child's photo for good, so it takes a second tap (Taky 2026-11-22: a request vanished).
    no.addEventListener('click', async () => {
      if (no.dataset.confirm !== 'true') { no.dataset.confirm = 'true'; no.textContent = '정말 반려 (사진 삭제)'; msg.textContent = '반려하면 아이가 보낸 사진이 지워져요. 한 번 더 누르면 반려돼요.'; setTimeout(() => { if (no.dataset.confirm === 'true' && !card.dataset.done) { no.dataset.confirm = ''; no.textContent = '반려'; msg.textContent = ''; } }, 6000); return; }
      lockAll(true);
      const r = await post('/api/family/character-request', { action: 'REJECT', family_id: await runtime.getFamilyId(), request_id: rq.request_id });
      msg.textContent = r.ok ? '반려했어요. 원본 사진은 삭제했어요.' : '반려하지 못했어요.'; if (!r.ok) lockAll(false); else card.dataset.done = 'true';
    });
    card.append(img, who, save, asIs, pick, ok, no, msg); list.append(card);
  }
  return { ok: true, state: 'LISTED', count: reqs.length };
}

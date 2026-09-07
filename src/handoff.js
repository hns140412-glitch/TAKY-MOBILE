const MARKER_START = '<!-- TAKY_MACHINE_STATE_START -->';
const MARKER_END = '<!-- TAKY_MACHINE_STATE_END -->';

function safeFilename(value) {
  return String(value || 'TAKY_MOBILE_HANDOFF')
    .replace(/[\\/:*?"<>|%\s]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

export function buildHandoffPacket(state, canonicalResult) {
  return {
    schema: 'TAKY_HANDOFF_V1',
    exportedAt: new Date().toISOString(),
    canonical: canonicalResult?.bundle ? {
      source: canonicalResult.source,
      repository: canonicalResult.bundle.repository,
      ref: canonicalResult.bundle.ref,
      fetchedAt: canonicalResult.bundle.fetchedAt,
      files: canonicalResult.bundle.files.map(file => ({ path: file.path, sha: file.sha })),
    } : { source: canonicalResult?.source || 'UNAVAILABLE' },
    state,
  };
}

export function packetToMarkdown(packet) {
  const works = packet.state?.works || [];
  const ideas = packet.state?.ideas || [];
  const traces = packet.state?.traces || [];
  const next = works[0]?.next || 'UNSPECIFIED';

  return `# TAKY Mobile Handoff\n\n` +
    `- Exported: ${packet.exportedAt}\n` +
    `- Canonical: ${packet.canonical?.source || 'UNAVAILABLE'}\n` +
    `- Current work: ${works[0]?.title || 'UNSPECIFIED'}\n` +
    `- Next action: ${next}\n\n` +
    `## WORK\n${works.map(w => `- [${w.state}] ${w.project} / ${w.title} → ${w.next}`).join('\n') || '- none'}\n\n` +
    `## LAB\n${ideas.map(i => `- [${i.status}] ${i.title} — ${i.note || ''}`).join('\n') || '- none'}\n\n` +
    `## TRACE\n${traces.slice(0, 20).map(t => `- ${t.source} → ${t.decision} → ${t.owner} → ${t.implementation} [${t.state}]`).join('\n') || '- none'}\n\n` +
    `${MARKER_START}\n${JSON.stringify(packet)}\n${MARKER_END}\n`;
}

export function downloadHandoff(state, canonicalResult) {
  const packet = buildHandoffPacket(state, canonicalResult);
  const markdown = packetToMarkdown(packet);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const workTitle = state?.works?.[0]?.title || 'TAKY_MOBILE';
  anchor.href = url;
  anchor.download = `${safeFilename(workTitle)}_HANDOFF_${new Date().toISOString().slice(0,10)}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return packet;
}

export async function parseResumeFile(file) {
  const text = await file.text();
  const start = text.indexOf(MARKER_START);
  const end = text.indexOf(MARKER_END);
  if (start < 0 || end < 0 || end <= start) throw new Error('TAKY machine state marker not found');
  const json = text.slice(start + MARKER_START.length, end).trim();
  const packet = JSON.parse(json);
  if (packet?.schema !== 'TAKY_HANDOFF_V1' || !packet.state) throw new Error('unsupported handoff schema');
  return packet;
}

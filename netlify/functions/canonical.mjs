const DEFAULT_REPO = 'hns140412-glitch/TAKY';
const DEFAULT_REF = 'main';
const DEFAULT_FILES = [
  'TAKY.md',
  'MASTER/MASTER_LOGIC.md',
  'OS/COMMAND_INTERACTION.md',
  'OS/WORK_OS.md',
];

async function fetchGithubFile(repository, path, ref, token) {
  const url = `https://api.github.com/repos/${repository}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'TAKY-MOBILE',
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path}: GitHub ${response.status} ${body.slice(0, 160)}`);
  }
  const payload = await response.json();
  if (payload.type !== 'file' || !payload.content) throw new Error(`${path}: unsupported GitHub payload`);
  return {
    path,
    sha: payload.sha,
    content: Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8'),
  };
}

export const handler = async () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'GITHUB_TOKEN_NOT_CONFIGURED' }),
    };
  }

  const repository = process.env.TAKY_CANONICAL_REPO || DEFAULT_REPO;
  const ref = process.env.TAKY_CANONICAL_REF || DEFAULT_REF;
  const filePaths = process.env.TAKY_CANONICAL_FILES
    ? process.env.TAKY_CANONICAL_FILES.split(',').map(v => v.trim()).filter(Boolean)
    : DEFAULT_FILES;

  try {
    const files = await Promise.all(filePaths.map(path => fetchGithubFile(repository, path, ref, token)));
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=60',
      },
      body: JSON.stringify({
        ok: true,
        repository,
        ref,
        fetchedAt: new Date().toISOString(),
        files,
      }),
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: String(error) }),
    };
  }
};

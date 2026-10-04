import { $ } from 'bun';

/** Reasons the repository at `cwd` is not ready to release `tag`; empty when it is. */
export async function preflight(cwd: string, tag: string): Promise<string[]> {
  const git = (...args: string[]) => $`git -C ${cwd} ${args}`.quiet().nothrow();
  const problems: string[] = [];

  const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).text().trim();
  if (branch !== 'main') {
    problems.push(`releases are made from main, not ${branch}`);
  }
  if ((await git('status', '--porcelain')).text().trim()) {
    problems.push('there are uncommitted changes');
  }
  if ((await git('fetch', '--quiet', '--tags', 'origin')).exitCode !== 0) {
    // A stale origin/main could hide that main is behind; better to stop than to guess.
    problems.push('cannot fetch from origin');
    return problems;
  }
  const head = (await git('rev-parse', 'HEAD')).text().trim();
  const remote = (await git('rev-parse', 'origin/main')).text().trim();
  if (head !== remote) {
    problems.push('main differs from origin/main: pull or push first');
  }
  if ((await git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)).exitCode === 0) {
    problems.push(`tag ${tag} already exists`);
  }
  return problems;
}

/**
 * Commits `files` as the release, tags it and pushes both atomically. Preflight guaranteed a clean
 * tree, so when any step fails everything is rolled back to where it was and the error rethrown —
 * a rerun then starts from the same state instead of tripping over a local tag.
 */
export async function publish(
  cwd: string,
  tag: string,
  files: string[],
  gitArgs: string[] = [],
): Promise<void> {
  const message = `Release ${tag}`;
  const before = (await $`git -C ${cwd} rev-parse HEAD`.quiet().text()).trim();
  try {
    await $`git -C ${cwd} ${gitArgs} commit -q -m ${message} -- ${files}`.quiet();
    await $`git -C ${cwd} ${gitArgs} tag -a ${tag} -m ${message}`.quiet();
    await $`git -C ${cwd} push --atomic origin main ${tag}`.quiet();
  } catch (error) {
    await $`git -C ${cwd} tag -d ${tag}`.quiet().nothrow();
    await $`git -C ${cwd} reset -q --hard ${before}`.quiet().nothrow();
    throw error;
  }
}

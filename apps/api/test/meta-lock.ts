import { createPrismaClient } from '@torio/database';

/**
 * The platform-wide Meta configuration is one database row, so suites that depend on it (environment values vs. saved
 * values) must not overlap. An interactive transaction holding a Postgres advisory lock serializes them across test
 * workers: the lock is held until the returned release function is called.
 */
export async function lockMetaConfig(url: string) {
  const db = createPrismaClient(url);
  let unlock!: () => void;
  const held = new Promise<void>((r) => (unlock = r));
  let ready!: () => void;
  const acquired = new Promise<void>((r) => (ready = r));
  const tx = db.$transaction(
    async (t) => {
      await t.$executeRawUnsafe('select pg_advisory_xact_lock(7770001)');
      ready();
      await held;
    },
    { maxWait: 120_000, timeout: 300_000 },
  );
  await acquired;
  // Cleared on another connection, so the lock transaction never holds row locks the suite itself needs.
  await db.$executeRawUnsafe('delete from meta_configuration'); // each locked suite starts from "nothing saved"
  return async () => {
    unlock();
    await tx;
    await db.$executeRawUnsafe('delete from meta_configuration');
    await db.$disconnect();
  };
}

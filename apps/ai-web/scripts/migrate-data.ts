import { runDataMigrations } from "../src/lib/data-migrations";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const dataDir = arg("--data-dir");
  const backupDir = arg("--backup-dir");
  const dryRun = process.argv.includes("--dry-run");
  if (!dataDir) throw new Error("用法：tsx scripts/migrate-data.ts --data-dir <目录> [--backup-dir <目录>] [--dry-run]");
  const report = await runDataMigrations({ dataDir, dryRun, backupDir });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

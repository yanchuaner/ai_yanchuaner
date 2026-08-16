import path from "node:path";

// 服务启动钩子：配置错误与生产数据迁移在监听端口前完成，实现 fail-fast。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getAiWebConfig } = await import("@/lib/config");
  try {
    getAiWebConfig();
  } catch (error) {
    console.error(
      "[startup] AI Web 配置无效，拒绝启动：",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    const { runDataMigrations } = await import("@/lib/data-migrations");
    const dataDir = process.env.AI_WEB_DATA_DIR?.trim() || "/data";
    const backupDir = path.join(
      dataDir,
      ".migration-backups",
      new Date().toISOString().replace(/[:.]/g, "-"),
    );
    try {
      const report = await runDataMigrations({ dataDir, backupDir });
      if (report.changed > 0) {
        console.error(
          `[startup] 数据迁移完成：${report.changed} 个文件已升级（备份：${report.backupDir}）`,
        );
      }
    } catch (error) {
      console.error(
        "[startup] 数据迁移失败，拒绝启动：",
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }
}

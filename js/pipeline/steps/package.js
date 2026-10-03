// Étape « Paquet » : empaquetage web et évaluation de l'accessibilité.
import { buildWebPackage, storePackage, loadPackageFiles } from "../../packaging/web.js";
import { assessPackage, buildAssetMap, revokeAssetMap, DEFAULT_RUN_ONLY } from "../../a11y/assess.js";
import { nowIso } from "../../util.js";

export async function packageWeb(ctx) {
  const { storage, config } = ctx;
  const opts = ctx.options?.packageOptions ?? (await storage.getNodeData("package-options", "book")) ?? {};
  const result = await buildWebPackage(storage, { ...opts, onProgress: (msg, frac) => ctx.progress(Math.round(frac * 100), 100, msg) });
  await storePackage(storage, result.files);
  await storage.putNodeData("package-web", "book", { generatedAt: nowIso(), stats: result.stats, warnings: result.warnings, readingOrder: result.readingOrder, config: result.config, title: result.title });
  return { message: `${result.stats.pages} pages · ${result.stats.files} fichiers${result.warnings.length ? ` · ${result.warnings.length} avertissements` : ""}` };
}

export async function accessibilityAssessment(ctx) {
  const { storage, config } = ctx;
  const files = await loadPackageFiles(storage);
  if (!files.size) throw new Error("Aucun paquet à évaluer.");
  const a = config.accessibility_assessment ?? {};
  const map = buildAssetMap(files);
  try {
    const texts = {};
    const report = await assessPackage(files, { assetMap: map, runOnly: a.run_only_tags ?? DEFAULT_RUN_ONLY, disabledRules: a.disabled_rules ?? [], signal: ctx.signal, texts, onProgress: (c, t, href) => ctx.progress(c, t, href) });
    await storage.putNodeData("accessibility-assessment", "book", report);
    return { message: `${report.summary.violationCount} problèmes sur ${report.summary.pagesWithViolations}/${report.summary.pageCount} pages` };
  } finally { revokeAssetMap(map); }
}

export const packageSteps = { "package-web": packageWeb, "accessibility-assessment": accessibilityAssessment };

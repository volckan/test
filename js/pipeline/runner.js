// Exécuteur du pipeline : file d'exécutions, ordre des étapes selon le DAG,
// progression par sous-étape et par page, annulation, décisions en cas d'erreur de page.
import { PIPELINE, STAGE_BY_NAME, STAGE_ORDER, upstreamStages, downstreamStages } from "../pipeline.js";
import { BookStorage, bookEvents } from "../storage.js";
import { Emitter, nowIso } from "../util.js";
import { STEP_IMPLEMENTATIONS } from "./steps/index.js";

export const runEvents = new Emitter();

/** État en mémoire des exécutions en cours, par livre. */
const runs = new Map();
export function getRun(label) { return runs.get(label) ?? null; }
export function isRunning(label) { return !!runs.get(label)?.running; }

export class PageErrorDecision {
  constructor() { this.policy = "ask"; this.pending = null; }
  async ask(info) {
    if (this.policy === "skip") return "skip";
    if (this.policy === "stop") return "stop";
    return new Promise((resolve) => {
      this.pending = { info, resolve: (decision, applyToAll) => { if (applyToAll) this.policy = decision; this.pending = null; resolve(decision); } };
      runEvents.emit("page-error", { info, decision: this.pending });
    });
  }
}

/**
 * Lance les étapes de `fromStage` à `toStage` (inclus) pour un livre.
 * options : { onlySteps?: string[], renderOnly?, pageIds?: string[], force?: boolean, pageErrorPolicy: "ask"|"skip"|"stop" }
 */
export async function runStages(label, fromStage, toStage = fromStage, options = {}) {
  if (isRunning(label)) throw new Error("Une exécution est déjà en cours pour ce livre.");
  const storage = new BookStorage(label);
  const controller = new AbortController();
  const decision = new PageErrorDecision(); decision.policy = options.pageErrorPolicy ?? "ask";
  const fromIdx = STAGE_ORDER.indexOf(fromStage), toIdx = STAGE_ORDER.indexOf(toStage);
  if (fromIdx < 0 || toIdx < 0) throw new Error("Étape inconnue");
  // Étapes à exécuter : celles de l'intervalle qui sont `toStage` ou ses prérequis (transitifs) et ≥ fromStage.
  const wanted = new Set([toStage, ...upstreamStages(toStage)]);
  const stages = STAGE_ORDER.slice(fromIdx, toIdx + 1).filter((s) => wanted.has(s) || options.allStages);
  const run = { label, running: true, controller, decision, stages, currentStage: null, currentStep: null, progress: {}, startedAt: nowIso(), stepTimes: {}, errors: [] };
  runs.set(label, run);
  runEvents.emit("start", { label, stages });
  try {
    for (const stageName of stages) {
      if (controller.signal.aborted) break;
      run.currentStage = stageName;
      runEvents.emit("stage-start", { label, stage: stageName });
      await runStage(storage, stageName, run, options);
      runEvents.emit("stage-complete", { label, stage: stageName });
    }
  } catch (e) {
    run.errors.push(String(e?.message ?? e));
    if (e?.name !== "AbortError") { console.error(e); runEvents.emit("error", { label, stage: run.currentStage, step: run.currentStep, message: e.message }); }
  } finally {
    run.running = false; run.completedAt = nowIso();
    runs.delete(label);
    runEvents.emit("complete", { label, aborted: controller.signal.aborted, errors: run.errors, stages });
    bookEvents.emit("book-updated", { label });
  }
  return run;
}

export function cancelRun(label) { const r = runs.get(label); if (r) { r.controller.abort(new DOMException("Annulé par l'utilisateur", "AbortError")); runEvents.emit("cancelling", { label }); } }

/** Ordonnancement topologique des sous-étapes d'une étape (avec exécution parallèle des indépendantes). */
function orderSteps(stage) {
  const done = new Set(); const waves = [];
  let remaining = stage.steps.slice();
  while (remaining.length) {
    const ready = remaining.filter((s) => (s.dependsOn ?? []).every((d) => done.has(d)));
    if (!ready.length) throw new Error(`Dépendances circulaires dans l'étape ${stage.name}`);
    waves.push(ready); ready.forEach((s) => done.add(s.name)); remaining = remaining.filter((s) => !ready.includes(s));
  }
  return waves;
}

async function runStage(storage, stageName, run, options) {
  const stage = STAGE_BY_NAME[stageName];
  const config = await storage.effectiveConfig();
  const waves = orderSteps(stage);
  for (const wave of waves) {
    const steps = wave.filter((s) => !options.onlySteps || options.onlySteps.includes(s.name));
    // les sous-étapes d'une même vague sont séquentielles ici (le parallélisme interne est par page)
    for (const step of steps) {
      if (run.controller.signal.aborted) throw new DOMException("Annulé", "AbortError");
      await runStep(storage, step, config, run, options);
    }
  }
}

export async function runStep(storage, step, config, run, options = {}) {
  const impl = STEP_IMPLEMENTATIONS[step.name];
  if (!impl) { await storage.setStepRun(step.name, { status: "skipped", message: "Non implémenté", completedAt: nowIso() }); return; }
  run.currentStep = step.name;
  const t0 = Date.now();
  await storage.setStepRun(step.name, { status: "running", startedAt: nowIso(), completedAt: null, error: null, message: null });
  runEvents.emit("step-start", { label: storage.label, step: step.name });
  const ctx = {
    storage, config, label: storage.label, signal: run.controller.signal, options,
    progress: (current, total, message) => { run.progress[step.name] = { current, total, message }; runEvents.emit("step-progress", { label: storage.label, step: step.name, current, total, message }); },
    onPageError: async (pageId, error) => {
      console.warn(`Erreur page ${pageId} dans ${step.name}`, error);
      const d = await run.decision.ask({ label: storage.label, step: step.name, pageId, message: error?.message ?? String(error) });
      if (d === "stop") throw error instanceof Error ? error : new Error(String(error));
      return "skip";
    },
  };
  try {
    const result = await impl(ctx);
    if (result?.skipped) { await storage.setStepRun(step.name, { status: "skipped", completedAt: nowIso(), message: result.message ?? "Ignoré", durationMs: Date.now() - t0 }); runEvents.emit("step-skipped", { label: storage.label, step: step.name, message: result.message }); return; }
    await storage.setStepRun(step.name, { status: "done", completedAt: nowIso(), message: result?.message ?? null, durationMs: Date.now() - t0 });
    runEvents.emit("step-complete", { label: storage.label, step: step.name, message: result?.message });
  } catch (e) {
    if (e?.name === "AbortError") { await storage.setStepRun(step.name, { status: "error", completedAt: nowIso(), error: "Annulé", durationMs: Date.now() - t0 }); throw e; }
    await storage.setStepRun(step.name, { status: "error", completedAt: nowIso(), error: e?.message ?? String(e), durationMs: Date.now() - t0 });
    runEvents.emit("step-error", { label: storage.label, step: step.name, message: e?.message ?? String(e) });
    throw e;
  }
}

/** Statut agrégé par étape à partir des exécutions de sous-étapes. */
export function stageStatuses(stepRuns, run) {
  const out = {};
  for (const stage of PIPELINE) {
    const rs = stage.steps.map((s) => stepRuns[s.name]).filter(Boolean);
    let status = "not-started";
    if (run?.running && run.currentStage === stage.name) status = "running";
    else if (run?.running && run.stages.includes(stage.name) && run.stages.indexOf(stage.name) > run.stages.indexOf(run.currentStage)) status = "queued";
    else if (rs.some((r) => r.status === "error")) status = "error";
    else if (rs.length && stage.steps.every((s) => ["done", "skipped"].includes(stepRuns[s.name]?.status)) && rs.some((r) => r.status === "done")) status = "done";
    else if (rs.some((r) => r.status === "done")) status = "partial";
    const durationMs = rs.reduce((a, r) => a + (r.durationMs ?? 0), 0);
    const lastCompleted = rs.map((r) => r.completedAt).filter(Boolean).sort().pop() ?? null;
    out[stage.name] = { status, durationMs, lastCompleted, steps: Object.fromEntries(stage.steps.map((s) => [s.name, stepRuns[s.name] ?? null])) };
  }
  return out;
}

/** Invalide (marque « à mettre à jour ») les étapes en aval d'une étape modifiée. */
export async function invalidateDownstream(label, stageName) {
  const storage = new BookStorage(label);
  const runs = await storage.getStepRuns();
  for (const st of downstreamStages(stageName)) for (const step of STAGE_BY_NAME[st].steps) if (runs[step.name]?.status === "done") await storage.setStepRun(step.name, { status: "stale" });
}

export const STATUS_LABELS = { "not-started": "Non démarré", running: "En cours", queued: "En file d'attente", done: "Terminé", error: "Échoué", partial: "Partiel", stale: "À mettre à jour", skipped: "Ignoré" };

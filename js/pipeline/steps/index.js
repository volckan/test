import { extractSteps } from "./extract.js";
import { sectioningSteps } from "./sectioning.js";
import { renderingSteps } from "./rendering.js";
import { enrichSteps } from "./enrich.js";
import { translateSteps } from "./translate.js";
import { speechSteps } from "./speech.js";
import { packageSteps } from "./package.js";

export const STEP_IMPLEMENTATIONS = { ...extractSteps, ...sectioningSteps, ...renderingSteps, ...enrichSteps, ...translateSteps, ...speechSteps, ...packageSteps };

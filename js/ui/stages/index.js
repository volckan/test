import { renderBook } from "./book.js";
import { renderExtract } from "./extract.js";
import { renderSectioning } from "./sectioning.js";
import { renderStoryboard } from "./storyboard.js";
import { renderCaptions, renderQuizzes, renderGlossary, renderToc, renderEasyRead } from "./enrich.js";
import { renderTranslate, renderSpeech } from "./localization.js";
import { renderSignLanguage, renderValidation, renderPreview, renderExport } from "./publish.js";

export const STAGE_VIEWS = { book: renderBook, extract: renderExtract, sectioning: renderSectioning, storyboard: renderStoryboard, captions: renderCaptions, quizzes: renderQuizzes, glossary: renderGlossary, toc: renderToc, "easy-read": renderEasyRead, translate: renderTranslate, speech: renderSpeech, "sign-language": renderSignLanguage, validation: renderValidation, preview: renderPreview, export: renderExport };

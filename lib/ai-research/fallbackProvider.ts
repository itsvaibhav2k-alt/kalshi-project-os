/**
 * Deterministic local fallback provider for advisory AI research drafts
 * (Phase 5). Pure data-in/data-out templating over the supplied dossier and
 * research state: no clock (timestamps are injected), no randomness, no
 * network, no environment reads, no filesystem.
 *
 * Facts policy (binding): nothing is invented. Every statement derives from
 * the dossier or persisted research state, and every absent input is labeled
 * missing — never filled in. Output is advisory draft material outside the
 * deterministic risk path; it never satisfies a risk check and never
 * approves a paper decision.
 */

import type {
  AiResearchDraftInput,
  AiResearchDraftResult,
  AiResearchProvider,
} from './types';
import { DRAFT_SECTIONS, DRAFT_TYPE_LABELS, PROMPT_VERSION } from './prompts';

/** Provider label recorded on every fallback-generated draft. */
export const FALLBACK_PROVIDER_NAME = 'local_deterministic';

/** Model label recorded on every fallback-generated draft. */
export const FALLBACK_MODEL_NAME = 'phase5_fallback';

/** Advisory banner rendered at the top of every fallback draft. */
const ADVISORY_NOTE =
  'Advisory draft only — outside the deterministic risk path. ' +
  'This draft never satisfies a risk check and never approves a paper decision. ' +
  'Human review is required before any of it is used in research.';

/** Heading used to echo human-entered focus text as context, never as fact. */
const REQUESTED_FOCUS_HEADING = 'Requested focus';

/** Formats a fraction in [0, 1] as a percentage string. */
function formatPercent(fraction: number | null): string {
  return fraction === null ? 'missing' : `${(fraction * 100).toFixed(1)}%`;
}

/** Formats an integer cents value, labeling absent values as missing. */
function formatCents(value: number | null): string {
  return value === null ? 'missing' : `${value} cents`;
}

/** Formats a plain number, labeling absent values as missing. */
function formatCount(value: number | null): string {
  return value === null ? 'missing' : String(value);
}

/**
 * One-line summaries of the persisted/derived state, computed once per draft
 * and reused across section generators so every kind reports the same facts.
 */
interface StateDigest {
  verdictLine: string;
  settlementLine: string;
  clarityLine: string;
  ambiguityLine: string;
  sourcesLine: string;
  briefLine: string;
  fairLine: string;
  thesisLine: string;
  impliedLine: string;
  microLine: string;
  blockerLines: readonly string[];
  missingLines: readonly string[];
}

/** Builds the shared state digest from the dossier and research state only. */
function buildStateDigest(input: AiResearchDraftInput): StateDigest {
  const { dossier, researchState } = input;
  const { understanding, riskEvaluation, probabilityEstimate, market } = dossier;
  const summary = researchState.summary;

  const settlementLine =
    understanding.settlementSourceStatus === 'provided'
      ? 'Settlement verification: a human-verified settlement record is on file.'
      : understanding.settlementSourceStatus === 'unverified'
        ? 'Settlement verification: the listed settlement text is unverified — ' +
          'no human-verified settlement record is on file.'
        : 'Settlement verification: missing — no settlement source is listed and ' +
          'no human-verified settlement record is on file.';

  const clarityLine =
    understanding.resolutionClarity === 'clear'
      ? 'Resolution clarity: clear, per the deterministic contract reading.'
      : understanding.resolutionClarity === 'ambiguous'
        ? 'Resolution clarity: ambiguous — ambiguous resolution = SKIP.'
        : 'Resolution clarity: missing — resolution terms were not provided.';

  const ambiguityLine =
    understanding.ambiguityFlags.length > 0
      ? `Ambiguity flags: ${understanding.ambiguityFlags.join('; ')}.`
      : 'Ambiguity flags: none derived from the listed terms.';

  const sourcesLine =
    summary.acceptedSourceCount === 0
      ? 'Accepted sources: none — no source = low confidence.'
      : `Accepted sources: ${summary.acceptedSourceCount} on file.`;

  const briefLine = summary.hasHumanReviewedBrief
    ? 'Research brief: a human-reviewed brief is on file.'
    : 'Research brief: missing — no human-reviewed brief exists yet.';

  const fairLine =
    probabilityEstimate.fairProbabilityMid !== null
      ? 'Fair probability range (human-entered, advisory): ' +
        `${formatPercent(probabilityEstimate.fairProbabilityLow)} / ` +
        `${formatPercent(probabilityEstimate.fairProbabilityMid)} / ` +
        `${formatPercent(probabilityEstimate.fairProbabilityHigh)}.`
      : 'Fair probability range: missing — no honest edge can be measured.';

  const thesisLine = summary.hasReadyThesis
    ? 'Written thesis: a ready-for-risk thesis is on file.'
    : researchState.thesis !== null
      ? 'Written thesis: a thesis exists but is not currently ready for risk.'
      : 'Written thesis: missing — no thesis has been written.';

  const impliedLine =
    probabilityEstimate.marketImpliedProbability !== null
      ? `Market-implied probability: ${formatPercent(probabilityEstimate.marketImpliedProbability)}.`
      : 'Market-implied probability: missing — listed prices did not provide one.';

  const microLine =
    `Microstructure: YES ask ${formatCents(market.yesAskCents)}; ` +
    `YES bid ${formatCents(market.yesBidCents)}; ` +
    `spread ${formatCents(market.spreadCents)}; ` +
    `liquidity ${market.liquidityDollars === null ? 'missing' : `$${market.liquidityDollars}`}; ` +
    `volume ${formatCount(market.volume)}; open interest ${formatCount(market.openInterest)}.`;

  const blockerLines =
    riskEvaluation.reasons.length > 0
      ? riskEvaluation.reasons.map((reason) => `Risk blocker (resolve via human research): ${reason}`)
      : ['No risk blockers reported — every deterministic check passed.'];

  const missingLines: string[] = [];
  if (understanding.settlementSourceStatus !== 'provided') {
    missingLines.push('Missing evidence: human-verified settlement record.');
  }
  if (summary.acceptedSourceCount === 0) {
    missingLines.push('Missing evidence: accepted research sources (no source = low confidence).');
  }
  if (!summary.hasHumanReviewedBrief) {
    missingLines.push('Missing evidence: human-reviewed research brief.');
  }
  if (probabilityEstimate.fairProbabilityMid === null) {
    missingLines.push(
      'Missing evidence: human-entered fair probability range — no honest edge can be measured.',
    );
  }
  if (!summary.hasReadyThesis) {
    missingLines.push('Missing evidence: ready-for-risk written thesis.');
  }
  if (market.yesAskCents === null) {
    missingLines.push('Missing evidence: current YES ask price.');
  }
  for (const field of understanding.missingFields) {
    missingLines.push(`Missing market field: ${field}.`);
  }
  if (missingLines.length === 0) {
    missingLines.push('No tracked research input is missing.');
  }

  return {
    verdictLine:
      'Deterministic risk verdict (advisory mirror; issued by the rules engine alone): ' +
      `${riskEvaluation.verdict}.`,
    settlementLine,
    clarityLine,
    ambiguityLine,
    sourcesLine,
    briefLine,
    fairLine,
    thesisLine,
    impliedLine,
    microLine,
    blockerLines,
    missingLines,
  };
}

/** Section bodies, aligned one-to-one with DRAFT_SECTIONS for the kind. */
type SectionBodies = readonly (readonly string[])[];

/** Generates section bodies for the research_questions kind. */
function researchQuestionsBodies(input: AiResearchDraftInput, d: StateDigest): SectionBodies {
  const { understanding, market } = input.dossier;
  return [
    [
      `- Listed YES condition: "${understanding.yesCondition}"`,
      `- Listed NO condition: "${understanding.noCondition}"`,
      `- ${d.clarityLine}`,
      '- Does the listed wording cover every boundary outcome, and who decides disputes?',
    ],
    [
      `- ${d.settlementLine}`,
      understanding.settlementSource !== null
        ? `- Listed settlement text: "${understanding.settlementSource}"`
        : '- Listed settlement text: missing.',
      '- Which named authority publishes the resolving value, and can a human verify it directly?',
    ],
    [
      `- ${d.ambiguityLine}`,
      '- Are the measured quantity, the measurement date, and the revision policy all unambiguous?',
    ],
    [
      '- The dossier records no base-rate data; a human must gather and verify any historical evidence.',
      '- How often has a comparable outcome occurred historically, per a citable source?',
    ],
    [
      `- ${d.microLine}`,
      '- Could the spread or thin liquidity erase any measured edge at these prices?',
    ],
    d.missingLines.map((line) => `- ${line}`),
    [
      ...d.blockerLines.map((line) => `- ${line}`),
      '- Default verdict is SKIP; any unresolved blocker above keeps it there.',
      `- Close time on file: ${market.closeTime ?? 'missing'}.`,
    ],
  ];
}

/** Generates section bodies for the source_checklist kind. */
function sourceChecklistBodies(input: AiResearchDraftInput, d: StateDigest): SectionBodies {
  const { market } = input.dossier;
  return [
    [
      `- [ ] Find and human-verify the official settlement authority. ${d.settlementLine}`,
      '- Any suggested target is a target to verify, not evidence.',
    ],
    [
      `- [ ] Find a primary data source that supports or contradicts the YES condition. ${d.sourcesLine}`,
    ],
    [
      '- [ ] Find a historical / base-rate source. The dossier records none; label it missing until a human verifies it.',
    ],
    ['- [ ] Find at least one credible source that argues against the current working view.'],
    [`- [ ] Find a source that settles each ambiguity flag. ${d.ambiguityLine}`],
    [
      `- [ ] Confirm every source is current relative to the close time (${market.closeTime ?? 'missing'}).`,
    ],
  ];
}

/** Generates section bodies for the brief_draft kind. */
function briefDraftBodies(input: AiResearchDraftInput, d: StateDigest): SectionBodies {
  const { understanding, probabilityEstimate } = input.dossier;
  const { researchState } = input;
  const brief = researchState.brief;
  const acceptedSources = researchState.sources.filter((source) => source.status === 'accepted');

  return [
    [
      understanding.summary,
      '',
      'This is an advisory draft for human review; it never becomes a reviewed brief automatically.',
    ],
    [
      `Listed YES condition: "${understanding.yesCondition}"`,
      brief !== null && brief.yesCase !== null
        ? `Human-entered YES case on file: "${brief.yesCase}"`
        : 'Missing: no human-entered YES case is recorded. Nothing further can be stated without inventing facts.',
    ],
    [
      `Listed NO condition: "${understanding.noCondition}"`,
      brief !== null && brief.noCase !== null
        ? `Human-entered NO case on file: "${brief.noCase}"`
        : 'Missing: no human-entered NO case is recorded. Nothing further can be stated without inventing facts.',
    ],
    acceptedSources.length > 0
      ? acceptedSources.map(
          (source) => `- ${source.title} (${source.publisher ?? 'publisher missing'})`,
        )
      : ['Missing: no accepted sources are on file — no source = low confidence.'],
    [
      `- ${d.ambiguityLine}`,
      ...probabilityEstimate.uncertaintyNotes.map((note) => `- ${note}`),
    ],
    d.missingLines.map((line) => `- ${line}`),
    [
      `Recorded research confidence: ${researchState.summary.researchConfidence}.`,
      'A human review may lower this; it must never be raised without verified sources.',
      `${d.sourcesLine}`,
    ],
  ];
}

/** Generates section bodies for the thesis_critique kind. */
function thesisCritiqueBodies(input: AiResearchDraftInput, d: StateDigest): SectionBodies {
  const { probabilityEstimate } = input.dossier;
  const thesis = input.researchState.thesis;

  if (thesis === null) {
    return [
      [
        'No written thesis exists for this market. Thesis-building questions follow instead of a critique.',
        '- What single claim would the thesis make, and which verified source would support it?',
      ],
      ['- What assumption would the thesis rest on, and what evidence could show it is wrong?'],
      [`- ${d.sourcesLine}`, '- Which still-missing source matters most for the claim?'],
      [`- ${d.ambiguityLine}`, `- ${d.clarityLine}`],
      [
        `- ${d.fairLine}`,
        '- What fair probability range would the human defend, and from what evidence?',
      ],
      [`- ${d.sourcesLine}`, '- Confidence stays low until accepted sources exist.'],
      ['- What observable, dated event would falsify the thesis before close?'],
      [
        '- Write the thesis in the thesis panel only after the questions above have sourced answers.',
        `- ${d.thesisLine}`,
      ],
    ];
  }

  const edgeLine =
    probabilityEstimate.expectedEdge !== null
      ? `Expected edge: ${(probabilityEstimate.expectedEdge * 100).toFixed(1)} cents before spread and fees, ` +
        'derived entirely from the human-entered fair range.'
      : d.fairLine;

  return [
    [
      `The stored thesis reads: "${thesis.thesis}"`,
      'Its strongest element is whatever a verified source directly supports; check each claim ' +
        'against the accepted source list before relying on it.',
    ],
    [
      thesis.whyMispriced !== null
        ? `Stored mispricing rationale: "${thesis.whyMispriced}" — verify the evidence behind this; ` +
          'an unsourced rationale is the weakest assumption.'
        : 'Missing: the thesis records no mispricing rationale — that gap is its weakest assumption.',
    ],
    [
      `- ${d.sourcesLine}`,
      '- Every thesis claim without a matching accepted source is unsupported.',
    ],
    [`- ${d.ambiguityLine}`, `- ${d.clarityLine}`, `- ${d.settlementLine}`],
    [`- ${edgeLine}`, `- ${d.impliedLine}`, `- ${d.microLine}`],
    [
      `- Recorded research confidence: ${input.researchState.summary.researchConfidence}.`,
      '- Confidence must trace to accepted sources; no source = low confidence.',
    ],
    [
      thesis.invalidationCriteria !== null
        ? `Stored invalidation criteria: "${thesis.invalidationCriteria}" — is this observable and dated before close?`
        : 'Missing: no invalidation criteria are recorded. A thesis without a falsification test is not ready.',
    ],
    d.missingLines.map((line) => `- Address: ${line}`),
  ];
}

/** Generates section bodies for the missing_info kind. */
function missingInfoBodies(_input: AiResearchDraftInput, d: StateDigest): SectionBodies {
  const nextSteps =
    d.missingLines[0] === 'No tracked research input is missing.'
      ? ['- No tracked input is missing; re-verify existing records for freshness before any paper decision.']
      : d.missingLines.map((line) => `- Verification step: resolve "${line}" via human research.`);

  return [
    [
      `- ${d.verdictLine}`,
      `- ${d.settlementLine}`,
      `- ${d.clarityLine}`,
      `- ${d.sourcesLine}`,
      `- ${d.briefLine}`,
      `- ${d.fairLine}`,
      `- ${d.thesisLine}`,
    ],
    d.missingLines.map((line) => `- ${line}`),
    [
      ...d.blockerLines.map((line) => `- ${line}`),
      '- These mirror deterministic checks for reading only; resolving them is human research work.',
    ],
    nextSteps,
  ];
}

/** Generates section bodies for the skeptical_countercase kind. */
function skepticalCountercaseBodies(input: AiResearchDraftInput, d: StateDigest): SectionBodies {
  const { probabilityEstimate, riskEvaluation } = input.dossier;
  const thesis = input.researchState.thesis;

  const edgeBody =
    probabilityEstimate.expectedEdge !== null
      ? [
          `Measured expected edge is ${(probabilityEstimate.expectedEdge * 100).toFixed(1)} cents ` +
            'before spread and fees, and it depends entirely on the human-entered fair range. ' +
            'If those inputs are stale or unsourced, the edge is an artifact.',
        ]
      : [
          'No fair probability range exists, so no honest edge can be measured — ' +
            'any perceived edge is currently unmeasured.',
        ];

  const skipBody =
    riskEvaluation.verdict === 'PAPER_TRADE'
      ? [
          '- Even with a PAPER_TRADE verdict, this stays a paper decision; these skeptical checks ' +
            'still apply before any paper journal entry.',
          '- Default verdict is SKIP; eligibility can decay the moment any input decays.',
        ]
      : [
          ...d.blockerLines.map((line) => `- ${line}`),
          '- Default verdict is SKIP; nothing above argues against keeping it.',
        ];

  return [
    edgeBody,
    [
      `${d.impliedLine}`,
      'Listed prices may already reflect every public fact in this dossier; what verified ' +
        'evidence is not already priced in?',
    ],
    [`- ${d.ambiguityLine}`, `- ${d.clarityLine}`, `- ${d.settlementLine}`],
    [
      `- ${d.microLine}`,
      '- A wide spread or thin liquidity can erase a small measured edge entirely.',
    ],
    [
      thesis !== null && thesis.invalidationCriteria !== null
        ? `- Stored invalidation criteria: "${thesis.invalidationCriteria}"`
        : '- Missing: no invalidation criteria are recorded.',
      '- Identify the single observable fact that would flip the current view.',
    ],
    skipBody,
  ];
}

/** Body generators per draft kind, aligned with DRAFT_SECTIONS. */
const BODY_GENERATORS: Record<
  AiResearchDraftInput['draftType'],
  (input: AiResearchDraftInput, digest: StateDigest) => SectionBodies
> = {
  research_questions: researchQuestionsBodies,
  source_checklist: sourceChecklistBodies,
  brief_draft: briefDraftBodies,
  thesis_critique: thesisCritiqueBodies,
  missing_info: missingInfoBodies,
  skeptical_countercase: skepticalCountercaseBodies,
};

/** Renders the full markdown draft for one input. */
function renderDraft(input: AiResearchDraftInput): string {
  const digest = buildStateDigest(input);
  const headings = DRAFT_SECTIONS[input.draftType];
  const bodies = BODY_GENERATORS[input.draftType](input, digest);
  if (bodies.length !== headings.length) {
    throw new Error(
      `fallback generator for '${input.draftType}' produced ${bodies.length} sections; expected ${headings.length}`,
    );
  }

  const lines: string[] = [
    `# Advisory draft — ${DRAFT_TYPE_LABELS[input.draftType]}`,
    '',
    ADVISORY_NOTE,
    '',
    `Market: ${input.dossier.market.title}`,
    `Generated ${input.nowIso} by ${FALLBACK_PROVIDER_NAME}/${FALLBACK_MODEL_NAME} (${PROMPT_VERSION}).`,
  ];

  const focus = input.userFocus !== null ? input.userFocus.trim() : '';
  if (focus.length > 0) {
    lines.push('', `## ${REQUESTED_FOCUS_HEADING}`, '', `Human-entered context (not a verified fact): "${focus}"`);
  }

  lines.push('', '## Dossier state (read-only inputs)', '');
  lines.push(
    `- ${digest.verdictLine}`,
    `- ${digest.settlementLine}`,
    `- ${digest.clarityLine}`,
    `- ${digest.sourcesLine}`,
    `- ${digest.briefLine}`,
    `- ${digest.fairLine}`,
    `- ${digest.thesisLine}`,
    `- ${digest.impliedLine}`,
  );

  headings.forEach((heading, index) => {
    lines.push('', `## ${heading}`, '', ...bodies[index]);
  });

  return lines.join('\n');
}

/**
 * Creates the deterministic local fallback provider. Identical inputs always
 * produce identical drafts; the result resolves synchronously.
 *
 * @returns A provider whose drafts are labeled local_deterministic / phase5_fallback.
 */
export function createFallbackProvider(): AiResearchProvider {
  return {
    generateDraft(input: AiResearchDraftInput): Promise<AiResearchDraftResult> {
      return Promise.resolve({
        provider: FALLBACK_PROVIDER_NAME,
        model: FALLBACK_MODEL_NAME,
        promptVersion: PROMPT_VERSION,
        outputMarkdown: renderDraft(input),
        outputJson: null,
      });
    },
  };
}
